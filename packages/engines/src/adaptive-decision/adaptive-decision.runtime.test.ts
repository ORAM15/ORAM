/**
 * Runtime artifact-handoff coverage for the Adaptive Decision Engine (Capability Sprint 17).
 *
 * Proves that createAdaptiveDecisionEngine()'s Runtime path consumes the current run's persisted upstream
 * artifacts (validation / recommendation / reflection) instead of recomputing the pipeline:
 *   - full availability -> artifacts consumed, fallback loader NEVER invoked, decision semantics unchanged;
 *   - none available -> the pre-existing, documented recompute fallback runs (exactly once);
 *   - partial availability -> a loud, deterministic error naming exactly the missing artifact(s).
 *
 * Run with: node --import tsx --test packages/engines/src/adaptive-decision/adaptive-decision.runtime.test.ts
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
import { buildEngineeringDecision } from "./analysis/build-decision";
import { createAdaptiveDecisionEngine, DECISION_UPSTREAM_ARTIFACTS } from "./DecisionEngine";
import type { DecisionInputs, EngineeringDecision } from "./analysis/types";

const FIXTURE = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__", "concentrated-monorepo");

function computeUpstream(root: string): DecisionInputs {
  const planSet = buildExecutionPlans(
    buildImplementationRequests(
      buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(root)))))
    )
  );
  const patches = runProviderExecutionAll(planSet).flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  return { validationResult, recommendationSet, reflectionReport, previousRun: null };
}

async function makeHarness(t: { after(fn: () => Promise<void>): void }): Promise<{ context: RuntimeContext; store: FileSystemArtifactStore; runner: EngineRunner }> {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-decision-handoff-"));
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

/** A fallback loader that fails the test if the engine ever recomputes -- the proof that artifacts were consumed instead. */
function forbiddenFallback(): DecisionInputs {
  throw new Error("fallback loadInputs was invoked -- the engine recomputed instead of consuming this run's artifacts");
}

test("handoff: with all upstream artifacts persisted, the decision is made FROM them -- the recompute fallback is never invoked", async (t) => {
  const { store, runner } = await makeHarness(t);
  const runId = "RUN-DECISION-HANDOFF";
  const upstream = computeUpstream(FIXTURE);

  await store.write({ runId, stage: "validation", name: "validation" }, upstream.validationResult);
  await store.write({ runId, stage: "recommendation", name: "recommendation" }, upstream.recommendationSet);
  await store.write({ runId, stage: "reflection", name: "reflection" }, upstream.reflectionReport);

  const artifact = await runner.run(runId, createAdaptiveDecisionEngine(forbiddenFallback));
  const decision = artifact.payload;

  // Decision semantics unchanged: identical (modulo id/timestamp) to the direct pure-function result.
  const expected = buildEngineeringDecision(upstream);
  assert.equal(decision.decisionType, expected.decisionType);
  assert.equal(decision.reason, expected.reason);
  assert.equal(decision.riskLevel, expected.riskLevel);
  assert.equal(decision.nextAction, expected.nextAction);
  assert.deepEqual(decision.evidenceIds, expected.evidenceIds);
  assert.deepEqual(decision.policyIds, expected.policyIds);

  // The engine's own output was persisted for downstream stages, same run.
  const persisted = await store.read<EngineeringDecision>({ runId, stage: "adaptive-decision", name: "engineering-decision" });
  assert.equal(persisted.decisionType, expected.decisionType);
});

test("fallback: with NO upstream artifacts for this run, the documented recompute fallback runs exactly once", async (t) => {
  const { runner } = await makeHarness(t);
  let fallbackInvocations = 0;
  const upstream = computeUpstream(FIXTURE);

  const artifact = await runner.run(
    "RUN-DECISION-EMPTY",
    createAdaptiveDecisionEngine(() => {
      fallbackInvocations += 1;
      return upstream;
    })
  );

  assert.equal(fallbackInvocations, 1);
  assert.equal(artifact.payload.decisionType, buildEngineeringDecision(upstream).decisionType);
});

test("partial run: some-but-not-all upstream artifacts fail loudly, naming exactly the missing ones", async (t) => {
  const { store, runner } = await makeHarness(t);
  const runId = "RUN-DECISION-PARTIAL";
  const upstream = computeUpstream(FIXTURE);

  // Persist only the first declared dependency; leave the other two absent.
  const [first, ...rest] = DECISION_UPSTREAM_ARTIFACTS;
  await store.write({ runId, stage: first!.stage, name: first!.name }, upstream.validationResult);

  await assert.rejects(
    () => runner.run(runId, createAdaptiveDecisionEngine(forbiddenFallback)),
    (error: Error) =>
      error.message.includes(`run "${runId}"`) &&
      rest.every((dependency) => error.message.includes(`${dependency.stage}/${dependency.name}`)) &&
      error.message.includes("Refusing to mix persisted artifacts with recomputation")
  );
});
