/**
 * `oram execute <path>` — runs the complete Repository Analysis -> Engineering Knowledge -> Engineering
 * Reasoning -> Engineering Planning -> Engineering Missions -> Implementation Requests -> Execution Planning
 * -> Implementation Executor pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no
 * ArtifactStore, no EventBus) and prints a presentation-ready console report of what happened when each
 * Execution Plan's steps were run. Same shape as analyze.ts/plan.ts/.../execute-plan.ts, one stage further
 * down the pipeline.
 *
 * SUPERSEDES (Capability Sprint 8) an earlier stub of this same command whose documented future purpose was
 * "run the previously-planned Mission's Work Order through the configured Provider," gated by an explicit
 * `--approve` flag, wired to `@oram/runtime`'s (not-yet-implemented) `Runtime.approve()`. That heavier,
 * human-approval-gated design is still the right target for a REAL Provider-backed execution command -- it
 * is not built here (`Runtime` is explicitly out of scope for this Sprint) and remains a TODO. What this
 * command does today is deliberately lighter: it runs @oram/engines' `ImplementationExecutor` with its
 * default MemoryAdapter, which touches NEITHER git NOR the filesystem NOR any shell command -- every
 * "execution" shown below is a deterministic, in-memory simulation, exactly like every other command in this
 * file's family is a demo of the Intelligence layer's output, not a real side-effecting action.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions/classes (buildRepositoryAnalysis / buildEngineeringKnowledge / buildEngineeringReasoning /
 * buildEngineeringPlan / buildMissionGraph / buildImplementationRequests / buildExecutionPlans / executeAll).
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
  executeAll,
} from "@oram/engines";
import { renderExecutionReport } from "../report/renderExecutionReport";
import { printCliError } from "../errors";

const USAGE = "oram execute <path>";

export async function executeCommand(args: string[]): Promise<number> {
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
  const results = executeAll(planSet);
  const elapsedMs = Date.now() - startedAt;

  console.log(renderExecutionReport({ analysis, knowledge, reasoning, plan, planSet, results, elapsedMs }));
  return 0;
}
