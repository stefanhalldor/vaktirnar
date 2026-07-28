import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCli } from "../src/cli-options.mjs";
import {
  createBackgroundProfileStore,
  resolveBackgroundPaths,
} from "../src/background/profile-store.mjs";
import { createBackgroundService } from "../src/background/service.mjs";
import { createWindowsDpapiCodec } from "../src/background/windows-dpapi.mjs";
import {
  WINDOWS_TASK_NAME,
  buildHiddenLauncher,
  buildTaskArguments,
  createWindowsTaskManager,
} from "../src/background/windows-task.mjs";

function fakeCodec(aclCalls = []) {
  return {
    async seal(value) {
      return Buffer.from(value, "utf8").toString("base64");
    },
    async open(value) {
      return Buffer.from(value, "base64").toString("utf8");
    },
    async restrictFileToCurrentUser(filePath) {
      aclCalls.push(filePath);
    },
  };
}

function credential() {
  return {
    accessToken: "connector-bearer-must-be-encrypted",
    connectorId: "connector-1",
    providerKey: "codex",
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    pollIntervalMs: 3_000,
  };
}

test("profile state encrypts connector credential and sessions and ACLs every file", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "teskeid-runner-profile-"));
  t.after(async () => {
    const store = createBackgroundProfileStore({
      codec: fakeCodec(),
      paths: resolveBackgroundPaths({ baseDirectory: temporaryRoot }),
    });
    await store.uninstallFiles();
  });
  const aclCalls = [];
  const paths = resolveBackgroundPaths({ baseDirectory: temporaryRoot });
  const store = createBackgroundProfileStore({ codec: fakeCodec(aclCalls), paths });

  await store.saveProfile({
    baseUrl: "https://www.teskeid.is",
    provider: "codex",
    cwd: "C:\\private\\workspace",
    codexBin: null,
  });
  await store.writeLauncher("safe launcher without credentials");
  await store.saveCredential(credential());
  await store.createSessionStore().set("conversation-opaque", "thread-opaque");

  const sealed = await readFile(paths.privateState, "utf8");
  assert.equal(sealed.includes("connector-bearer-must-be-encrypted"), false);
  assert.equal(sealed.includes("conversation-opaque"), false);
  assert.equal(sealed.includes("thread-opaque"), false);
  assert.equal(aclCalls.length, 4);
  assert.equal(aclCalls.every((value) => value.endsWith(".tmp")), true);

  const restarted = createBackgroundProfileStore({ codec: fakeCodec(), paths });
  assert.deepEqual(await restarted.loadCredential(), credential());
  assert.equal(
    await restarted.createSessionStore().get("conversation-opaque"),
    "thread-opaque",
  );
});

test("an ACL failure is fail-closed and leaves neither destination nor temp file", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "teskeid-runner-acl-"));
  const paths = resolveBackgroundPaths({ baseDirectory: temporaryRoot });
  const store = createBackgroundProfileStore({
    paths,
    codec: {
      ...fakeCodec(),
      async restrictFileToCurrentUser() {
        throw new Error("private ACL detail");
      },
    },
  });
  t.after(async () => {
    await createBackgroundProfileStore({ codec: fakeCodec(), paths }).uninstallFiles();
  });

  await assert.rejects(() => store.saveProfile({
    baseUrl: "https://www.teskeid.is",
    provider: "codex",
    cwd: "C:\\workspace",
    codexBin: null,
  }));
  await assert.rejects(() => stat(paths.profile), (error) => error?.code === "ENOENT");
  assert.deepEqual(await readdir(paths.directory), []);
});

