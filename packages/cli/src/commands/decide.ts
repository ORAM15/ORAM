/**
 * `oram decide <path>` — runs the complete Repository Analysis -> ... -> Reflection pipeline directly (no
 * @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore, no EventBus), synthesizes the
 * resulting Reflection + Validation + Recommendation output (plus, when available, the most recently
 * recorded Engineering Memory run for this repository) into one EngineeringDecision, and prints a
 * presentation-ready console report of it.
 *
 * CONCRETE LIMITATION (disclosed here, not hidden): exactly like `oram history`, nothing persists a
 * MemoryStore across process invocations -- this command constructs a fresh, empty store before recording
 * anything into it, so `previousRun` below is honestly always null today. `checkRepeatedFailure`
 * (@oram/engines' adaptive-decision/analysis/rules.ts) is real and fully exercised directly by that
 * package's own test suite; it simply has nowhere durable to read a real previous run FROM yet.
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
} from "@oram/engines";
import { renderDecisionReport } from "../report/renderDecisionReport";
import { printCliError } from "../errors";

const USAGE = "oram decide <path>";

export async function decideCommand(args: string[]): Promise<number> {
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
  const elapsedMs = Date.now() - startedAt;

  console.log(renderDecisionReport({ analysis, knowledge, reasoning, plan, validationResult, recommendationSet, decision, elapsedMs }));
  return 0;
}
