/**
 * Runtime artifact-handoff coverage for the Publisher Engine (Capability Sprint 17's convention, applied to
 * this Sprint 20 engine).
 *
 * Proves the full producer -> consumer chain through the real Runtime machinery: a PullRequestProposal
 * artifact is persisted once, and the Publisher Engine consumes it -- with the recompute fallback provably
 * never invoked. Also covers the not-available fallback (the engine's single declared dependency has no
 * "partial set" case, unlike engines with multiple dependencies -- see this engine's own doc comment).
 *
 * Run with: node --import tsx --test packages/engines/src/publisher/publisher.runtime.test.ts
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
import { buildEngineeringDecision } from "../adaptive-decision/analysis/build-decision";
import { buildPullRequestProposal } from "../pull-request/analysis/build-pull-request-proposal";
import type { PullRequestProposal } from "../pull-request/analysis/types";
import { buildPublishRecord } from "./analysis/build-publish-record";
import { createPublisherEngine } from "./PublisherEngine";
import type { PublisherInputs, PublishRecord } from "./analysis/types";

const FIXTURE = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__", "concentrated-monorepo");

function computeProposal(root: string): PullRequestProposal {
  const requestSet = buildImplementationRequests(
    buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(root)))))
  );
  const planSet = buildExecutionPlans(requestSet);
  const patches = runProviderExecutionAll(planSet).flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });
  return buildPullRequestProposal({ repositoryRoot: root, requestSet, planSet, validationResult, recommendationSet, reflectionReport, decision });
}

async function makeHarness(t: { after(fn: () => Promise<void>): void }): Promise<{ context: RuntimeContext; store: FileSystemArtifactStore; runner: EngineRunner }> {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-publisher-handoff-"));
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

function forbiddenFallback(): PublisherInputs {
  throw new Error("fallback loadInputs was invoked -- the engine recomputed instead of consuming this run's artifacts");
}

test("chain: a persisted PullRequestProposal artifact is consumed by the Publisher Engine, recompute fallback never invoked", async (t) => {
  const { store, runner } = await makeHarness(t);
  const runId = "RUN-PUBLISHER-CHAIN";
  const proposal = computeProposal(FIXTURE);
  await store.write({ runId, stage: "pull-request", name: "pull-request-proposal" }, proposal);

  const artifact = await runner.run(runId, createPublisherEngine(forbiddenFallback));
  const record = artifact.payload;

  const expected = buildPublishRecord({ repositoryRoot: FIXTURE, proposal });
  assert.equal(record.outcome, expected.outcome);
  assert.equal(record.branchName, expected.branchName);
  assert.deepEqual(
    record.stages.map((s) => s.status),
    expected.stages.map((s) => s.status)
  );
  assert.equal(record.repositoryId, "repository:concentrated-monorepo");

  const persisted = await store.read<PublishRecord>({ runId, stage: "publisher", name: "publish-record" });
  assert.equal(persisted.outcome, expected.outcome);
});

test("fallback: with NO upstream artifact for this run, the documented recompute fallback runs exactly once", async (t) => {
  const { runner } = await makeHarness(t);
  const proposal = computeProposal(FIXTURE);
  let fallbackInvocations = 0;

  const artifact = await runner.run(
    "RUN-PUBLISHER-EMPTY",
    createPublisherEngine(() => {
      fallbackInvocations += 1;
      return { repositoryRoot: FIXTURE, proposal };
    })
  );

  assert.equal(fallbackInvocations, 1);
  assert.equal(artifact.payload.outcome, buildPublishRecord({ repositoryRoot: FIXTURE, proposal }).outcome);
});
