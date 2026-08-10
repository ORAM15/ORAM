/**
 * `oram pull-request <path>` — runs the complete Repository Analysis -> ... -> Adaptive Decision -> Pull
 * Request Engine pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no
 * ArtifactStore, no EventBus) and prints a presentation-ready console report of the resulting
 * PullRequestProposal, including its full markdown body. Same shape as decide.ts, one pipeline stage
 * further down.
 *
 * SAFETY (the Sprint's own hard rule, restated where it's enforced): this command creates NO pull request,
 * calls NO GitHub API, runs NO git command, writes NO file, and invokes NO LLM. The proposal is a pure,
 * deterministic artifact for a future Runtime/Publisher layer to consume.
 *
 * CONCRETE LIMITATION (inherited unchanged from decide.ts): nothing persists a MemoryStore across process
 * invocations, so the decision's `previousRun` is honestly always null today.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions/classes.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  buildRepositoryAnalysis,
  buildEngineeringKnowledge,
  buildEngineeringReasoning,
  buildEngineeringPlan,
  buildMissionGraph,
  buildImplementationRequests,
  buildExecutionPlans,
  runProviderExecutionAll,
  validateAll,
  buildRecommendationSet,
  buildReflectionReport,
  buildEngineeringDecision,
  buildPullRequestProposal,
} from "@oram/engines";
import { renderPullRequestReport } from "../report/renderPullRequestReport";
import { printCliError } from "../errors";

const USAGE = "oram pull-request <path>";

export async function pullRequestCommand(args: string[]): Promise<number> {
  const [rawPath] = args;

  if (!rawPath) {
    printCliError("missing required argument <path>", USAGE);
    return 1;
  }

  const targetPath = path.resolve(rawPath);

  if (!existsSync(targetPath)) {
    printCliError(`repository not found at "${targetPath}"`, USAGE);
    return 1;
  }

  const startedAt = Date.now();
  const analysis = buildRepositoryAnalysis(targetPath);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const providerResults = runProviderExecutionAll(planSet);
  const patches = providerResults.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });
  const proposal = buildPullRequestProposal({
    repositoryRoot: targetPath,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
    decision,
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(renderPullRequestReport({ analysis, knowledge, reasoning, plan, decision, proposal, elapsedMs }));
  return 0;
}
