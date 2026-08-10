/**
 * Regression coverage for RunArtifacts (Capability Sprint 17 -- Runtime Artifact Handoff).
 *
 * Proves the three properties the Sprint requires of the handoff mechanism itself:
 *   A. Producer -> consumer: an artifact persisted by one engine (through the real EngineRunner) is
 *      retrieved, byte-identical, by a downstream engine of the SAME run via its RunArtifacts argument --
 *      and the downstream engine performs no recomputation.
 *   B. Same-run isolation: an artifact written under run A can never satisfy a lookup from run B.
 *   C. Missing artifact: a required artifact absent from the store rejects with the store's own clear,
 *      deterministic error naming the runId/stage/name -- never a silent recompute, never a fabrication.
 *
 * Run with: node --import tsx --test packages/runtime/src/RunArtifacts.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createRuntimeContext, type RuntimeContext } from "./RuntimeContext";
import { InMemoryEventBus } from "./EventBus";
import { BufferedLogger } from "./Logger";
import { InMemoryProviderRegistry } from "./ProviderRegistry";
import { FileSystemArtifactStore } from "./ArtifactStore";
import { EngineRunner, type EngineDescriptor } from "./EngineRunner";
import { RunArtifacts } from "./RunArtifacts";
import type { OramEvent } from "@oram/events";

interface ProducerOutput {
  readonly items: ReadonlyArray<string>;
  readonly total: number;
}

function testEvent(runId: string): OramEvent {
  return { type: "RepositoryAnalyzed", runId, timestamp: new Date().toISOString(), summary: { projectName: "test", fileCount: 0, languages: [] } };
}

async function makeHarness(t: { after(fn: () => Promise<void>): void }): Promise<{ context: RuntimeContext; store: FileSystemArtifactStore; runner: EngineRunner }> {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-run-artifacts-"));
  t.after(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true });
  });
  const store = new FileSystemArtifactStore(baseDir);
  const context = createRuntimeContext({
    repositoryRoot: "/fake/repo",
    logger: new BufferedLogger(),
    eventBus: new InMemoryEventBus(),
    artifactStore: store,
    providerRegistry: new InMemoryProviderRegistry(),
  });
  return { context, store, runner: new EngineRunner(context) };
}

test("A. producer -> consumer: a downstream engine receives the exact artifact an upstream engine persisted, without recomputing", async (t) => {
  const { runner } = await makeHarness(t);
  const runId = "RUN-HANDOFF-A";

  let producerInvocations = 0;
  const producer: EngineDescriptor<ProducerOutput> = {
    stage: "producer-stage",
    artifactName: "producer-output",
    run: () => {
      producerInvocations += 1;
      return { items: ["a", "b", "c"], total: 3 };
    },
    buildEvent: (id) => testEvent(id),
  };

  let received: ProducerOutput | null = null;
  const consumer: EngineDescriptor<{ consumedTotal: number }> = {
    stage: "consumer-stage",
    artifactName: "consumer-output",
    run: async (_context, artifacts) => {
      assert.ok(artifacts, "EngineRunner must supply RunArtifacts to every engine invocation");
      received = await artifacts.require<ProducerOutput>("producer-stage", "producer-output");
      return { consumedTotal: received.total };
    },
    buildEvent: (id) => testEvent(id),
  };

  await runner.run(runId, producer);
  const consumerArtifact = await runner.run(runId, consumer);

  assert.deepEqual(received, { items: ["a", "b", "c"], total: 3 });
  assert.equal(consumerArtifact.payload.consumedTotal, 3);
  assert.equal(producerInvocations, 1, "the producer must have run exactly once -- the consumer read its artifact, never re-invoked it");
});

test("B. same-run isolation: run A's artifact never satisfies run B's lookup", async (t) => {
  const { store } = await makeHarness(t);

  await store.write({ runId: "RUN-A", stage: "producer-stage", name: "producer-output" }, { items: [], total: 0 });

  const runA = new RunArtifacts(store, "RUN-A");
  const runB = new RunArtifacts(store, "RUN-B");

  assert.equal(await runA.has("producer-stage", "producer-output"), true);
  assert.equal(await runB.has("producer-stage", "producer-output"), false);
  await assert.rejects(
    () => runB.require("producer-stage", "producer-output"),
    (error: Error) => error.message.includes('runId="RUN-B"') && error.message.includes("Artifact not found")
  );
});

test("C. missing artifact: require() rejects with the store's own deterministic error naming runId/stage/name", async (t) => {
  const { store } = await makeHarness(t);
  const artifacts = new RunArtifacts(store, "RUN-MISSING");

  await assert.rejects(
    () => artifacts.require("never-ran-stage", "never-written"),
    (error: Error) =>
      error.message.includes("Artifact not found") &&
      error.message.includes('runId="RUN-MISSING"') &&
      error.message.includes('stage="never-ran-stage"') &&
      error.message.includes('name="never-written"')
  );
});

test("missing(): reports exactly the absent dependencies, in order, and empty when everything is available", async (t) => {
  const { store } = await makeHarness(t);
  const runId = "RUN-MISSING-LIST";
  await store.write({ runId, stage: "s1", name: "n1" }, { ok: true });
  const artifacts = new RunArtifacts(store, runId);

  const deps = [
    { stage: "s1", name: "n1" },
    { stage: "s2", name: "n2" },
    { stage: "s3", name: "n3" },
  ];
  assert.deepEqual(await artifacts.missing(deps), [
    { stage: "s2", name: "n2" },
    { stage: "s3", name: "n3" },
  ]);

  await store.write({ runId, stage: "s2", name: "n2" }, { ok: true });
  await store.write({ runId, stage: "s3", name: "n3" }, { ok: true });
  assert.deepEqual(await artifacts.missing(deps), []);
});
