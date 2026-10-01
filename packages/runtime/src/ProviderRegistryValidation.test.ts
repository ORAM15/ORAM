import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryProviderRegistry, type Provider } from "./ProviderRegistry";

function provider(id: string): Provider {
  return {
    id,
    capabilities: () => ({ canImplement: true, canDecide: false, canValidate: false }),
    implement: async () => ({
      status: "success",
      modifiedFiles: [],
      testsExecuted: 0,
      testsPassed: 0,
      warnings: [],
      errors: [],
      executionSummary: id,
      providerEvidence: null,
    }),
  };
}

test("ProviderRegistry: rejects an empty provider id", () => {
  const registry = new InMemoryProviderRegistry();
  assert.throws(() => registry.register(provider("")), /non-empty provider id/);
});

test("ProviderRegistry: rejects whitespace-only provider ids", () => {
  const registry = new InMemoryProviderRegistry();
  assert.throws(() => registry.register(provider("   ")), /non-empty provider id/);
});

test("ProviderRegistry: rejects provider ids with surrounding whitespace", () => {
  const registry = new InMemoryProviderRegistry();
  assert.throws(() => registry.register(provider(" gemini ")), /leading or trailing whitespace/);
});

test("ProviderRegistry: preserves valid provider ids", () => {
  const registry = new InMemoryProviderRegistry();
  const memory = provider("memory");
  registry.register(memory);
  assert.equal(registry.resolve("memory"), memory);
});
