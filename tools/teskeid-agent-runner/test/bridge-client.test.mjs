import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AgentBridgeClient, BridgeError } from "../src/bridge-client.mjs";

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const PAIR_RESPONSE = {
  accessToken: "memory-only-token",
  connectorId: "connector-1",
  providerKey: "codex",
  displayName: "Local Codex",
  tokenExpiresAt: "2026-08-26T18:00:00.000Z",
  pollIntervalMs: 1000,
};

test("pair does not authenticate the one-time exchange", async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push(init);
    return jsonResponse(PAIR_RESPONSE);
  };
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl,
  });

  const result = await client.pair({ code: "single-use-code", provider: "codex" });

  assert.equal(result.connectorId, "connector-1");
  assert.equal(result.tokenExpiresAt, "2026-08-26T18:00:00.000Z");
  assert.equal(requests.length, 1);
  assert.equal(typeof requests[0].headers["idempotency-key"], "string");
  assert.equal(requests[0].headers.authorization, undefined);
});

test("an uncertain pairing outcome is never retried", async () => {
  let attempts = 0;
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl: async () => {
      attempts += 1;
      throw new Error("sensitive network detail");
    },
    sleep: async () => {},
  });

  await assert.rejects(
    () => client.pair({ code: "single-use-code", provider: "codex" }),
    /pairing_outcome_uncertain/u,
  );
  assert.equal(attempts, 1);
});

test("pair rejects a missing or malformed token expiry", async () => {
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl: async () =>
      jsonResponse({ ...PAIR_RESPONSE, tokenExpiresAt: "not-a-date" }),
  });

  await assert.rejects(
    () => client.pair({ code: "single-use-code", provider: "codex" }),
    /protocol_invalid_response/u,
  );
});

test("mutating bridge calls require an explicit positive acknowledgement", async () => {
  let requestCount = 0;
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse(requestCount === 1 ? PAIR_RESPONSE : {});
    },
    sleep: async () => {},
  });
  await client.pair({ code: "single-use-code", provider: "codex" });

  await assert.rejects(
    () => client.heartbeat({
      runId: "run-1",
      leaseId: "lease-1",
      leaseOwnerId: randomUUID(),
    }),
    /protocol_invalid_response/u,
  );
});

test("an HTTP 503 pairing response is treated as uncertain", async () => {
  let attempts = 0;
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 503 });
    },
    sleep: async () => {},
  });

  await assert.rejects(
    () => client.pair({ code: "single-use-code", provider: "codex" }),
    /pairing_outcome_uncertain/u,
  );
  assert.equal(attempts, 1);
});

test("a definite HTTP 429 pairing response is rate limited, not uncertain", async () => {
  let attempts = 0;
  const client = new AgentBridgeClient({
    baseUrl: "https://www.teskeid.is",
    fetchImpl: async () => {
      attempts += 1;
      return new Response("private server detail", { status: 429 });
    },
    sleep: async () => {},
  });

  await assert.rejects(
    () => client.pair({ code: "single-use-code", provider: "codex" }),
    (error) => {
      assert.ok(error instanceof BridgeError);
      assert.equal(error.category, "pairing_rate_limited");
      assert.equal(error.httpStatus, 429);
      assert.equal(error.retryable, true);
      assert.equal(JSON.stringify(error).includes("private server detail"), false);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("claim sends the process lease owner and accepts the SQL lease shape", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: url.pathname, init });
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    return jsonResponse({
      run: {
        id: "run-1",
        leaseId: "lease-1",
        conversationId: "conversation-1",
        prompt: "Please review this code",
        mode: "read_only_reply",
        createdAt: "2026-07-27T18:00:00.000Z",
        agentSessionId: null,
      },
      pollAfterMs: 2500,
    });
  };
  const client = new AgentBridgeClient({ baseUrl: "https://teskeid.is", fetchImpl });
  await client.pair({ code: "single-use-code", provider: "codex" });
  const leaseOwnerId = randomUUID();

  const result = await client.claim({ leaseOwnerId });
  const claimBody = JSON.parse(requests.at(-1).init.body);

  assert.equal(result.run.id, "run-1");
  assert.equal(result.run.mode, "read_only_reply");
  assert.deepEqual(claimBody, { protocolVersion: 1, leaseOwnerId });
  assert.equal(requests.at(-1).init.headers.authorization, "Bearer memory-only-token");
});

test("claim transport retries reuse one idempotency key", async () => {
  const claims = [];
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    claims.push(init);
    if (claims.length === 1) return new Response(null, { status: 503 });
    return jsonResponse({ run: null, pollAfterMs: 1000 });
  };
  const client = new AgentBridgeClient({
    baseUrl: "https://teskeid.is",
    fetchImpl,
    sleep: async () => {},
  });
  await client.pair({ code: "single-use-code", provider: "codex" });

  await client.claim({ leaseOwnerId: randomUUID() });

  assert.equal(claims.length, 2);
  assert.equal(
    claims[0].headers["idempotency-key"],
    claims[1].headers["idempotency-key"],
  );
});

