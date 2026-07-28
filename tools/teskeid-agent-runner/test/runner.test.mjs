import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  claimRetryDelay,
  runConnection,
  toBridgeFailureCategory,
} from "../src/runner.mjs";
import { createSafeLogger, toSafeFailureCategory } from "../src/safe-log.mjs";

function captureLogger() {
  let output = "";
  return {
    logger: createSafeLogger({ write: (value) => (output += value) }),
    output: () => output,
  };
}

function makeRun(prompt = "private prompt") {
  return {
    id: "run-1",
    leaseId: "lease-1",
    conversationId: "conversation-1",
    prompt,
    mode: "read_only_reply",
    createdAt: "2026-07-27T18:00:00.000Z",
    agentSessionId: null,
  };
}

function pairResponse(pollIntervalMs = 500) {
  return {
    providerKey: "fake",
    pollIntervalMs,
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  };
}

test("provider-neutral runner completes once without logging prompt or body", async () => {
  const captured = captureLogger();
  const calls = [];
  const bridge = {
    pair: async () => pairResponse(),
    claim: async ({ leaseOwnerId }) => {
      calls.push({ action: "claim", leaseOwnerId });
      return { run: makeRun("do not log this prompt"), pollAfterMs: 500 };
    },
    heartbeat: async () => {},
    complete: async (value) => calls.push({ action: "complete", ...value }),
    fail: async (value) => calls.push({ action: "fail", ...value }),
    disconnect: () => calls.push({ action: "disconnect" }),
  };
  const adapter = {
    run: async () => ({ text: "do not log this response" }),
    clear: () => calls.push({ action: "clear" }),
  };
  const runnerInstanceId = randomUUID();

  await runConnection({
    bridge,
    adapter,
    code: "do not log this code",
    provider: "fake",
    logger: captured.logger,
    maxClaims: 1,
    runnerInstanceId,
  });

  assert.equal(calls.filter((call) => call.action === "complete").length, 1);
  assert.equal(
    calls.find((call) => call.action === "complete").leaseId,
    "lease-1",
  );
  assert.equal(calls.some((call) => call.action === "fail"), false);
  assert.equal(calls[0].leaseOwnerId, runnerInstanceId);
  assert.equal(captured.output().includes("do not log"), false);
  assert.match(captured.output(), /"event":"job_completed"/u);
});

test("adapter failures send only category and retryability", async () => {
  const captured = captureLogger();
  let failure;
  const bridge = {
    pair: async () => pairResponse(),
    claim: async () => ({ run: makeRun("private prompt"), pollAfterMs: 500 }),
    heartbeat: async () => {},
    complete: async () => assert.fail("must not complete"),
    fail: async (value) => {
      failure = value;
    },
    disconnect: () => {},
  };
  const adapter = {
    run: async () => {
      const error = new Error("private path and provider stderr");
      error.category = "adapter_process_failed";
      error.retryable = true;
      throw error;
    },
    clear: () => {},
  };

  await runConnection({
    bridge,
    adapter,
    code: "private code",
    provider: "fake",
    logger: captured.logger,
    maxClaims: 1,
    runnerInstanceId: randomUUID(),
  });

  assert.equal(failure.failureCategory, "runner_error");
  assert.equal(failure.leaseId, "lease-1");
  assert.equal(failure.retryable, true);
  assert.equal("message" in failure, false);
  assert.equal(captured.output().includes("private"), false);
  assert.equal(captured.output().includes("stderr"), false);
});

test("safe logger drops arbitrary metadata, paths, tokens, and bodies", () => {
  const captured = captureLogger();
  captured.logger.event("job_failed", {
    category: "adapter_failed",
    provider: "codex",
    path: "C:\\private\\repo",
    token: "secret-token",
    prompt: "private prompt",
    body: "private response",
  });

  assert.equal(captured.output().includes("private"), false);
  assert.equal(captured.output().includes("secret-token"), false);
  assert.deepEqual(JSON.parse(captured.output()), {
    event: "job_failed",
    category: "adapter_failed",
    provider: "codex",
  });
});

test("safe logger never emits an arbitrary category value", () => {
  const captured = captureLogger();
  captured.logger.event("job_failed", { category: "SECRET_TOKEN_VALUE" });

  assert.deepEqual(JSON.parse(captured.output()), {
    event: "job_failed",
    category: "runner_failed",
  });
});

test("pairing rate limits retain only their fixed safe category", () => {
  assert.equal(
    toSafeFailureCategory({
      category: "pairing_rate_limited",
      message: "private server response",
    }),
    "pairing_rate_limited",
  );
});

test("internal failures are reduced to the API failure allowlist", () => {
  assert.equal(
    toBridgeFailureCategory({ category: "adapter_unavailable" }),
    "provider_unavailable",
  );
  assert.equal(
    toBridgeFailureCategory({ category: "adapter_output_too_large" }),
    "output_too_large",
  );
  assert.equal(
    toBridgeFailureCategory({ category: "adapter_timeout" }),
    "timeout",
  );
  assert.equal(
    toBridgeFailureCategory({ category: "adapter_aborted" }),
    "cancelled",
  );
  assert.equal(
    toBridgeFailureCategory({ category: "private unexpected detail" }),
    "runner_error",
  );
});

