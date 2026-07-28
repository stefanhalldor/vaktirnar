import { PROVIDER_CODEX } from "../constants.mjs";
import { createCodexAdapter } from "./codex.mjs";
import { createAdapterRegistry } from "./contract.mjs";

export const defaultAdapterRegistry = createAdapterRegistry([
  {
    provider: PROVIDER_CODEX,
    create: createCodexAdapter,
  },
]);

export async function createAdapter(provider, options) {
  return defaultAdapterRegistry.create(provider, options);
}