test("complete retries idempotently and uploads only the contract body", async () => {
  const completionRequests = [];
  let completionAttempt = 0;
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    completionRequests.push(init);
    completionAttempt += 1;
    if (completionAttempt === 1) return new Response(null, { status: 503 });
    return jsonResponse({ ok: true });
  };
  const client = new AgentBridgeClient({
    baseUrl: "https://teskeid.is",
    fetchImpl,
    sleep: async () => {},
  });
  await client.pair({ code: "single-use-code", provider: "codex" });
  const leaseOwnerId = randomUUID();

  await client.complete({
    runId: "run-1",
    leaseId: "lease-1",
    leaseOwnerId,
    body: "Bounded final reply",
  });

  assert.equal(completionRequests.length, 2);
  assert.equal(
    completionRequests[0].headers["idempotency-key"],
    completionRequests[1].headers["idempotency-key"],
  );
  assert.deepEqual(JSON.parse(completionRequests[1].body), {
    protocolVersion: 1,
    runId: "run-1",
    leaseId: "lease-1",
    leaseOwnerId,
    body: "Bounded final reply",
  });
});

test("fail is fenced by lease generation and retries with a stable key", async () => {
  const failures = [];
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    failures.push(init);
    if (failures.length === 1) return new Response(null, { status: 503 });
    return jsonResponse({ ok: true });
  };
  const client = new AgentBridgeClient({
    baseUrl: "https://teskeid.is",
    fetchImpl,
    sleep: async () => {},
  });
  await client.pair({ code: "single-use-code", provider: "codex" });
  const leaseOwnerId = randomUUID();

  await client.fail({
    runId: "run-1",
    leaseId: "lease-generation-2",
    leaseOwnerId,
    failureCategory: "runner_error",
    retryable: true,
  });

  assert.equal(failures.length, 2);
  assert.equal(
    failures[0].headers["idempotency-key"],
    failures[1].headers["idempotency-key"],
  );
  assert.deepEqual(JSON.parse(failures[1].body), {
    protocolVersion: 1,
    runId: "run-1",
    leaseId: "lease-generation-2",
    leaseOwnerId,
    failureCategory: "runner_error",
    retryable: true,
  });
});

test("heartbeat includes both lease owner and lease generation", async () => {
  let heartbeatBody;
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    heartbeatBody = JSON.parse(init.body);
    return jsonResponse({ ok: true });
  };
  const client = new AgentBridgeClient({ baseUrl: "https://teskeid.is", fetchImpl });
  await client.pair({ code: "single-use-code", provider: "codex" });
  const leaseOwnerId = randomUUID();

  await client.heartbeat({
    runId: "run-1",
    leaseId: "lease-generation-3",
    leaseOwnerId,
  });

  assert.deepEqual(heartbeatBody, {
    protocolVersion: 1,
    runId: "run-1",
    leaseId: "lease-generation-3",
    leaseOwnerId,
  });
});

test("bridge errors expose only a category and status, never a response body", async () => {
  const client = new AgentBridgeClient({
    baseUrl: "https://teskeid.is",
    fetchImpl: async () =>
      new Response("secret response body", { status: 401 }),
  });

  await assert.rejects(
    () => client.pair({ code: "single-use-code", provider: "codex" }),
    (error) => {
      assert.ok(error instanceof BridgeError);
      assert.equal(error.message, "bridge_http_error");
      assert.equal(error.httpStatus, 401);
      assert.equal(JSON.stringify(error).includes("secret response body"), false);
      return true;
    },
  );
});

test("non-HTTPS remote bridge URLs are rejected", () => {
  assert.throws(
    () => new AgentBridgeClient({ baseUrl: "http://example.com" }),
    /bridge_invalid_url/u,
  );
  assert.doesNotThrow(
    () => new AgentBridgeClient({ baseUrl: "http://localhost:3000" }),
  );
});

test("claim rejects any server-selected mode except read_only_reply", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/pair")) return jsonResponse(PAIR_RESPONSE);
    return jsonResponse({
      run: {
        id: "run-1",
        leaseId: "lease-1",
        conversationId: "conversation-1",
        prompt: "Prompt",
        mode: "write_files",
        createdAt: "2026-07-27T18:00:00.000Z",
        agentSessionId: null,
      },
      pollAfterMs: 1000,
    });
  };
  const client = new AgentBridgeClient({ baseUrl: "https://teskeid.is", fetchImpl });
  await client.pair({ code: "single-use-code", provider: "codex" });

  await assert.rejects(
    () => client.claim({ leaseOwnerId: randomUUID() }),
    /protocol_unsupported_mode/u,
  );
});
