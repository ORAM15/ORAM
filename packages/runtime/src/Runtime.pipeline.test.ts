/**
 * Regression coverage for OramRuntime.runPipeline()'s PRE-APPROVAL half (Capability Sprint 18, adjusted by
 * Sprint 19 -- see Runtime.approval.test.ts for the safety-gate mechanism itself: approve()/reject(),
 * concurrency, Provider Execution counting).
 *
 * Uses synthetic per-step engines (this package may not import @oram/engines -- System Layers rule; the
 * real-engine pipeline is covered by @oram/engines' own full-pipeline.runtime.test.ts) to prove:
 *   - every pre-approval FULL_ENGINEERING_WORKFLOW step executes, in declared order, exactly once, and the
 *     run stops at AWAITING_APPROVAL without ever touching "provider-execution" or anything after it;
 *   - the Lifecycle walks CREATED -> ... -> AWAITING_APPROVAL, no further, with no repeats or skips;
 *   - every pre-approval stage's artifact is persisted under the SAME runId, in write order;
 *   - a pre-approval stage failure transitions to ABORTED, rethrows, and executes nothing further;
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

const GATE_INDEX = FULL_ENGINEERING_WORKFLOW.steps.indexOf("provider-execution");
const PRE_APPROVAL_STEPS = FULL_ENGINEERING_WORKFLOW.steps.slice(0, GATE_INDEX);

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

/** One synthetic engine per pipeline step: records its execution and (like the real engines) reads the previous step's artifact from the run, proving handoff happens through the orchestrator too, not only in @oram/engines. Any step from "provider-execution" onward THROWS if reached -- this file only exercises the pre-approval half, so reaching one would mean the safety gate failed to stop. */
function makeTrackingEngines(executionOrder: string[]): PipelineEngines {
  const steps = FULL_ENGINEERING_WORKFLOW.steps;
  const entries = steps.map((step, index) => {
    const previous: PipelineStepId | null = index > 0 ? steps[index - 1]! : null;
    const isPreApproval = index < GATE_INDEX;
    const engine: EngineDescriptor<{ step: string; sawPrevious: boolean }> = {
      stage: step,
      artifactName: step,
      run: async (_context, artifacts) => {
        if (!isPreApproval) throw new Error(`"${step}" ran before approval -- the safety gate failed to stop the pipeline`);
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

test("runPipeline: executes only the pre-approval steps, in declared order, and stops at AWAITING_APPROVAL", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const executionOrder: string[] = [];

  const result = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(executionOrder));

  // Only the pre-approval steps ran, in declared order -- "provider-execution" onward never touched.
  assert.deepEqual(executionOrder, PRE_APPROVAL_STEPS);
  assert.equal(result.status, "AWAITING_APPROVAL");
  assert.equal(result.artifacts.length, PRE_APPROVAL_STEPS.length);

  // The Lifecycle stopped exactly at AWAITING_APPROVAL -- no EXECUTING, no COMPLETE.
  assert.deepEqual(
    runtime.lifecycle.state.history.map((entry) => entry.phase),
    ["CREATED", "ANALYZING", "PLANNING", "AWAITING_APPROVAL"]
  );
  assert.equal(runtime.lifecycle.state.phase, "AWAITING_APPROVAL");
  assert.equal(runtime.status(result.runId), "AWAITING_APPROVAL");

  // Every pre-approval artifact persisted, same runId, write order = execution order; nothing further.
  const refs = await artifactStore.list(result.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    PRE_APPROVAL_STEPS
  );
  assert.ok(refs.every((ref) => ref.runId === result.runId));

  // Every step really saw its predecessor's artifact through RunArtifacts.
  for (const artifact of result.artifacts) {
    assert.equal((artifact.payload as { sawPrevious: boolean }).sawPrevious, true, `${artifact.type} should have seen its predecessor's artifact`);
  }
});

test("runPipeline: a pre-approval stage failure transitions to ABORTED, rethrows, and executes nothing further", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const executionOrder: string[] = [];
  const engines = { ...makeTrackingEngines(executionOrder) } as Record<PipelineStepId, EngineDescriptor<unknown>>;
  engines["engineering-reasoning"] = {
    stage: "engineering-reasoning",
    artifactName: "engineering-reasoning",
    run: () => {
      executionOrder.push("engineering-reasoning");
      throw new Error("synthetic reasoning failure");
    },
    buildEvent: (runId) => testEvent(runId, "engineering-reasoning"),
  };

  await assert.rejects(
    () => runtime.runPipeline({ repositoryPath: "/fake/repo" }, engines as PipelineEngines),
    (error: Error) => error.message === "synthetic reasoning failure"
  );

  assert.equal(runtime.lifecycle.state.phase, "ABORTED");
  const failedIndex = PRE_APPROVAL_STEPS.indexOf("engineering-reasoning");
  assert.deepEqual(executionOrder, PRE_APPROVAL_STEPS.slice(0, failedIndex + 1));

  const runId = runtime.lifecycle.state.runId;
  const refs = await artifactStore.list(runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    PRE_APPROVAL_STEPS.slice(0, failedIndex)
  );

  // A run that aborted before ever reaching the gate has nothing pending -- approve()/reject() must refuse it.
  await assert.rejects(() => runtime.approve(runId));
  await assert.rejects(() => runtime.reject(runId));
});
