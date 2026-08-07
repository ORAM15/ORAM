/**
 * `oram requests <path>` — runs the complete Repository Analysis -> Engineering Knowledge -> Engineering
 * Reasoning -> Engineering Planning -> Engineering Missions -> Implementation Requests pipeline directly (no
 * @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore, no EventBus) and prints a
 * presentation-ready console report of the resulting execution-ready request specifications. Same shape as
 * analyze.ts/plan.ts/missions.ts, one stage further down the pipeline.
 *
 * PURPOSE: a fast, side-effect-free, presentation-ready demo of what ORAM's Intelligence layer already
 * produces for a given repository -- persisting nothing, publishing nothing, calling no Provider, executing
 * nothing. Not the same thing as a future `oram run`, which will go through the real Runtime/Lifecycle.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions (buildRepositoryAnalysis / buildEngineeringKnowledge / buildEngineeringReasoning /
 * buildEngineeringPlan / buildMissionGraph / buildImplementationRequests).
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
} from "@oram/engines";
import { renderImplementationRequestsReport } from "../report/renderImplementationRequestsReport";
import { printCliError } from "../errors";

const USAGE = "oram requests <path>";

export async function requestsCommand(args: string[]): Promise<number> {
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
  const elapsedMs = Date.now() - startedAt;

  console.log(renderImplementationRequestsReport({ analysis, knowledge, reasoning, plan, graph, requestSet, elapsedMs }));
  return 0;
}
