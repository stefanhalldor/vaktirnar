const SAFE_EVENTS = new Set([
  "adapter_ready",
  "bridge_connected",
  "bridge_retrying",
  "bridge_waiting",
  "doctor_failed",
  "doctor_ok",
  "job_completed",
  "job_failed",
  "job_received",
  "runner_error",
  "runner_stopped",
]);

const SAFE_META_KEYS = new Set([
  "category",
  "provider",
  "retryable",
  "status",
  "version",
]);

const SAFE_CATEGORIES = new Set([
  "adapter_aborted",
  "adapter_failed",
  "adapter_incomplete_output",
  "adapter_invalid_output",
  "adapter_invalid_result",
  "adapter_invalid_workspace",
  "adapter_output_too_large",
  "adapter_process_failed",
  "adapter_timeout",
  "adapter_unavailable",
  "adapter_unsupported_provider",
  "bridge_aborted",
  "bridge_fetch_unavailable",
  "bridge_http_error",
  "bridge_invalid_json",
  "bridge_invalid_url",
  "bridge_network_error",
  "bridge_not_paired",
  "bridge_response_too_large",
  "bridge_token_expired",
  "cli_invalid_arguments",
  "cli_invalid_pairing_code",
  "cli_unknown_command",
  "pairing_outcome_uncertain",
  "pairing_rate_limited",
  "protocol_invalid_response",
  "protocol_provider_mismatch",
  "protocol_unsupported_mode",
  "provider_auth",
  "runner_aborted",
  "runner_failed",
  "runner_invalid_instance_id",
]);

const SAFE_VALUE = /^[a-zA-Z0-9_.:+-]{1,160}$/u;

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;

  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!SAFE_META_KEYS.has(key)) continue;
    if (key === "category") {
      safe.category =
        typeof value === "string" && SAFE_CATEGORIES.has(value)
          ? value
          : "runner_failed";
      continue;
    }
    if (typeof value === "boolean") {
      safe[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
      continue;
    }
    if (typeof value === "string" && SAFE_VALUE.test(value)) {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export function createSafeLogger(output = process.stdout) {
  return {
    event(event, meta) {
      const safeEvent = SAFE_EVENTS.has(event) ? event : "runner_error";
      const safeMeta = sanitizeMeta(meta);
      const record = safeMeta
        ? { event: safeEvent, ...safeMeta }
        : { event: safeEvent };
      output.write(`${JSON.stringify(record)}\n`);
    },
  };
}

export function toSafeFailureCategory(error, fallback = "runner_failed") {
  const category = error && typeof error.category === "string" ? error.category : fallback;
  if (SAFE_CATEGORIES.has(category)) return category;
  return SAFE_CATEGORIES.has(fallback) ? fallback : "runner_failed";
}