test("idle polling backs off and resets pressure on the bridge", async () => {
  const sleeps = [];
  const bridge = {
    pair: async () => pairResponse(3_000),
    claim: async () => ({ run: null, pollAfterMs: 3_000 }),
    disconnect: () => {},
  };
  const adapter = { clear: () => {} };

  await runConnection({
    bridge,
    adapter,
    code: "private code",
    provider: "fake",
    logger: createSafeLogger({ write: () => {} }),
    sleep: async (delay) => { sleeps.push(delay); },
    maxClaims: 4,
    runnerInstanceId: randomUUID(),
  });

  assert.deepEqual(sleeps, [3_000, 4_500, 6_750]);
});

test("claim retry jitter stays within the bounded exponential envelope", () => {
  assert.equal(claimRetryDelay({
    consecutiveFailures: 1,
    pollIntervalMs: 3_000,
    random: () => 0,
  }), 2_400);
  assert.equal(claimRetryDelay({
    consecutiveFailures: 1,
    pollIntervalMs: 3_000,
    random: () => 1,
  }), 3_600);
  assert.equal(claimRetryDelay({
    consecutiveFailures: 20,
    pollIntervalMs: 3_000,
    random: () => 1,
  }), 30_000);
});

test("retryable claim failures keep the same pairing and back off", async () => {
  const sleeps = [];
  const events = captureLogger();
  let claimAttempts = 0;
  let paired = false;
  let disconnects = 0;
  const bridge = {
    pair: async () => {
      paired = true;
      return pairResponse();
    },
    claim: async () => {
      assert.equal(paired, true);
      claimAttempts += 1;
      if (claimAttempts <= 3) {
        throw Object.assign(new Error("private upstream detail"), {
          category: "bridge_http_error",
          httpStatus: 503,
          retryable: true,
        });
      }
      return { run: null, pollAfterMs: 500 };
    },
    disconnect: () => {
      paired = false;
      disconnects += 1;
    },
  };

  await runConnection({
    bridge,
    adapter: { clear: () => {} },
    code: "private code",
    provider: "fake",
    logger: events.logger,
    sleep: async (delay) => sleeps.push(delay),
    random: () => 0.5,
    maxClaims: 4,
    runnerInstanceId: randomUUID(),
  });

  assert.equal(claimAttempts, 4);
  assert.deepEqual(sleeps, [500, 1_000, 2_000]);
  assert.equal(disconnects, 1);
  assert.equal(events.output().includes("private upstream detail"), false);
  assert.equal(
    events.output().match(/"event":"bridge_retrying"/gu)?.length,
    3,
  );
});

test("claim HTTP 401 stops immediately without a connection-loop retry", async () => {
  let claimAttempts = 0;
  let sleeps = 0;
  const bridge = {
    pair: async () => pairResponse(),
    claim: async () => {
      claimAttempts += 1;
      throw Object.assign(new Error("private unauthorized detail"), {
        category: "bridge_http_error",
        httpStatus: 401,
        retryable: false,
      });
    },
    disconnect: () => {},
  };

  await assert.rejects(
    () => runConnection({
      bridge,
      adapter: { clear: () => {} },
      code: "private code",
      provider: "fake",
      logger: createSafeLogger({ write: () => {} }),
      sleep: async () => { sleeps += 1; },
      runnerInstanceId: randomUUID(),
    }),
    (error) => error?.category === "bridge_http_error" && error.httpStatus === 401,
  );
  assert.equal(claimAttempts, 1);
  assert.equal(sleeps, 0);
});

test("a non-retryable claim protocol error stops immediately", async () => {
  let claimAttempts = 0;
  const bridge = {
    pair: async () => pairResponse(),
    claim: async () => {
      claimAttempts += 1;
      throw Object.assign(new Error("private malformed response"), {
        category: "protocol_invalid_response",
        retryable: false,
      });
    },
    disconnect: () => {},
  };

  await assert.rejects(
    () => runConnection({
      bridge,
      adapter: { clear: () => {} },
      code: "private code",
      provider: "fake",
      logger: createSafeLogger({ write: () => {} }),
      sleep: async () => assert.fail("must not sleep"),
      runnerInstanceId: randomUUID(),
    }),
    (error) => error?.category === "protocol_invalid_response",
  );
  assert.equal(claimAttempts, 1);
});

test("claim retries stop at token expiry without another request", async () => {
  const sleeps = [];
  let claimAttempts = 0;
  let nowMs = Date.parse("2026-07-27T20:00:00.000Z");
  const expiresAtMs = nowMs + 1_250;
  const bridge = {
    pair: async () => ({
      ...pairResponse(),
      tokenExpiresAt: new Date(expiresAtMs).toISOString(),
    }),
    claim: async () => {
      claimAttempts += 1;
      throw Object.assign(new Error("private network detail"), {
        category: "bridge_network_error",
        retryable: true,
      });
    },
    disconnect: () => {},
  };

  await assert.rejects(
    () => runConnection({
      bridge,
      adapter: { clear: () => {} },
      code: "private code",
      provider: "fake",
      logger: createSafeLogger({ write: () => {} }),
      now: () => nowMs,
      random: () => 0.5,
      sleep: async (delay) => {
        sleeps.push(delay);
        nowMs += delay;
      },
      runnerInstanceId: randomUUID(),
    }),
    (error) => error?.category === "bridge_token_expired",
  );

  assert.equal(claimAttempts, 2);
  assert.deepEqual(sleeps, [500, 750]);
});