test("Windows launcher and scheduled-task commands contain no credential material", () => {
  const launcher = buildHiddenLauncher({
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    runnerBinPath: "C:\\Teskeid\\runner\\bin\\teskeid-agent-runner.mjs",
  });
  assert.match(launcher, / background run"/u);
  assert.match(launcher, /, 0, True/u);
  assert.doesNotMatch(launcher, /code|token|secret|credential/iu);

  const args = buildTaskArguments({
    action: "install",
    launcherPath: "C:\\Users\\Person\\AppData\\Local\\Teskeid\\AgentRunner\\launch-hidden.vbs",
    windowsDirectory: "C:\\Windows",
  });
  assert.deepEqual(args.slice(0, 3), ["/Create", "/TN", WINDOWS_TASK_NAME]);
  assert.equal(args.includes("ONLOGON"), true);
  assert.equal(args.includes("LIMITED"), true);
  assert.equal(args.includes("/F"), false);
  assert.equal(args.join(" ").includes("connector-bearer"), false);
});

test("Windows task lifecycle executes only the explicitly requested action", async () => {
  const calls = [];
  const task = createWindowsTaskManager({
    platform: "win32",
    windowsDirectory: "C:\\Windows",
    execute: async (file, args, options) => {
      calls.push({ file, args, options });
      return { code: 0 };
    },
  });

  await task.install("C:\\Teskeid\\AgentRunner\\launch-hidden.vbs");
  await task.start();
  assert.equal(await task.isInstalled(), true);
  await task.stop();
  await task.uninstall();

  assert.deepEqual(
    calls.map((call) => call.args[0]),
    ["/Create", "/Run", "/Query", "/End", "/Delete"],
  );
  assert.equal(
    calls.every((call) => call.file === "C:\\Windows\\System32\\schtasks.exe"),
    true,
  );
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.equal(calls.every((call) => call.options.windowsHide === true), true);
});

function dpapiChild(output, capture) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = (input) => {
    capture.input = input;
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(output));
      child.emit("close", 0);
    });
  };
  child.kill = () => true;
  return child;
}

test("DPAPI passes plaintext only over stdin and runs hidden without a shell", async () => {
  const capture = {};
  const codec = createWindowsDpapiCodec({
    platform: "win32",
    envSource: { WINDIR: "C:\\Windows", PATH: "safe" },
    spawnImpl: (file, args, options) => {
      capture.file = file;
      capture.args = args;
      capture.options = options;
      return dpapiChild("c2VhbGVk", capture);
    },
  });

  assert.equal(await codec.seal("connector-bearer-private"), "c2VhbGVk");
  assert.equal(capture.input, "connector-bearer-private");
  assert.equal(capture.args.join(" ").includes("connector-bearer-private"), false);
  const commandIndex = capture.args.indexOf("-Command");
  const script = capture.args.at(commandIndex + 1);
  assert.notEqual(commandIndex, -1);
  assert.match(script, /Add-Type -AssemblyName System\.Security/u);
  assert.match(
    script,
    /DataProtectionScope\]::CurrentUser/u,
  );
  assert.equal(
    capture.file,
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  );
  assert.equal(capture.options.shell, false);
  assert.equal(capture.options.windowsHide, true);
});

test("background start pairs once, persists through the sink, then starts without a new code", async () => {
  const calls = [];
  let savedCredential = null;
  const profile = {
    baseUrl: "https://www.teskeid.is",
    provider: "codex",
    cwd: "C:\\workspace",
    codexBin: null,
  };
  const store = {
    paths: { launcher: "C:\\Teskeid\\AgentRunner\\launch-hidden.vbs" },
    loadProfile: async () => profile,
    loadCredential: async () => savedCredential,
    saveCredential: async (value) => { savedCredential = value; },
  };
  const taskManager = {
    isInstalled: async () => true,
    start: async () => calls.push("task-start"),
  };
  const bridge = {
    async pair({ code, provider, credentialSink }) {
      calls.push({ code, provider });
      await credentialSink(credential());
      return credential();
    },
    disconnect() { calls.push("disconnect"); },
  };
  const service = createBackgroundService({
    store,
    taskManager,
    bridgeFactory: () => bridge,
  });

  await service.start({ code: "one-time-pairing-code" });
  await service.start({});

  assert.deepEqual(calls, [
    { code: "one-time-pairing-code", provider: "codex" },
    "disconnect",
    "task-start",
    "task-start",
  ]);
  assert.equal(savedCredential.accessToken, "connector-bearer-must-be-encrypted");
});

