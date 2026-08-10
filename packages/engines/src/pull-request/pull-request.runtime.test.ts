/**
 * Runtime artifact-handoff coverage for the Pull Request Engine (Capability Sprint 17).
 *
 * Proves the full producer -> consumer chain through the real Runtime machinery: upstream artifacts are
 * persisted once, the Adaptive Decision Engine consumes them and persists its decision, and the Pull Request
 * Engine then consumes ALL SIX declared upstream artifacts -- including the decision the previous engine just
 * produced in the same run -- with the recompute fallback provably never invoked. Also covers the
 * none-available fallback and the partial-run loud failure.
 *
 * Run with: node --import tsx --test packages/engines/src/pull-request/pull-request.runtime.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createRuntimeContext,
  InMemoryEventBus,
  BufferedLogger,
  InMemoryProviderRegistry,
  FileSystemArtifactStore,
  EngineRunner,
  type RuntimeContext,
} from "@oram/runtime";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "../execution-planning/analysis/build-execution-plans";
import { runAll as runProviderExecutionAll } from "../provider-execution/ProviderExecutionEngine";
import { validateAll } from "../validation/ValidationEngine";
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import { createAdaptiveDecisionEngine } from "../adaptive-decision/DecisionEngine";
import type { EngineeringDecision } from "../adaptive-decision/analysis/types";
import { buildPullRequestProposal } from "./analysis/build-pull-request-proposal";
import { createPullRequestEngine, PULL_REQUEST_UPSTREAM_ARTIFACTS } from "./PullRequestEngine";
import type { PullRequestInputs, PullRequestProposal } from "./analysis/types";

const FIXTURE = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__", "concentrated-monorepo");

interface Upstream {
  readonly requestSet: ReturnType<typeof buildImplementationRequests>;
  readonly planSet: ReturnType<typeof buildExecutionPlans>;
  readonly validationResult: ReturnType<typeof validateAll>;
  readonly recommendationSet: ReturnType<typeof buildRecommendationSet>;
  readonly reflectionReport: ReturnType<typeof buildReflectionReport>;
}

function computeUpstream(root: string): Upstream {
  const requestSet = buildImplementationRequests(
    buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(root)))))
  );
  const planSet = buildExecutionPlans(requestSet);
  const patches = runProviderExecutionAll(planSet).flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  return { requestSet, planSet, validationResult, recommendationSet, reflectionReport };
}

async function makeHarness(t: { after(fn: () => Promise<void>): void }): Promise<{ context: RuntimeContext; store: FileSystemArtifactStore; runner: EngineRunner }> {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-pr-handoff-"));
  t.after(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true });
  });
  const store = new FileSystemArtifactStore(baseDir);
  const context = createRuntimeContext({
    repositoryRoot: FIXTURE,
    logger: new BufferedLogger(),
    eventBus: new InMemoryEventBus(),
    artifactStore: store,
    providerRegistry: new InMemoryProviderRegistry(),
  });
  return { context, store, runner: new EngineRunner(context) };
}

async function seedUpstream(store: FileSystemArtifactStore, runId: string, upstream: Upstream): Promise<void> {
  await store.write({ runId, stage: "implementation-requests", name: "implementation-requests" }, upstream.requestSet);
  await store.write({ runId, stage: "execution-planning", name: "execution-planning" }, upstream.planSet);
  await store.write({ runId, stage: "validation", name: "validation" }, upstream.validationResult);
  await store.write({ runId, stage: "recommendation", name: "recommendation" }, upstream.recommendationSet);
  await store.write({ runId, stage: "reflection", name: "reflection" }, upstream.reflectionReport);
}

function forbiddenFallback(): PullRequestInputs {
  throw new Error("fallback loadInputs was invoked -- the engine recomputed instead of consuming this run's artifacts");
}

test("chain: upstream artifacts -> Adaptive Decision -> Pull Request Engine, every stage consuming the previous stage's persisted output", async (t) => {
  const { store, runner } = await makeHarness(t);
  const runId = "RUN-PR-CHAIN";
  const upstream = computeUpstream(FIXTURE);
  await seedUpstream(store, runId, upstream);

  // Stage A: Adaptive Decision consumes validation/recommendation/reflection artifacts and persists its decision.
  await runner.run(runId, createAdaptiveDecisionEngine(() => {
    throw new Error("decision fallback invoked -- should have consumed artifacts");
  }));
  const decision = await store.read<EngineeringDecision>({ runId, stage: "adaptive-decision", name: "engineering-decision" });

  // Stage B: Pull Request Engine consumes all six upstream artifacts -- including the decision Stage A just wrote.
  const artifact = await runner.run(runId, createPullRequestEngine(forbiddenFallback));
  const proposal = artifact.payload;

  // The proposal is exactly what the pure function produces from those same artifacts (modulo id/timestamp).
  const expected = buildPullRequestProposal({ repositoryRoot: FIXTURE, ...upstream, decision });
  assert.equal(proposal.body, expected.body);
  assert.equal(proposal.title, expected.title);
  assert.equal(proposal.branchName, expected.branchName);
  assert.equal(proposal.decision, decision.decisionType);
  assert.equal(proposal.risk, decision.riskLevel);
  assert.equal(proposal.repositoryId, "repository:concentrated-monorepo");

  // And it was persisted for any future downstream stage of the same run.
  const persisted = await store.read<PullRequestProposal>({ runId, stage: "pull-request", name: "pull-request-proposal" });
  assert.equal(persisted.body, expected.body);
});

test("fallback: with NO upstream artifacts for this run, the documented recompute fallback runs exactly once", async (t) => {
  const { runner } = await makeHarness(t);
  const upstream = computeUpstream(FIXTURE);
  const decision: EngineeringDecision = {
    id: "decision:synthetic",
    timestamp: "2026-01-01T00:00:00.000Z",
    decisionType: "CONTINUE",
    reason: "synthetic",
    confidence: 0.9,
    riskLevel: "LOW",
    nextAction: "synthetic",
    evidenceIds: [],
    policyIds: [],
  };
  let fallbackInvocations = 0;

  const artifact = await runner.run(
    "RUN-PR-EMPTY",
    createPullRequestEngine(() => {
      fallbackInvocations += 1;
      return { repositoryRoot: FIXTURE, ...upstream, decision };
    })
  );

  assert.equal(fallbackInvocations, 1);
  assert.equal(artifact.payload.decision, "CONTINUE");
});

test("partial run: some-but-not-all upstream artifacts fail loudly, naming exactly the missing ones", async (t) => {
  const { store, runner } = await makeHarness(t);
  const runId = "RUN-PR-PARTIAL";
  const upstream = computeUpstream(FIXTURE);

  // Persist only the first declared dependency; the other five stay absent.
  const [first, ...rest] = PULL_REQUEST_UPSTREAM_ARTIFACTS;
  await store.write({ runId, stage: first!.stage, name: first!.name }, upstream.requestSet);

  await assert.rejects(
    () => runner.run(runId, createPullRequestEngine(forbiddenFallback)),
    (error: Error) =>
      error.message.includes(`run "${runId}"`) &&
      rest.every((dependency) => error.message.includes(`${dependency.stage}/${dependency.name}`)) &&
      error.message.includes("Refusing to mix persisted artifacts with recomputation")
  );
});
