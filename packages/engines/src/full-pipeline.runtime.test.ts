/**
 * End-to-end coverage for the FULL real Runtime pipeline (Capability Sprint 18): Runtime.runPipeline() +
 * createFullPipelineEngines() against the concentrated-monorepo fixture.
 *
 * The strongest assertion is structural: every downstream engine in createFullPipelineEngines() is wired
 * with a THROWING recompute fallback, so the pipeline completing at all proves every stage consumed its
 * upstream artifacts from the current run -- recomputation anywhere would abort the run. On top of that this
 * file asserts the persisted artifact set, the COMPLETE lifecycle, and that the final PullRequestProposal is
 * exactly what the pure functions produce from the same fixture (modulo timestamp-derived ids).
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

test("full pipeline: all 13 real engines run through the Runtime, consuming artifacts (recompute fallbacks would throw), reaching COMPLETE", async (t) => {
  const { artifactStore, runtime } = await makeHarness(t);

  const result = await runtime.runPipeline({ repositoryPath: FIXTURE }, createFullPipelineEngines());

  // A/B. Every expected artifact exists in the same run, in declared stage order.
  const refs = await artifactStore.list(result.runId);
  assert.deepEqual(
    refs.map((ref) => ref.stage),
    [...FULL_ENGINEERING_WORKFLOW.steps]
  );
  assert.ok(refs.every((ref) => ref.runId === result.runId));

  // F. COMPLETE, through the full happy path.
  assert.equal(runtime.lifecycle.state.phase, "COMPLETE");
  assert.deepEqual(
    runtime.lifecycle.state.history.map((entry) => entry.phase),
    ["CREATED", "ANALYZING", "PLANNING", "AWAITING_APPROVAL", "EXECUTING", "VALIDATING", "REFLECTING", "PUBLISHING", "COMPLETE"]
  );

  // E. The proposal was generated from THIS run's artifacts and matches the pure-function result for the
  // same fixture (modulo timestamp-derived id/timestamp), decision included.
  const decision = await artifactStore.read<EngineeringDecision>({ runId: result.runId, stage: "adaptive-decision", name: "engineering-decision" });
  const proposal = await artifactStore.read<PullRequestProposal>({ runId: result.runId, stage: "pull-request", name: "pull-request-proposal" });

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

test("full pipeline: runs against this actual repository without recomputation (smoke)", async (t) => {
  const { runtime } = await makeHarness(t);
  const repoRoot = path.join(import.meta.dirname, "..", "..", "..");

  const result = await runtime.runPipeline({ repositoryPath: repoRoot }, createFullPipelineEngines());

  assert.equal(runtime.lifecycle.state.phase, "COMPLETE");
  assert.equal(result.artifacts.length, FULL_ENGINEERING_WORKFLOW.steps.length);
  const proposal = result.artifacts[result.artifacts.length - 1]!.payload as PullRequestProposal;
  assert.equal(proposal.repositoryId, "repository:oram");
});
