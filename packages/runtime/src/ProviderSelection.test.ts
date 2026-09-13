import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryProviderRegistry, type Provider } from "./ProviderRegistry";
import { DEFAULT_PROVIDER_ID, resolveProviderId, selectProvider } from "./index";

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

test("ProviderSelection: defaults to deterministic memory provider", () => {
  assert.equal(resolveProviderId(), DEFAULT_PROVIDER_ID);
  assert.equal(resolveProviderId({}), DEFAULT_PROVIDER_ID);
});

test("ProviderSelection: preserves an explicitly configured provider id", () => {
  assert.equal(resolveProviderId({ providerId: " gemini " }), "gemini");
});

test("ProviderSelection: rejects an explicitly configured empty id", () => {
  assert.throws(() => resolveProviderId({ providerId: "   " }), /non-empty providerId/);
});

test("ProviderSelection: resolves through the registry without knowing provider implementation", () => {
  const registry = new InMemoryProviderRegistry();
  const hosted = provider("gemini");
  registry.register(hosted);

  assert.equal(selectProvider(registry, { providerId: "gemini" }), hosted);
});

test("ProviderSelection: unknown configured provider fails closed through the registry", () => {
  const registry = new InMemoryProviderRegistry();
  registry.register(provider(DEFAULT_PROVIDER_ID));

  assert.throws(() => selectProvider(registry, { providerId: "openai" }), /Unknown provider \"openai\"/);
});
