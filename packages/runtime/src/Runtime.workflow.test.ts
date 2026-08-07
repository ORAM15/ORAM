/**
 * Regression coverage for the Phase 4 refactor: Runtime.start() now loops over @oram/core's
 * ENGINEERING_WORKFLOW.steps instead of calling Observe/Understand/Reason/Plan as six hardcoded lines.
 * These tests assert the things this PR's own instructions require to remain identical:
 *   1. Steps execute in the same declared order.
 *   2. Lifecycle transitions happen at exactly the same points, in the same order.
 *   3. Default (non-overridden) engine output is persisted under the same artifact stage/name addresses,
 *      and the same event types are published, as before this refactor.
 *   4. (Run.artifacts) start() no longer discards each EngineRunner.run() call's Artifact<unknown> return
 *      value -- Run now collects all four, in order, each still carrying its Artifact<T> metadata.
 *
 * Run with: node --import tsx --test packages/runtime/src/Runtime.workflow.test.ts
 * (see this PR's final report for how the toolchain used to actually execute this was verified).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  OramRuntime,
  InMemoryEventBus,
  BufferedLogger,
  InMemoryProviderRegistry,
  FileSystemArtifactStore,
  type PhaseEngineOverrides,
} from "./index";
import type { OramEvent } from "@oram/events";
import type { EngineDescriptor } from "./EngineRunner";
import type { Run } from "./run/run";

async function makeRuntimeDeps(prefix: string) {
  const artifactBaseDir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const eventBus = new InMemoryEventBus();
  const events: OramEvent[] = [];
  eventBus.onAny((event) => {
    events.push(event);
  });
  return {
    artifactBaseDir,
    eventBus,
    events,
    logger: new BufferedLogger(),
    providerRegistry: new InMemoryProviderRegistry(),
    artifactStore: new FileSystemArtifactStore(artifactBaseDir),
  };
}

test("default (non-overridden) run: same Lifecycle history, same artifact addresses, same event types as before Phase 4", async (t) => {
  const deps = await makeRuntimeDeps("oram-runtime-workflow-default-");
  t.after(async () => {
    await fsp.rm(deps.artifactBaseDir, { recursive: true, force: true });
  });

  const runtime = new OramRuntime({
    eventBus: deps.eventBus,
    artifactStore: deps.artifactStore,
    providerRegistry: deps.providerRegistry,
    logger: deps.logger,
  });

  const handle = await runtime.start({ repositoryPath: "/fake/repo" });

  // 1. Lifecycle: exactly CREATED -> ANALYZING -> PLANNING -> AWAITING_APPROVAL, no repeats, no skips --
  // identical to the pre-refactor hardcoded sequence's transition calls.
  assert.deepEqual(
    runtime.lifecycle.state.history.map((entry) => entry.phase),
    ["CREATED", "ANALYZING", "PLANNING", "AWAITING_APPROVAL"]
  );
  assert.equal(runtime.lifecycle.state.phase, "AWAITING_APPROVAL");

  // 2. Artifacts: the same four stage/name addresses the pre-refactor placeholders always wrote to,
  // in the same (declared workflow) order -- proven via ArtifactStore.list()'s documented write-order guarantee.
  const artifactRefs = await deps.artifactStore.list(handle.runId);
  assert.deepEqual(
    artifactRefs.map((ref) => `${ref.stage}/${ref.name}`),
    ["repository-intelligence/repository-analysis", "engineering-knowledge/engineering-knowledge", "recommendation/recommendations", "work-order/mission"]
  );

  // Every default artifact is still the Phase 2 placeholder shape (simulated: true) -- default behavior is
  // genuinely unchanged, not just re-ordered.
  for (const ref of artifactRefs) {
    const artifact = await deps.artifactStore.read<{ simulated: boolean }>(ref);
    assert.equal(artifact.simulated, true, `expected ${ref.stage}/${ref.name} to still be a Phase 2 placeholder artifact`);
  }

  // 3. Events: the same four event types, in the same order, as the pre-refactor placeholders always published.
  assert.deepEqual(
    deps.events.map((event) => event.type),
    ["RepositoryAnalyzed", "KnowledgeBuilt", "RecommendationsGenerated", "MissionCreated"]
  );
});

test("engine execution order matches ENGINEERING_WORKFLOW.steps exactly, proven via injected order-tracking engines", async (t) => {
  const deps = await makeRuntimeDeps("oram-runtime-workflow-order-");
  t.after(async () => {
    await fsp.rm(deps.artifactBaseDir, { recursive: true, force: true });
  });

  const executionOrder: string[] = [];
  function trackingEngine(stepId: string): EngineDescriptor<{ simulated: true }> {
    return {
      stage: `test-${stepId}`,
      artifactName: stepId,
      run: () => {
        executionOrder.push(stepId);
        return { simulated: true };
      },
      buildEvent: (runId) => ({
        type: "RepositoryAnalyzed",
        runId,
        timestamp: new Date().toISOString(),
        summary: { projectName: stepId, fileCount: 0, languages: [] },
      }),
    };
  }

  const overrides: PhaseEngineOverrides = {
    observe: trackingEngine("observe"),
    understand: trackingEngine("understand"),
    reason: trackingEngine("reason"),
    plan: trackingEngine("plan"),
  };

  const runtime = new OramRuntime(
    {
      eventBus: deps.eventBus,
      artifactStore: deps.artifactStore,
      providerRegistry: deps.providerRegistry,
      logger: deps.logger,
    },
    overrides
  );

  await runtime.start({ repositoryPath: "/fake/repo" });

  assert.deepEqual(executionOrder, ["observe", "understand", "reason", "plan"]);
});

test("Run collects all four produced artifacts, in order, each carrying Artifact<T> metadata", async (t) => {
  const deps = await makeRuntimeDeps("oram-runtime-workflow-artifacts-");
  t.after(async () => {
    await fsp.rm(deps.artifactBaseDir, { recursive: true, force: true });
  });

  const runtime = new OramRuntime({
    eventBus: deps.eventBus,
    artifactStore: deps.artifactStore,
    providerRegistry: deps.providerRegistry,
    logger: deps.logger,
  });

  const before = Date.now();
  const handle = await runtime.start({ repositoryPath: "/fake/repo" });
  const after = Date.now();

  // Run is deliberately NOT part of the public Runtime interface or this package's barrel (see Runtime.ts's
  // own PHASE 4 (Run.artifacts) STATUS note -- "nothing new exposed publicly"). Reaching into the private
  // `runs` map here is a test-only seam, not a widening of the public API.
  const runsMap = (runtime as unknown as { runs: Map<string, Run> }).runs;
  const run = runsMap.get(handle.runId);
  assert.ok(run, "expected OramRuntime to have created and tracked a Run for this run");

  assert.equal(run.artifacts.length, 4);
  assert.deepEqual(
    run.artifacts.map((artifact) => artifact.type),
    ["repository-analysis", "engineering-knowledge", "recommendations", "mission"]
  );
  for (const artifact of run.artifacts) {
    assert.equal(typeof artifact.id, "string");
    assert.ok(artifact.id.length > 0);
    assert.equal(artifact.version, 1);
    const createdAtMs = Date.parse(artifact.createdAt);
    assert.ok(Number.isFinite(createdAtMs));
    assert.ok(createdAtMs >= before && createdAtMs <= after);
  }
});
