/**
 * `oram history <path>` — runs the complete Repository Analysis -> ... -> Reflection -> Engineering Memory
 * pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore, no
 * EventBus) and prints a presentation-ready console report of the run's RunSnapshot plus the MemoryStore's
 * history/statistics for this repository.
 *
 * CONCRETE LIMITATION (disclosed here, not hidden): nothing persists a MemoryStore across process
 * invocations (see @oram/engines' MemoryStore.ts and MemoryEngine.ts for the full explanation) -- this
 * command constructs a fresh MemoryEngine, records exactly the run it just computed, and renders from that
 * single-entry store. "Total Runs" below is therefore always 1 today; the underlying MemoryStore/statistics
 * machinery genuinely supports many runs across many repositories (see memory.test.ts), it simply has
 * nowhere durable to read prior runs FROM yet.
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
  MemoryEngine,
} from "@oram/engines";
import { renderHistoryReport } from "../report/renderHistoryReport";
import { printCliError } from "../errors";

const USAGE = "oram history <path>";

export async function historyCommand(args: string[]): Promise<number> {
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

  const engine = new MemoryEngine();
  const snapshot = engine.record({
    repositoryRoot: targetPath,
    analysis,
    knowledge,
    reasoning,
    plan,
    graph,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(
    renderHistoryReport({
      analysis,
      knowledge,
      reasoning,
      plan,
      snapshot,
      history: engine.memoryStore.historyByRepository(snapshot.repositoryId),
      statistics: engine.memoryStore.statistics(snapshot.repositoryId),
      elapsedMs,
    })
  );
  return 0;
}
