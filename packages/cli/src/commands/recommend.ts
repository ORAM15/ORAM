/**
 * `oram recommend <path>` — runs the complete Repository Analysis -> ... -> Provider Execution -> Validation
 * -> Recommendation pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no
 * ArtifactStore, no EventBus) and prints a presentation-ready console report of the recommendations produced
 * from each Validation issue. Same shape as analyze.ts/plan.ts/.../execute.ts, one stage further down the
 * pipeline.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions/classes (buildRepositoryAnalysis / ... / runProviderExecutionAll / validateAll / buildRecommendationSet).
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
} from "@oram/engines";
import { renderRecommendationsReport } from "../report/renderRecommendationsReport";
import { printCliError } from "../errors";

const USAGE = "oram recommend <path>";

export async function recommendCommand(args: string[]): Promise<number> {
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
  const elapsedMs = Date.now() - startedAt;

  console.log(renderRecommendationsReport({ analysis, knowledge, reasoning, plan, validationResult, recommendationSet, elapsedMs }));
  return 0;
}
