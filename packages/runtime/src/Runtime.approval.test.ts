/**
 * Regression coverage for the REAL Runtime safety gate (Capability Sprint 19): OramRuntime.approve() /
 * .reject() / .status() resuming or aborting a run paused at AWAITING_APPROVAL by runPipeline().
 *
 * Uses synthetic per-step engines (this package may not import @oram/engines -- System Layers rule; the
 * real-engine end-to-end gate is covered by @oram/engines' own full-pipeline.runtime.test.ts and the CLI's
 * run.test.ts). "Provider Execution" is counted by instrumenting the synthetic "provider-execution" step's
 * own `run()` -- a test double, not a change to any production code.
 *
 * Run with: node --import tsx --test packages/runtime/src/Runtime.approval.test.ts
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
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-runtime-approval-"));
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

/** One synthetic engine per pipeline step. The "provider-execution" step increments the shared counter each time its own `run()` actually executes -- the test's proof of "Provider Execution has/hasn't occurred." */
function makeTrackingEngines(providerExecutionCounter: { count: number }): PipelineEngines {
  const steps = FULL_ENGINEERING_WORKFLOW.steps;
  const entries = steps.map((step) => {
    const engine: EngineDescriptor<{ step: string }> = {
      stage: step,
      artifactName: step,
      run: () => {
        if (step === "provider-execution") providerExecutionCounter.count += 1;
        return { step };
      },
      buildEvent: (runId) => testEvent(runId, step),
    };
    return [step, engine] as const;
  });
  return Object.fromEntries(entries) as unknown as PipelineEngines;
}

test("A/B: runPipeline() reaches AWAITING_APPROVAL with Provider Execution count exactly 0", async (t) => {
  const { runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const result = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));

  assert.equal(result.status, "AWAITING_APPROVAL");
  assert.equal(runtime.status(result.runId), "AWAITING_APPROVAL");
  assert.equal(counter.count, 0, "Provider Execution must not have occurred before approval");
});

test("C/D/E/N: approve() continues the SAME run, executes Provider exactly once, reaches COMPLETE", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));
  const result = await runtime.approve(paused.runId);

  assert.equal(result.runId, paused.runId, "approve() must resume the SAME run, not start a new one");
  assert.equal(counter.count, 1, "Provider Execution must have occurred exactly once after approval");
  assert.equal(result.status, "COMPLETE");
  assert.equal(runtime.status(paused.runId), "COMPLETE");
  assert.equal(result.artifacts.length, FULL_ENGINEERING_WORKFLOW.steps.length, "COMPLETE must carry every stage's artifact, pre- and post-approval");
  assert.deepEqual(
    runtime.lifecycle.state.history.map((entry) => entry.phase),
    ["CREATED", "ANALYZING", "PLANNING", "AWAITING_APPROVAL", "EXECUTING", "VALIDATING", "REFLECTING", "PUBLISHING", "COMPLETE"]
  );

  // Post-approval artifacts really are persisted under the same runId, same ArtifactStore.
  const refs = await artifactStore.list(paused.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    [...FULL_ENGINEERING_WORKFLOW.steps]
  );
});

test("F/G: reject() reaches ABORTED with Provider Execution count remaining 0, only pre-approval artifacts persisted", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));
  const result = await runtime.reject(paused.runId, "not ready yet");

  assert.equal(result.status, "ABORTED");
  assert.equal(runtime.status(paused.runId), "ABORTED");
  assert.equal(counter.count, 0, "Provider Execution must never occur for a rejected run");

  const gateIndex = FULL_ENGINEERING_WORKFLOW.steps.indexOf("provider-execution");
  assert.equal(result.artifacts.length, gateIndex, "a rejected run must carry only its pre-approval artifacts");

  const refs = await artifactStore.list(paused.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    FULL_ENGINEERING_WORKFLOW.steps.slice(0, gateIndex),
    "no post-approval artifact may exist for a rejected run"
  );
});

