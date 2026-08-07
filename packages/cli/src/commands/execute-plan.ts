/**
 * `oram execute-plan <path>` — runs the complete Repository Analysis -> Engineering Knowledge -> Engineering
 * Reasoning -> Engineering Planning -> Engineering Missions -> Implementation Requests -> Execution Planning
 * pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore, no
 * EventBus) and prints a presentation-ready console report of the resulting execution plans. Same shape as
 * analyze.ts/plan.ts/missions.ts/requests.ts, one stage further down the pipeline.
 *
 * PURPOSE: a fast, side-effect-free, presentation-ready demo of what ORAM's Intelligence layer already
 * produces for a given repository -- persisting nothing, publishing nothing, calling no Provider, executing
 * nothing. This command does NOT modify any file and does NOT execute any command -- it only prints the
 * deterministic execution plans @oram/engines computed; nothing in the pipeline it calls does either. Not
 * the same thing as a future `oram run`, which will go through the real Runtime/Lifecycle.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions (buildRepositoryAnalysis / buildEngineeringKnowledge / buildEngineeringReasoning /
 * buildEngineeringPlan / buildMissionGraph / buildImplementationRequests / buildExecutionPlans).
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
} from "@oram/engines";
import { renderExecutionPlanReport } from "../report/renderExecutionPlanReport";
import { printCliError } from "../errors";

const USAGE = "oram execute-plan <path>";

export async function executePlanCommand(args: string[]): Promise<number> {
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
  const elapsedMs = Date.now() - startedAt;

  console.log(renderExecutionPlanReport({ analysis, knowledge, reasoning, plan, requestSet, planSet, elapsedMs }));
  return 0;
}
