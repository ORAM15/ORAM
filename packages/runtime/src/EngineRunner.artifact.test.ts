/**
 * Regression coverage for wrapping EngineRunner.run()'s return value in Artifact<T> (see
 * ./artifacts/artifact.ts). Asserts exactly the three things this change's own instructions require:
 *   1. The engine's raw payload is unchanged, just moved to `.payload`.
 *   2. Artifact metadata (id/type/version/createdAt) exists and is well-formed.
 *   3. Persistence and event publishing are untouched -- artifactStore.write()/eventBus.publish() still see
 *      the RAW, unwrapped output, exactly as before this change (proving the wrapper is return-value-only).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createRuntimeContext } from "./RuntimeContext";
import { InMemoryEventBus } from "./EventBus";
import { BufferedLogger } from "./Logger";
import { InMemoryProviderRegistry } from "./ProviderRegistry";
import { FileSystemArtifactStore } from "./ArtifactStore";
import { EngineRunner, type EngineDescriptor } from "./EngineRunner";
import type { OramEvent } from "@oram/events";

interface FakeOutput {
  readonly value: number;
}

function fakeEngine(): EngineDescriptor<FakeOutput> {
  return {
    stage: "test-stage",
    artifactName: "test-artifact",
    run: () => ({ value: 42 }),
    buildEvent: (runId, output, ref): OramEvent => ({
      type: "RepositoryAnalyzed",
      runId,
      timestamp: new Date().toISOString(),
      summary: { projectName: `received-value-${output.value}-at-${ref.stage}/${ref.name}`, fileCount: 0, languages: [] },
    }),
  };
}

test("EngineRunner.run() wraps the engine's output in Artifact<T> without changing the payload", async (t) => {
  const artifactBaseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-engine-runner-artifact-"));
  t.after(async () => {
    await fsp.rm(artifactBaseDir, { recursive: true, force: true });
  });

  const eventBus = new InMemoryEventBus();
  const events: OramEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const artifactStore = new FileSystemArtifactStore(artifactBaseDir);

  const context = createRuntimeContext({
    repositoryRoot: "/fake/repo",
    logger: new BufferedLogger(),
    eventBus,
    artifactStore,
    providerRegistry: new InMemoryProviderRegistry(),
  });
  const engineRunner = new EngineRunner(context);
  const runId = "RUN-ARTIFACT-TEST";

  const before = Date.now();
  const artifact = await engineRunner.run(runId, fakeEngine());
  const after = Date.now();

  // 1. Payload unchanged.
  assert.deepEqual(artifact.payload, { value: 42 });

  // 2. Metadata exists and is well-formed.
  assert.equal(typeof artifact.id, "string");
  assert.ok(artifact.id.length > 0);
  assert.equal(artifact.type, "test-artifact");
  assert.equal(artifact.version, 1);
  const createdAtMs = Date.parse(artifact.createdAt);
  assert.ok(Number.isFinite(createdAtMs));
  assert.ok(createdAtMs >= before && createdAtMs <= after);

  // 3. Persistence untouched: the artifact on disk is still the RAW payload, not the wrapper.
  const persisted = await artifactStore.read<FakeOutput>({ runId, stage: "test-stage", name: "test-artifact" });
  assert.deepEqual(persisted, { value: 42 });
  assert.equal((persisted as unknown as Record<string, unknown>).payload, undefined);

  // 3b. Event publishing untouched: buildEvent() still received the RAW output, not the wrapper.
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "RepositoryAnalyzed");
  if (events[0]?.type === "RepositoryAnalyzed") {
    assert.equal(events[0].summary.projectName, "received-value-42-at-test-stage/test-artifact");
  }
});