test("background install rolls back its exact local profile when task creation fails", async () => {
  const calls = [];
  const store = {
    paths: { launcher: "C:\\Teskeid\\AgentRunner\\launch-hidden.vbs" },
    isPresent: async () => false,
    saveProfile: async () => calls.push("profile"),
    writeLauncher: async () => calls.push("launcher"),
    uninstallFiles: async () => calls.push("files-removed"),
  };
  const taskManager = {
    isInstalled: async () => false,
    install: async () => {
      calls.push("task-install");
      throw Object.assign(new Error(), { category: "background_task_failed" });
    },
    uninstall: async () => calls.push("task-removed"),
  };
  const service = createBackgroundService({
    store,
    taskManager,
    adapterFactory: async () => ({
      provider: "codex",
      version: "codex-cli 1.0",
      async run() { return { text: "unused" }; },
      clear() { calls.push("adapter-clear"); },
    }),
    bridgeFactory: () => ({ disconnect() { calls.push("bridge-disconnect"); } }),
  });

  await assert.rejects(
    () => service.install({
      baseUrl: "https://www.teskeid.is",
      provider: "codex",
      cwd: "C:\\workspace",
      codexBin: null,
    }),
    (error) => error.category === "background_task_failed",
  );
  assert.deepEqual(calls, [
    "adapter-clear",
    "bridge-disconnect",
    "task-install",
    "files-removed",
  ]);
});

test("background install removes a newly created task if local file setup fails", async () => {
  const calls = [];
  const service = createBackgroundService({
    store: {
      paths: { launcher: "C:\\Teskeid\\AgentRunner\\launch-hidden.vbs" },
      isPresent: async () => false,
      saveProfile: async () => calls.push("profile"),
      writeLauncher: async () => {
        calls.push("launcher-failed");
        throw Object.assign(new Error(), { category: "background_profile_invalid" });
      },
      uninstallFiles: async () => calls.push("files-removed"),
    },
    taskManager: {
      isInstalled: async () => false,
      install: async () => calls.push("task-created"),
      uninstall: async () => calls.push("task-removed"),
    },
    adapterFactory: async () => ({
      provider: "codex",
      version: "codex-cli 1.0",
      async run() { return { text: "unused" }; },
      clear() {},
    }),
    bridgeFactory: () => ({ disconnect() {} }),
  });

  await assert.rejects(
    () => service.install({
      baseUrl: "https://www.teskeid.is",
      provider: "codex",
      cwd: "C:\\workspace",
      codexBin: null,
    }),
    (error) => error.category === "background_profile_invalid",
  );
  assert.deepEqual(calls, [
    "task-created",
    "profile",
    "launcher-failed",
    "task-removed",
    "files-removed",
  ]);
});

test("background status reports installed and paired without claiming it is running", async () => {
  const service = createBackgroundService({
    store: {
      isPresent: async () => true,
      loadProfile: async () => ({ provider: "codex" }),
      loadCredential: async () => credential(),
    },
    taskManager: { isInstalled: async () => true },
  });

  assert.equal(await service.status(), "installed_paired");
});

test("background CLI accepts pairing over stdin and has no secret-value option", () => {
  assert.deepEqual(parseCli(["background", "start", "--code=-"]), {
    command: "background",
    action: "start",
    code: "-",
    help: false,
  });
  assert.deepEqual(parseCli(["background", "start"]), {
    command: "background",
    action: "start",
    code: undefined,
    help: false,
  });
  assert.throws(
    () => parseCli(["background", "start", "--api-key=secret"]),
    /cli_invalid_arguments/u,
  );
});
