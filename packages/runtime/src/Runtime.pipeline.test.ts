/**
 * Regression coverage for OramRuntime.runPipeline() (Capability Sprint 18 -- Full Runtime Pipeline).
 *
 * Uses synthetic per-step engines (this package may not import @oram/engines -- System Layers rule; the
 * real-engine pipeline is covered by @oram/engines' own full-pipeline.runtime.test.ts) to prove the
 * orchestration itself:
 *   - every FULL_ENGINEERING_WORKFLOW step executes, in declared order, exactly once;
 *   - the Lifecycle walks the complete happy path CREATED -> ... -> COMPLETE with no repeats or skips;
 *   - every stage's artifact is persisted under the SAME runId, in write order;
 *   - a stage failure transitions to ABORTED, rethrows, and executes nothing further;
 *   - Runtime.start()'s pre-existing four-step placeholder behavior is untouched (its own frozen tests in
 *     Runtime.workflow.test.ts keep proving that -- this file does not re-test it).
 *
 * Run with: node --import tsx --test packages/runtime/src/Runtime.pipeline.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { OramRuntime, InMemoryEventBus, BufferedLogger, InMemoryProviderRegistry, FileSystemArtifactStore, type PipelineEngines } from "./index";
import { FULL_ENGINEERING_WORKFLOW, type PipelineStepId } from "@oram/core";
import type { EngineDescriptor } from "./EngineRunner";
import type { OramEvent } from "@oram/events";

function testEvent(runId: string, name: string): OramEvent {
  return { type: "RepositoryAnalyzed", runId, timestamp: new Date().toISOString(), summary: { projectName: name, fileCount: 0, languages: [] } };
}

async function makeHarness(t: { after(fn: () => Promise<void>): void }) {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-runtime-pipeline-"));
  t.after(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true });
  });
  const artifactStore = new FileSystemArtifactStore(baseDir);
  const runtime = new OramRuntime({
    eventBus: new InMemoryEventBus(),
    artifactStore,
    providerRegistry: new InMemoryProviderRegistry(),
    logger: new BufferedLogger(),
  });
  return { artifactStore, runtime };
}

/** One synthetic engine per pipeline step: records its execution and (like the real engines) reads the previous step's artifact from the run, proving handoff happens through the orchestrator too, not only in @oram/engines. */
function makeTrackingEngines(executionOrder: string[]): PipelineEngines {
  const steps = FULL_ENGINEERING_WORKFLOW.steps;
  const entries = steps.map((step, index) => {
    const previous: PipelineStepId | null = index > 0 ? steps[index - 1]! : null;
    const engine: EngineDescriptor<{ step: string; sawPrevious: boolean }> = {
      stage: step,
      artifactName: step,
      run: async (_context, artifacts) => {
        executionOrder.push(step);
        const sawPrevious = previous ? await artifacts!.has(previous, previous) : true;
        return { step, sawPrevious };
      },
      buildEvent: (runId) => testEvent(runId, step),
    };
    return [step, engine] as const;
  });
  return Object.fromEntries(entries) as unknown as PipelineEngines;
}

test("runPipeline: executes every step in declared order, reaches COMPLETE, persists every artifact under the same run", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const executionOrder: string[] = [];

  const result = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(executionOrder));

  // C. Stage ordering is exactly the declarative workflow's order.
  assert.deepEqual(executionOrder, [...FULL_ENGINEERING_WORKFLOW.steps]);

  // F. The full happy path, each phase entered exactly once.
  assert.deepEqual(
    runtime.lifecycle.state.history.map((entry) => entry.phase),
    ["CREATED", "ANALYZING", "PLANNING", "AWAITING_APPROVAL", "EXECUTING", "VALIDATING", "REFLECTING", "PUBLISHING", "COMPLETE"]
  );
  assert.equal(runtime.lifecycle.state.phase, "COMPLETE");

  // B. Every artifact persisted, same runId, write order = execution order.
  const refs = await artifactStore.list(result.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    [...FULL_ENGINEERING_WORKFLOW.steps]
  );
  assert.ok(refs.every((ref) => ref.runId === result.runId));
  assert.equal(result.artifacts.length, FULL_ENGINEERING_WORKFLOW.steps.length);

  // D. Every non-first stage really saw its predecessor's artifact through RunArtifacts.
  for (const artifact of result.artifacts) {
    assert.equal((artifact.payload as { sawPrevious: boolean }).sawPrevious, true, `${artifact.type} should have seen its predecessor's artifact`);
  }
});

test("runPipeline: a stage failure transitions to ABORTED, rethrows, and executes nothing further", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const executionOrder: string[] = [];
  const engines = { ...makeTrackingEngines(executionOrder) } as Record<PipelineStepId, EngineDescriptor<unknown>>;
  engines.validation = {
    stage: "validation",
    artifactName: "validation",
    run: () => {
      executionOrder.push("validation");
      throw new Error("synthetic validation failure");
    },
    buildEvent: (runId) => testEvent(runId, "validation"),
  };

  await assert.rejects(
    () => runtime.runPipeline({ repositoryPath: "/fake/repo" }, engines as PipelineEngines),
    (error: Error) => error.message === "synthetic validation failure"
  );

  // G. ABORTED, and nothing after the failing stage ran.
  assert.equal(runtime.lifecycle.state.phase, "ABORTED");
  const failedIndex = FULL_ENGINEERING_WORKFLOW.steps.indexOf("validation");
  assert.deepEqual(executionOrder, FULL_ENGINEERING_WORKFLOW.steps.slice(0, failedIndex + 1));

  // The failing stage's artifact was never persisted -- EngineRunner persists only successful outputs.
  const runId = runtime.lifecycle.state.runId;
  const refs = await artifactStore.list(runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    FULL_ENGINEERING_WORKFLOW.steps.slice(0, failedIndex)
  );
});
