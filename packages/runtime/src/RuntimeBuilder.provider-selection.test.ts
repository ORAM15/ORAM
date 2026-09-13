import { test } from "node:test";
import assert from "node:assert/strict";
import { RuntimeBuilder } from "./RuntimeBuilder";
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

const options = { repositoryRoot: "." };

test("RuntimeBuilder: default composition resolves deterministic memory provider", () => {
  assert.doesNotThrow(() => new RuntimeBuilder().build(options));
});

test("RuntimeBuilder: explicit provider selection resolves through a caller-supplied registry", () => {
  const registry = new InMemoryProviderRegistry();
  registry.register(provider("gemini"));

  assert.doesNotThrow(() =>
    new RuntimeBuilder()
      .withProviderRegistry(registry)
      .build({ ...options, providerSelection: { providerId: "gemini" } })
  );
});

test("RuntimeBuilder: unknown provider selection fails before Runtime construction", () => {
  const registry = new InMemoryProviderRegistry();

  assert.throws(
    () =>
      new RuntimeBuilder()
        .withProviderRegistry(registry)
        .build({ ...options, providerSelection: { providerId: "gemini" } }),
    /Unknown provider "gemini"/
  );
});

test("RuntimeBuilder: caller-supplied registry is not mutated by default-provider registration", () => {
  const registry = new InMemoryProviderRegistry();

  assert.throws(() => new RuntimeBuilder().withProviderRegistry(registry).build(options), /Unknown provider "memory"/);
  assert.equal(registry.list().length, 0);
});
