import { stdin, stdout } from "node:process";
import { AgentBridgeClient } from "./bridge-client.mjs";
import { HELP_TEXT, parseCli } from "./cli-options.mjs";
import { createAdapter } from "./adapters/registry.mjs";
import { resolveCodexBinary } from "./adapters/codex.mjs";
import { PROVIDER_CODEX } from "./constants.mjs";
import { validatePairingCode } from "./protocol.mjs";
import { runConnection } from "./runner.mjs";
import { createSafeLogger, toSafeFailureCategory } from "./safe-log.mjs";

async function readPairingCode(input) {
  let value = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    value += chunk;
    if (value.length > 1024) throw Object.assign(new Error(), { category: "cli_invalid_pairing_code" });
  }
  return value.trim();
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const output = io.stdout ?? stdout;
  const input = io.stdin ?? stdin;
  const logger = createSafeLogger(output);

  let options;
  try {
    options = parseCli(argv);
  } catch (error) {
    logger.event("runner_error", { category: toSafeFailureCategory(error) });
    return 2;
  }

  if (options.command === "help" || options.help) {
    output.write(HELP_TEXT);
    return 0;
  }

  if (options.command === "doctor") {
    if (options.provider !== PROVIDER_CODEX) {
      logger.event("doctor_failed", { category: "adapter_unsupported_provider" });
      return 1;
    }
    try {
      const resolved = await resolveCodexBinary(options.codexBin);
      logger.event("doctor_ok", {
        provider: PROVIDER_CODEX,
        version: resolved.version.replace(/\s+/gu, "+"),
      });
      return 0;
    } catch (error) {
      logger.event("doctor_failed", { category: toSafeFailureCategory(error) });
      return 1;
    }
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const rawCode = options.code === "-" ? await readPairingCode(input) : options.code;
    const code = validatePairingCode(rawCode);
    options.code = undefined;

    const adapter = await createAdapter(options.provider, {
      codexBin: options.codexBin,
      cwd: options.cwd,
    });
    logger.event("adapter_ready", {
      provider: adapter.provider,
      version: adapter.version.replace(/\s+/gu, "+"),
    });

    const bridge = new AgentBridgeClient({ baseUrl: options.url });
    await runConnection({
      bridge,
      adapter,
      code,
      provider: options.provider,
      logger,
      signal: controller.signal,
    });
    logger.event("runner_stopped", { status: "ok" });
    return 0;
  } catch (error) {
    const category = controller.signal.aborted
      ? "runner_aborted"
      : toSafeFailureCategory(error);
    logger.event("runner_error", { category });
    return controller.signal.aborted ? 0 : 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
