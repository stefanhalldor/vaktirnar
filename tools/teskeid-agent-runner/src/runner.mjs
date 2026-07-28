import { randomUUID } from "node:crypto";
import {
  MAX_POLL_INTERVAL_MS,
  MAX_RESULT_CHARS,
  MIN_POLL_INTERVAL_MS,
  PROTOCOL_VERSION,
} from "./constants.mjs";
import { toSafeFailureCategory } from "./safe-log.mjs";

const HEARTBEAT_INTERVAL_MS = 10_000;
const CLAIM_RETRY_JITTER_RATIO = 0.2;

function fixedRunnerError(category) {
  return Object.assign(new Error(category), { category, retryable: false });
}

function requireFutureTokenExpiry(value, now) {
  const expiresAtMs = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(expiresAtMs)) {
    throw fixedRunnerError("protocol_invalid_response");
  }
  if (now() >= expiresAtMs) throw fixedRunnerError("bridge_token_expired");
  return expiresAtMs;
}

function ensureTokenIsValid(expiresAtMs, now) {
  if (now() >= expiresAtMs) throw fixedRunnerError("bridge_token_expired");
}

export function claimRetryDelay({
  consecutiveFailures,
  pollIntervalMs,
  random = Math.random,
}) {
  const requestedInterval = Number.isFinite(pollIntervalMs)
    ? pollIntervalMs
    : MIN_POLL_INTERVAL_MS;
  const base = Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, requestedInterval),
  );
  const exponent = Math.min(10, Math.max(0, consecutiveFailures - 1));
  const exponential = Math.min(MAX_POLL_INTERVAL_MS, base * 2 ** exponent);
  const sample = Number(random());
  const boundedSample = Number.isFinite(sample)
    ? Math.min(1, Math.max(0, sample))
    : 0.5;
  const jitter = 1 + (boundedSample * 2 - 1) * CLAIM_RETRY_JITTER_RATIO;
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.round(exponential * jitter)),
  );
}

async function sleepBeforeExpiry({ delay, expiresAtMs, now, sleep, signal }) {
  ensureTokenIsValid(expiresAtMs, now);
  const remainingMs = expiresAtMs - now();
  await sleep(Math.min(delay, remainingMs), signal);
  ensureTokenIsValid(expiresAtMs, now);
}

