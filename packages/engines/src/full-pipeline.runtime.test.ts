/**
 * End-to-end coverage for the FULL real Runtime pipeline AND its real safety gate (Capability Sprints 18 and
 * 19): Runtime.runPipeline() / .approve() / .reject() + createFullPipelineEngines() against the
 * concentrated-monorepo fixture.
 *
 * The strongest structural assertion carries over from Sprint 18: every downstream engine in
 * createFullPipelineEngines() is wired with a THROWING recompute fallback, so a run reaching COMPLETE proves
 * every stage consumed its upstream artifacts from the current run -- recomputation anywhere would abort it.
 * On top of that, this file proves the REAL gate against the real pipeline: Provider Execution does not run
 * until approve() is called (counted via a test-only wrapper around the real "provider-execution"
 * EngineDescriptor -- no production code is modified to make this observable), and the final
 * PullRequestProposal, once produced, is exactly what the pure functions produce from the same fixture
 * (modulo timestamp-derived ids).
 *
 * Run with: node --import tsx --test packages/engines/src/full-pipeline.runtime.test.ts
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
  type PipelineEngines,
} from "@oram/runtime";
import { FULL_ENGINEERING_WORKFLOW } from "@oram/core";
import { createFullPipelineEngines } from "./full-pipeline";
import type { EngineeringDecision } from "./adaptive-decision/analysis/types";
import type { PullRequestProposal } from "./pull-request/analysis/types";
import { buildRepositoryAnalysis } from "./repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "./engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "./engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "./engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "./engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "./implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "./execution-planning/analysis/build-execution-plans";
import { runAll as runProviderExecutionAll } from "./provider-execution/ProviderExecutionEngine";
import { validateAll } from "./validation/ValidationEngine";
import { buildRecommendationSet } from "./recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "./reflection/analysis/build-reflection";
import { buildPullRequestProposal } from "./pull-request/analysis/build-pull-request-proposal";

const FIXTURE = path.join(import.meta.dirname, "engineering-reasoning", "__fixtures__", "concentrated-monorepo");

async function makeHarness(t: { after(fn: () => Promise<void>): void }) {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-full-pipeline-"));
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

/** Wraps the real "provider-execution" EngineDescriptor to count real invocations -- test-side instrumentation only, zero production changes. */
function withCountedProviderExecution(counter: { count: number }): PipelineEngines {
  const engines = createFullPipelineEngines();
  const real = engines["provider-execution"];
  return {
    ...engines,
    "provider-execution": {
      ...real,
      run: async (context, artifacts) => {
        counter.count += 1;
        return real.run(context, artifacts);
      },
    },
  };
}

test("full pipeline safety gate: Provider Execution does not run until approve() is called, then runs exactly once, reaching COMPLETE", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const paused = await runtime.runPipeline({ repositoryPath: FIXTURE }, withCountedProviderExecution(counter));

  // The gate: paused before Provider Execution, only the 7 pre-approval artifacts exist.
  assert.equal(paused.status, "AWAITING_APPROVAL");
  assert.equal(counter.count, 0, "Provider Execution must not occur before approval");
  const gateIndex = FULL_ENGINEERING_WORKFLOW.steps.indexOf("provider-execution");
  assert.equal(paused.artifacts.length, gateIndex);
  const preRefs = await artifactStore.list(paused.runId);
  assert.deepEqual(
    preRefs.map((ref) => ref.stage),
    FULL_ENGINEERING_WORKFLOW.steps.slice(0, gateIndex)
  );

  const completed = await runtime.approve(paused.runId);

  assert.equal(completed.runId, paused.runId);
  assert.equal(completed.status, "COMPLETE");
  assert.equal(counter.count, 1, "Provider Execution must occur exactly once after approval");
  assert.equal(runtime.lifecycle.state.phase, "COMPLETE");

  // A/B/C/D/E from the Sprint's own requirement list, against the REAL engines: all 13 artifacts persisted,
  // same run, in declared order.
  const refs = await artifactStore.list(completed.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    [...FULL_ENGINEERING_WORKFLOW.steps]
  );

  // The proposal was generated from THIS run's artifacts and matches the pure-function result for the same
  // fixture (modulo timestamp-derived id/timestamp), decision included.
  const decision = await artifactStore.read<EngineeringDecision>({ runId: completed.runId, stage: "adaptive-decision", name: "engineering-decision" });
  const proposal = await artifactStore.read<PullRequestProposal>({ runId: completed.runId, stage: "pull-request", name: "pull-request-proposal" });

  const requestSet = buildImplementationRequests(
    buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(FIXTURE)))))
  );
  const planSet = buildExecutionPlans(requestSet);
  const patches = runProviderExecutionAll(planSet).flatMap((r) => r.steps.map((s) => s.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  const expected = buildPullRequestProposal({ repositoryRoot: FIXTURE, requestSet, planSet, validationResult, recommendationSet, reflectionReport, decision });

  assert.equal(proposal.body, expected.body);
  assert.equal(proposal.title, expected.title);
  assert.equal(proposal.branchName, expected.branchName);
  assert.equal(proposal.decision, decision.decisionType);
  assert.equal(proposal.repositoryId, "repository:concentrated-monorepo");
});

test("full pipeline safety gate: reject() reaches ABORTED, Provider Execution never runs, no post-approval artifact exists", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);
  const counter = { count: 0 };

  const paused = await runtime.runPipeline({ repositoryPath: FIXTURE }, withCountedProviderExecution(counter));
  const rejected = await runtime.reject(paused.runId, "reviewer declined");

  assert.equal(rejected.status, "ABORTED");
  assert.equal(counter.count, 0, "Provider Execution must never occur for a rejected run");
  assert.equal(runtime.lifecycle.state.phase, "ABORTED");

  const gateIndex = FULL_ENGINEERING_WORKFLOW.steps.indexOf("provider-execution");
  const refs = await artifactStore.list(paused.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    FULL_ENGINEERING_WORKFLOW.steps.slice(0, gateIndex),
    "a rejected run must carry no post-approval artifact (no provider-execution, validation, recommendation, reflection, adaptive-decision, or pull-request)"
  );

  await assert.rejects(() => runtime.approve(paused.runId), "approve() must be refused once a run has been rejected");
});

test("full pipeline: runs against this actual repository without recomputation (smoke)", async (t) => {
  const { runtime } = await makeHarness(t);
  const repoRoot = path.join(import.meta.dirname, "..", "..", "..");

  const paused = await runtime.runPipeline({ repositoryPath: repoRoot }, createFullPipelineEngines());
  assert.equal(paused.status, "AWAITING_APPROVAL");

  const completed = await runtime.approve(paused.runId);
  assert.equal(completed.status, "COMPLETE");
  assert.equal(completed.artifacts.length, FULL_ENGINEERING_WORKFLOW.steps.length);
  const proposal = completed.artifacts[completed.artifacts.length - 1]!.payload as PullRequestProposal;
  assert.equal(proposal.repositoryId, "repository:oram");
});
