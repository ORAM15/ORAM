import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryProviderRegistry, type Provider } from "./ProviderRegistry";

function provider(id: string, capabilities = { canImplement: true, canDecide: false, canValidate: false }): Provider {
  return {
    id,
    capabilities: () => capabilities,
    implement: async () => ({
      status: "success",
      modifiedFiles: [],
      testsExecuted: 0,
      testsPassed: 0,
      warnings: [],
      errors: [],
      executionSummary: `provider:${id}`,
      providerEvidence: null,
    }),
  };
}

test("ProviderRegistry: registers and resolves providers by stable id", () => {
  const registry = new InMemoryProviderRegistry();
  const memory = provider("memory");

  registry.register(memory);

  assert.equal(registry.resolve("memory"), memory);
  assert.deepEqual(registry.list(), [
    {
      id: "memory",
      capabilities: { canImplement: true, canDecide: false, canValidate: false },
    },
  ]);
});

test("ProviderRegistry: rejects duplicate provider ids", () => {
  const registry = new InMemoryProviderRegistry();
  registry.register(provider("memory"));

  assert.throws(() => registry.register(provider("memory")), /already registered/);
});

test("ProviderRegistry: fails closed for an unknown provider", () => {
  const registry = new InMemoryProviderRegistry();
  registry.register(provider("memory"));

  assert.throws(() => registry.resolve("gemini"), /Unknown provider \"gemini\"/);
});

test("ProviderRegistry: exposes provider capabilities without invoking execution", () => {
  const registry = new InMemoryProviderRegistry();
  const hosted = provider("hosted", { canImplement: true, canDecide: true, canValidate: true });

  registry.register(hosted);

  assert.deepEqual(registry.list(), [
    {
      id: "hosted",
      capabilities: { canImplement: true, canDecide: true, canValidate: true },
    },
  ]);
});
