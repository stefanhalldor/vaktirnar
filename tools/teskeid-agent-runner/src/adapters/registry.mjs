import { PROVIDER_CODEX } from "../constants.mjs";
import { AdapterError, createCodexAdapter } from "./codex.mjs";

export async function createAdapter(provider, options) {
  if (provider === PROVIDER_CODEX) return createCodexAdapter(options);
  throw new AdapterError("adapter_unsupported_provider");
}
