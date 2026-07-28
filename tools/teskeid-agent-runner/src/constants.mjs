export const PROTOCOL_VERSION = 1;
export const CAPABILITY = "chat.reply.read_only";
export const PROVIDER_CODEX = "codex";

export const MAX_PROMPT_CHARS = 32_000;
export const MAX_RESULT_CHARS = 12_000;
export const MAX_CODEX_STDOUT_BYTES = 8 * 1024 * 1024;
export const MAX_JSONL_LINE_BYTES = 1024 * 1024;

export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const MIN_POLL_INTERVAL_MS = 500;
export const MAX_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export const READ_ONLY_MODE = "read_only_reply";

export const API_PATHS = Object.freeze({
  pair: "/api/agent-bridge/v1/pair",
  claim: "/api/agent-bridge/v1/claim",
  heartbeat: "/api/agent-bridge/v1/heartbeat",
  complete: "/api/agent-bridge/v1/complete",
  fail: "/api/agent-bridge/v1/fail",
});
