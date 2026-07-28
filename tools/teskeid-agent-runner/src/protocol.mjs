import {
  DEFAULT_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  MAX_PROMPT_CHARS,
  MIN_POLL_INTERVAL_MS,
  READ_ONLY_MODE,
} from "./constants.mjs";

export class ProtocolError extends Error {
  constructor(category = "protocol_invalid_response") {
    super(category);
    this.name = "ProtocolError";
    this.category = category;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(record, key, { max = 512 } = {}) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ProtocolError();
  }
  return value;
}

function optionalString(record, key, { max = 512 } = {}) {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ProtocolError();
  }
  return value;
}

function requireIsoTimestamp(record, key) {
  const value = requireString(record, key, { max: 64 });
  if (!/T/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ProtocolError();
  }
  return value;
}

export function clampPollInterval(value, fallback = DEFAULT_POLL_INTERVAL_MS) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(value)),
  );
}

export function parsePairResponse(value) {
  if (!isRecord(value)) throw new ProtocolError();

  return {
    accessToken: requireString(value, "accessToken", { max: 4096 }),
    connectorId: requireString(value, "connectorId"),
    providerKey: requireString(value, "providerKey", { max: 64 }),
    displayName: requireString(value, "displayName", { max: 160 }),
    tokenExpiresAt: requireIsoTimestamp(value, "tokenExpiresAt"),
    pollIntervalMs: clampPollInterval(value.pollIntervalMs),
  };
}

export function parseClaimResponse(value) {
  if (!isRecord(value)) throw new ProtocolError();

  const pollAfterMs = clampPollInterval(value.pollAfterMs);
  if (value.run === null) return { run: null, pollAfterMs };
  if (!isRecord(value.run)) throw new ProtocolError();

  const run = {
    id: requireString(value.run, "id"),
    leaseId: requireString(value.run, "leaseId"),
    conversationId: requireString(value.run, "conversationId"),
    prompt: requireString(value.run, "prompt", { max: MAX_PROMPT_CHARS }),
    mode: requireString(value.run, "mode", { max: 64 }),
    createdAt: requireString(value.run, "createdAt", { max: 64 }),
    agentSessionId: optionalString(value.run, "agentSessionId"),
  };

  if (run.mode !== READ_ONLY_MODE) {
    throw new ProtocolError("protocol_unsupported_mode");
  }

  return { run, pollAfterMs };
}

export function parseAcknowledgement(value) {
  if (!isRecord(value) || value.ok !== true) throw new ProtocolError();
}

export function validatePairingCode(value) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (
    typeof normalized !== "string" ||
    normalized.length < 8 ||
    normalized.length > 32 ||
    /[\r\n\0]/u.test(normalized)
  ) {
    throw new ProtocolError("cli_invalid_pairing_code");
  }
  return normalized;
}

export function validateLeaseOwnerId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new ProtocolError("runner_invalid_instance_id");
  }
  return value;
}
