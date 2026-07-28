import { createHash, randomUUID } from "node:crypto";
import {
  API_PATHS,
  CAPABILITY,
  DEFAULT_REQUEST_TIMEOUT_MS,
  PROTOCOL_VERSION,
} from "./constants.mjs";
import {
  parseAcknowledgement,
  parseClaimResponse,
  parsePairResponse,
  validateLeaseOwnerId,
} from "./protocol.mjs";

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RETRIES = 2;

export class BridgeError extends Error {
  constructor(category, { httpStatus = null, retryable = false } = {}) {
    super(category);
    this.name = "BridgeError";
    this.category = category;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

function validateBaseUrl(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new BridgeError("bridge_invalid_url");
  }

  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";

  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BridgeError("bridge_invalid_url");
  }

  return new URL(parsed.origin);
}

function stableIdempotencyKey(action, leaseOwnerId, runId, leaseId) {
  return createHash("sha256")
    .update(`${PROTOCOL_VERSION}:${action}:${leaseOwnerId}:${runId}:${leaseId}`)
    .digest("hex");
}

function requestSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  timeout.unref?.();

  const onAbort = () => controller.abort("external");
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
    },
  };
}

async function readBoundedJson(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BridgeError("bridge_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (size === 0) return null;

  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new BridgeError("bridge_invalid_json");
  }
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(response, attempt) {
  const header = response?.headers?.get?.("retry-after");
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5_000, Math.trunc(seconds * 1000));
  }
  return 250 * 2 ** attempt;
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new BridgeError("bridge_aborted"));
      return;
    }
    const onResolve = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(onResolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new BridgeError("bridge_aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class AgentBridgeClient {
  #accessToken;
  #baseUrl;
  #fetch;
  #requestTimeoutMs;
  #sleep;

  constructor({
    baseUrl,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    sleep = defaultSleep,
  }) {
    if (typeof fetchImpl !== "function") {
      throw new BridgeError("bridge_fetch_unavailable");
    }
    this.#baseUrl = validateBaseUrl(baseUrl);
    this.#fetch = fetchImpl;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#sleep = sleep;
  }

  async pair({ code, provider, signal }) {
    const value = await this.#post(
      API_PATHS.pair,
      {
        protocolVersion: PROTOCOL_VERSION,
        code,
        provider,
        capabilities: [CAPABILITY],
      },
      {
        idempotencyKey: randomUUID(),
        signal,
        authenticated: false,
        maxRetries: 0,
        statusCategories: new Map([[429, "pairing_rate_limited"]]),
        uncertainCategory: "pairing_outcome_uncertain",
      },
    );
    const parsed = parsePairResponse(value);
    this.#accessToken = parsed.accessToken;
    return {
      connectorId: parsed.connectorId,
      providerKey: parsed.providerKey,
      displayName: parsed.displayName,
      tokenExpiresAt: parsed.tokenExpiresAt,
      pollIntervalMs: parsed.pollIntervalMs,
    };
  }

  async claim({ leaseOwnerId, signal }) {
    validateLeaseOwnerId(leaseOwnerId);
    const value = await this.#post(
      API_PATHS.claim,
      { protocolVersion: PROTOCOL_VERSION, leaseOwnerId },
      { idempotencyKey: randomUUID(), signal },
    );
    return parseClaimResponse(value);
  }

  async heartbeat({ runId, leaseId, leaseOwnerId, signal }) {
    validateLeaseOwnerId(leaseOwnerId);
    const value = await this.#post(
      API_PATHS.heartbeat,
      { protocolVersion: PROTOCOL_VERSION, runId, leaseId, leaseOwnerId },
      {
        idempotencyKey: randomUUID(),
        signal,
      },
    );
    parseAcknowledgement(value);
  }

  async complete({ runId, leaseId, leaseOwnerId, body, signal }) {
    validateLeaseOwnerId(leaseOwnerId);
    const value = await this.#post(
      API_PATHS.complete,
      { protocolVersion: PROTOCOL_VERSION, runId, leaseId, leaseOwnerId, body },
      {
        idempotencyKey: stableIdempotencyKey(
          "complete",
          leaseOwnerId,
          runId,
          leaseId,
        ),
        signal,
      },
    );
    parseAcknowledgement(value);
  }

  async fail({
    runId,
    leaseId,
    leaseOwnerId,
    failureCategory,
    retryable,
    signal,
  }) {
    validateLeaseOwnerId(leaseOwnerId);
    const value = await this.#post(
      API_PATHS.fail,
      {
        protocolVersion: PROTOCOL_VERSION,
        runId,
        leaseId,
        leaseOwnerId,
        failureCategory,
        retryable,
      },
      {
        idempotencyKey: stableIdempotencyKey(
          "fail",
          leaseOwnerId,
          runId,
          leaseId,
        ),
        signal,
      },
    );
    parseAcknowledgement(value);
  }

  disconnect() {
    this.#accessToken = undefined;
  }

  async #post(
    path,
    body,
    {
      idempotencyKey,
      signal,
      authenticated = true,
      maxRetries = MAX_RETRIES,
      statusCategories = null,
      uncertainCategory = null,
    },
  ) {
    if (authenticated && !this.#accessToken) {
      throw new BridgeError("bridge_not_paired");
    }

    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "user-agent": "teskeid-agent-runner-reference/0.1",
    };
    if (authenticated) headers.authorization = `Bearer ${this.#accessToken}`;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (signal?.aborted) throw new BridgeError("bridge_aborted");
      const request = requestSignal(signal, this.#requestTimeoutMs);
      let response;

      try {
        response = await this.#fetch(new URL(path, this.#baseUrl), {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          redirect: "error",
          signal: request.signal,
        });
      } catch {
        request.cleanup();
        if (signal?.aborted) throw new BridgeError("bridge_aborted");
        if (attempt === maxRetries) {
          if (uncertainCategory) throw new BridgeError(uncertainCategory);
          throw new BridgeError("bridge_network_error", { retryable: true });
        }
        await this.#sleep(250 * 2 ** attempt, signal);
        continue;
      }
      if (!response.ok) {
        const retryable = shouldRetryStatus(response.status);
        response.body?.cancel?.().catch?.(() => {});
        request.cleanup();
        const statusCategory = statusCategories?.get(response.status);
        if (statusCategory) {
          throw new BridgeError(statusCategory, {
            httpStatus: response.status,
            retryable,
          });
        }
        if (retryable && attempt < maxRetries) {
          await this.#sleep(retryDelay(response, attempt), signal);
          continue;
        }
        if (retryable && uncertainCategory) {
          throw new BridgeError(uncertainCategory);
        }
        throw new BridgeError("bridge_http_error", {
          httpStatus: response.status,
          retryable,
        });
      }

      try {
        const value = await readBoundedJson(response);
        request.cleanup();
        return value;
      } catch (error) {
        request.cleanup();
        if (uncertainCategory) throw new BridgeError(uncertainCategory);
        if (error instanceof BridgeError) throw error;
        if (attempt === maxRetries) {
          throw new BridgeError("bridge_network_error", { retryable: true });
        }
        await this.#sleep(250 * 2 ** attempt, signal);
      }
    }

    throw new BridgeError("bridge_network_error", { retryable: true });
  }
}
