/**
 * `oram reflect <path>` — runs the complete Repository Analysis -> ... -> Validation -> Recommendation ->
 * Reflection pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore,
 * no EventBus) and prints a presentation-ready console report of the ReflectionReport reasoned over that
 * batch's Validation + Recommendation output. Same shape as analyze.ts/plan.ts/.../recommend.ts, one stage
 * further down the pipeline.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions/classes (buildRepositoryAnalysis / ... / buildRecommendationSet / buildReflectionReport).
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
} from "@oram/engines";
import { renderReflectionReport } from "../report/renderReflectionReport";
import { printCliError } from "../errors";

const USAGE = "oram reflect <path>";

export async function reflectCommand(args: string[]): Promise<number> {
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
  const elapsedMs = Date.now() - startedAt;

  console.log(
    renderReflectionReport({ analysis, knowledge, reasoning, plan, validationResult, recommendationSet, reflectionReport, elapsedMs })
  );
  return 0;
}