export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("runner_aborted"), { category: "runner_aborted" }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("runner_aborted"), { category: "runner_aborted" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function validateAdapterResult(result) {
  if (
    !result ||
    typeof result.text !== "string" ||
    result.text.trim().length === 0 ||
    result.text.length > MAX_RESULT_CHARS
  ) {
    const error = new Error("adapter_invalid_result");
    error.category = "adapter_invalid_result";
    error.retryable = false;
    throw error;
  }
  return result.text;
}

export function toBridgeFailureCategory(error) {
  switch (error?.category) {
    case "adapter_unavailable":
      return "provider_unavailable";
    case "provider_auth":
      return "provider_auth";
    case "adapter_timeout":
      return "timeout";
    case "adapter_output_too_large":
      return "output_too_large";
    case "adapter_aborted":
    case "runner_aborted":
      return "cancelled";
    default:
      return "runner_error";
  }
}

function linkedAbortController(signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  return {
    controller,
    cleanup: () => signal?.removeEventListener("abort", onAbort),
  };
}

export async function processClaimedRun({
  run,
  adapter,
  bridge,
  leaseOwnerId,
  logger,
  signal,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
}) {
  logger.event("job_received");
  const linked = linkedAbortController(signal);
  let heartbeatFailure = null;
  let heartbeatPromise = null;

  const heartbeat = setInterval(async () => {
    if (heartbeatPromise || linked.controller.signal.aborted) return;
    const pending = bridge
      .heartbeat({
        runId: run.id,
        leaseId: run.leaseId,
        leaseOwnerId,
        signal: linked.controller.signal,
      })
      .catch((error) => {
        heartbeatFailure = error;
        linked.controller.abort();
      })
      .finally(() => {
        if (heartbeatPromise === pending) heartbeatPromise = null;
      });
    heartbeatPromise = pending;
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  const stopHeartbeat = async ({ abort = false } = {}) => {
    clearInterval(heartbeat);
    if (abort) linked.controller.abort();
    await heartbeatPromise;
  };

  try {
    const result = await adapter.run(run, { signal: linked.controller.signal });
    await stopHeartbeat();
    if (heartbeatFailure) throw heartbeatFailure;
    const body = validateAdapterResult(result);
    await bridge.complete({
      runId: run.id,
      leaseId: run.leaseId,
      leaseOwnerId,
      body,
      signal,
    });
    logger.event("job_completed");
    return { status: "completed" };
  } catch (error) {
    await stopHeartbeat({ abort: signal?.aborted === true });
    const effectiveError = heartbeatFailure ?? error;
    const category = toSafeFailureCategory(effectiveError, "adapter_failed");
    const retryable = effectiveError?.retryable === true;

    if (!signal?.aborted && !heartbeatFailure) {
      try {
        await bridge.fail({
          runId: run.id,
          leaseId: run.leaseId,
          leaseOwnerId,
          failureCategory: toBridgeFailureCategory(effectiveError),
          retryable,
          signal,
        });
      } catch {
        // The bridge owns retries and lease recovery. Never log response details.
      }
    }

    logger.event("job_failed", { category, retryable });
    return { status: "failed", category, retryable };
  } finally {
    await stopHeartbeat({ abort: true });
    linked.controller.abort();
    linked.cleanup();
  }
}

export async function runConnection({
  bridge,
  adapter,
  code,
  provider,
  connectedPairing = null,
  logger,
  signal,
  sleep = abortableSleep,
  now = Date.now,
  random = Math.random,
  maxClaims = Number.POSITIVE_INFINITY,
  runnerInstanceId = randomUUID(),
}) {
  let pollIntervalMs;
  let idlePollIntervalMs;
  let claimFailures = 0;
  let claims = 0;

  try {
    const pairing = connectedPairing ?? await bridge.pair({ code, provider, signal });
    if (pairing.providerKey !== provider) {
      const error = new Error("protocol_provider_mismatch");
      error.category = "protocol_provider_mismatch";
      throw error;
    }
    pollIntervalMs = pairing.pollIntervalMs;
    idlePollIntervalMs = pollIntervalMs;
    const tokenExpiresAtMs = requireFutureTokenExpiry(
      pairing.tokenExpiresAt,
      now,
    );
    logger.event("bridge_connected", { provider: pairing.providerKey });

    while (!signal?.aborted && claims < maxClaims) {
      ensureTokenIsValid(tokenExpiresAtMs, now);
      claims += 1;
      let claim;
      try {
        claim = await bridge.claim({
          leaseOwnerId: runnerInstanceId,
          signal,
        });
        claimFailures = 0;
      } catch (error) {
        if (error?.retryable !== true || error?.httpStatus === 401) throw error;
        claimFailures += 1;
        logger.event("bridge_retrying", {
          category: toSafeFailureCategory(error),
          retryable: true,
        });
        if (claims < maxClaims) {
          await sleepBeforeExpiry({
            delay: claimRetryDelay({
              consecutiveFailures: claimFailures,
              pollIntervalMs,
              random,
            }),
            expiresAtMs: tokenExpiresAtMs,
            now,
            sleep,
            signal,
          });
        }
        continue;
      }

      if (!claim.run) {
        logger.event("bridge_waiting");
        if (claims < maxClaims) {
          const serverDelay = claim.pollAfterMs ?? pollIntervalMs;
          const delay = Math.max(serverDelay, idlePollIntervalMs);
          await sleepBeforeExpiry({
            delay,
            expiresAtMs: tokenExpiresAtMs,
            now,
            sleep,
            signal,
          });
          idlePollIntervalMs = Math.min(
            MAX_POLL_INTERVAL_MS,
            Math.ceil(Math.max(pollIntervalMs, delay) * 1.5),
          );
        }
        continue;
      }

      idlePollIntervalMs = pollIntervalMs;
      await processClaimedRun({
        run: claim.run,
        adapter,
        bridge,
        leaseOwnerId: runnerInstanceId,
        logger,
        signal,
      });
    }
  } finally {
    bridge.disconnect();
    adapter.clear?.();
  }
}

export const RUNNER_PROTOCOL_VERSION = PROTOCOL_VERSION;