test("H: double approval cannot duplicate execution -- the second call fails safely", async (t) => {
  const { runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));
  await runtime.approve(paused.runId);
  assert.equal(counter.count, 1);

  await assert.rejects(() => runtime.approve(paused.runId));
  assert.equal(counter.count, 1, "a second approve() must not execute Provider Execution again");
});

test("I: double rejection fails safely", async (t) => {
  const { runtime } = await makeHarness(t);
  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines({ count: 0 }));

  await runtime.reject(paused.runId);
  await assert.rejects(() => runtime.reject(paused.runId));
});

test("J: approve() after reject() fails, and never executes Provider Execution", async (t) => {
  const { runtime } = await makeHarness(t);
  const counter = { count: 0 };
  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));

  await runtime.reject(paused.runId);
  await assert.rejects(() => runtime.approve(paused.runId));
  assert.equal(counter.count, 0);
  assert.equal(runtime.status(paused.runId), "ABORTED", "rejection must remain the final state -- approve() must not resurrect it");
});

test("K: reject() after approve() fails, and does not disturb the completed run", async (t) => {
  const { runtime } = await makeHarness(t);
  const counter = { count: 0 };
  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));

  await runtime.approve(paused.runId);
  await assert.rejects(() => runtime.reject(paused.runId));
  assert.equal(counter.count, 1);
  assert.equal(runtime.status(paused.runId), "COMPLETE", "approval must remain the final state -- reject() must not abort it after the fact");
});

test("L: approval from the wrong lifecycle state fails -- a run at AWAITING_APPROVAL via start() (not runPipeline()) has no pending pipeline gate", async (t) => {
  const { runtime } = await makeHarness(t);

  const handle = await runtime.start({ repositoryPath: "/fake/repo" });
  assert.equal(runtime.status(handle.runId), "AWAITING_APPROVAL", "start()'s own placeholder workflow does reach AWAITING_APPROVAL");

  // Despite the Lifecycle phase matching, this run was never registered as a pending PIPELINE approval --
  // approve()/reject() must refuse it rather than treating "any AWAITING_APPROVAL Lifecycle" as fair game.
  await assert.rejects(() => runtime.approve(handle.runId));
  await assert.rejects(() => runtime.reject(handle.runId));

  // And a wholly unknown runId fails the same way.
  await assert.rejects(() => runtime.approve("RUN-DOES-NOT-EXIST"));
});

test("M: concurrent approve() calls for the same run cannot execute Provider Execution twice", async (t) => {
  const { runtime } = await makeHarness(t);
  const counter = { count: 0 };
  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, makeTrackingEngines(counter));

  const [first, second] = await Promise.allSettled([runtime.approve(paused.runId), runtime.approve(paused.runId)]);

  const outcomes = [first.status, second.status].sort();
  assert.deepEqual(outcomes, ["fulfilled", "rejected"], "exactly one concurrent approve() call must win, the other must fail safely");
  assert.equal(counter.count, 1, "Provider Execution must have run exactly once despite the concurrent calls");
});

test("execution failure after approval: a post-approval stage failure transitions to ABORTED and rethrows", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const counter = { count: 0 };
  const engines = { ...makeTrackingEngines(counter) } as Record<PipelineStepId, EngineDescriptor<unknown>>;
  engines.validation = {
    stage: "validation",
    artifactName: "validation",
    run: () => {
      throw new Error("synthetic post-approval failure");
    },
    buildEvent: (runId) => testEvent(runId, "validation"),
  };

  const paused = await runtime.runPipeline({ repositoryPath: "/fake/repo" }, engines as PipelineEngines);
  await assert.rejects(
    () => runtime.approve(paused.runId),
    (error: Error) => error.message === "synthetic post-approval failure"
  );

  assert.equal(runtime.status(paused.runId), "ABORTED");
  assert.equal(counter.count, 1, "provider-execution (before the failing stage) still ran once");

  // "validation" itself never persisted (EngineRunner only persists successful output).
  const refs = await artifactStore.list(paused.runId);
  assert.ok(!refs.some((ref) => ref.stage === "validation"));
  assert.ok(refs.some((ref) => ref.stage === "provider-execution"));
});
