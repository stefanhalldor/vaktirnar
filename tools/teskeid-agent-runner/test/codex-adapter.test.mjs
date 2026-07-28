import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  AdapterError,
  READ_ONLY_DEVELOPER_INSTRUCTIONS,
  buildCodexChildEnv,
  buildCodexArgs,
  executeCodex,
  parseCodexEvent,
  runVersion,
} from "../src/adapters/codex.mjs";
import { MAX_RESULT_CHARS } from "../src/constants.mjs";

test("new Codex runs have immutable read-only global controls", () => {
  const args = buildCodexArgs({ cwd: "C:\\workspace" });

  assert.deepEqual(args, [
    "-a",
    "never",
    "-s",
    "read-only",
    "-C",
    "C:\\workspace",
    "-c",
    'shell_environment_policy.inherit="core"',
    "-c",
    'web_search="disabled"',
    "-c",
    `developer_instructions=${JSON.stringify(READ_ONLY_DEVELOPER_INSTRUCTIONS)}`,
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "features.hooks=false",
    "-c",
    "features.apps=false",
    "-c",
    "features.multi_agent=false",
    "-c",
    'projects."C:\\\\workspace".trust_level="untrusted"',
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--json",
    "-",
  ]);
  assert.equal(args.includes("--search"), false);
  assert.equal(args.includes("danger-full-access"), false);
  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
});

test("Codex process env keeps OS/auth essentials and drops unrelated secrets", () => {
  const filtered = buildCodexChildEnv({
    PATH: "safe-path",
    USERPROFILE: "safe-home",
    CODEX_ACCESS_TOKEN: "provider-auth",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-pass",
    TESKEID_BRIDGE_TOKEN: "must-not-pass",
    AWS_SECRET_ACCESS_KEY: "must-not-pass",
  });

  assert.deepEqual(filtered, {
    PATH: "safe-path",
    USERPROFILE: "safe-home",
    CODEX_ACCESS_TOKEN: "provider-auth",
  });
});

test("resume keeps all read-only controls and uses a known in-memory thread", () => {
  const args = buildCodexArgs({
    cwd: "/workspace",
    threadId: "thread-opaque",
  });

  assert.deepEqual(args.slice(-7), [
    "exec",
    "resume",
    "--ignore-user-config",
    "--ignore-rules",
    "--json",
    "thread-opaque",
    "-",
  ]);
  assert.equal(args[args.indexOf("-s") + 1], "read-only");
  assert.equal(args[args.indexOf("-a") + 1], "never");
});

test("JSONL parser retains only thread id and bounded final agent message", () => {
  const state = { threadId: null, finalMessage: null };
  parseCodexEvent(
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    state,
  );
  parseCodexEvent(
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "a raw command that must not become a response",
      },
    }),
    state,
  );
  parseCodexEvent(
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "Safe final reply" },
    }),
    state,
  );

  assert.deepEqual(state, {
    threadId: "thread-1",
    finalMessage: "Safe final reply",
  });
});

test("malformed provider output becomes a fixed safe category", () => {
  assert.throws(
    () => parseCodexEvent("not json and possibly sensitive", {}),
    (error) =>
      error instanceof AdapterError && error.category === "adapter_invalid_output",
  );
});

test("an oversized final answer fails instead of silently truncating", () => {
  assert.throws(
    () => parseCodexEvent(
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "x".repeat(MAX_RESULT_CHARS + 1) },
      }),
      { threadId: null, finalMessage: null },
    ),
    (error) => error instanceof AdapterError && error.category === "adapter_output_too_large",
  );
});

function uncooperativeChild() {
  const child = new EventEmitter();
  child.pid = 424_242;
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  child.kill = () => true;
  return child;
}

test("a hung Codex version probe is force-killed and settles", {
  timeout: 1_000,
}, async () => {
  const child = uncooperativeChild();
  const terminations = [];

  await assert.rejects(
    () => runVersion("codex", () => child, {
      probeTimeoutMs: 5,
      terminationGraceMs: 5,
      terminateProcessTree: (_process, options) =>
        terminations.push(options.force),
    }),
    (error) =>
      error instanceof AdapterError && error.category === "adapter_unavailable",
  );
  assert.deepEqual(terminations, [false, true]);
});

test("cancellation force-kills an uncooperative process tree and settles", {
  timeout: 1_000,
}, async () => {
  const child = uncooperativeChild();
  const terminations = [];
  let spawnOptions;
  const controller = new AbortController();
  const pending = executeCodex({
    binary: "codex",
    cwd: "/workspace",
    prompt: "opaque prompt",
    threadId: null,
    signal: controller.signal,
    spawnImpl: (_binary, _args, options) => {
      spawnOptions = options;
      return child;
    },
    terminationGraceMs: 5,
    terminateProcessTree: (_process, options) => terminations.push(options.force),
  });

  controller.abort();

  await assert.rejects(
    () => pending,
    (error) =>
      error instanceof AdapterError && error.category === "adapter_aborted",
  );
  assert.deepEqual(terminations, [false, true]);
  assert.equal(spawnOptions.detached, process.platform !== "win32");
});

test("timeout force-kills an uncooperative process tree and settles", {
  timeout: 1_000,
}, async () => {
  const child = uncooperativeChild();
  const terminations = [];

  await assert.rejects(
    () => executeCodex({
      binary: "codex",
      cwd: "/workspace",
      prompt: "opaque prompt",
      threadId: null,
      spawnImpl: () => child,
      runTimeoutMs: 5,
      terminationGraceMs: 5,
      terminateProcessTree: (_process, options) => terminations.push(options.force),
    }),
    (error) =>
      error instanceof AdapterError &&
      error.category === "adapter_timeout" &&
      error.retryable === true,
  );
  assert.deepEqual(terminations, [false, true]);
});
