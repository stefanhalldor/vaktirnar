import assert from "node:assert/strict";
import test from "node:test";
import {
  AdapterContractError,
  createAdapterRegistry,
} from "../src/adapters/contract.mjs";

function fakeAdapter(provider) {
  return {
    provider,
    version: "provider-cli 1.2.3",
    async run() {
      return { text: "reply" };
    },
    clear() {},
  };
}

test("provider registry creates only explicitly registered adapters", async () => {
  const received = [];
  const registry = createAdapterRegistry([
    {
      provider: "codex",
      create: async (options) => {
        received.push(options);
        return fakeAdapter("codex");
      },
    },
    {
      provider: "future-provider",
      create: async () => fakeAdapter("future-provider"),
    },
  ]);

  const adapter = await registry.create("codex", { workspace: "opaque" });

  assert.equal(adapter.provider, "codex");
  assert.deepEqual(received, [{ workspace: "opaque" }]);
  assert.deepEqual(registry.providers(), ["codex", "future-provider"]);
  await assert.rejects(
    () => registry.create("server-supplied-executable", {}),
    (error) =>
      error instanceof AdapterContractError &&
      error.category === "adapter_unsupported_provider",
  );
});

test("registry rejects duplicate providers and malformed adapter contracts", async () => {
  const registry = createAdapterRegistry([
    { provider: "codex", create: async () => fakeAdapter("wrong-provider") },
  ]);

  assert.throws(
    () => registry.register({ provider: "codex", create: async () => fakeAdapter("codex") }),
    (error) => error.category === "adapter_duplicate_provider",
  );
  await assert.rejects(
    () => registry.create("codex", {}),
    (error) => error.category === "adapter_invalid_contract",
  );
  assert.throws(
    () => createAdapterRegistry([{ provider: "../../binary", create() {} }]),
    (error) => error.category === "adapter_invalid_contract",
  );
});
