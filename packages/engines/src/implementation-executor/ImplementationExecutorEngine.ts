/**
 * ImplementationExecutorEngine — wraps executeAll() (./ImplementationExecutor.ts) as an EngineDescriptor,
 * following the exact same shape as ExecutionPlanningEngine.ts / ImplementationRequestsEngine.ts. Its
 * artifact is a plain `ExecutionResult[]`, not a new named "Set" type -- see
 * ./analysis/types.ts's own header comment for why (this Sprint's own spec asked only for the singular
 * types, not an aggregate wrapper).
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (the same two gaps disclosed one stage
 * up in ExecutionPlanningEngine.ts, now one stage further down the pipeline)
 *
 *   1. Same gap as ExecutionPlanningEngine.ts: EngineDescriptor.run(context) receives no `runId`, so this
 *      engine cannot read Execution Planning's actual persisted ExecutionPlanSet artifact for THIS run.
 *      Default behavior recomputes the entire pipeline from scratch -- same deterministic result (MemoryAdapter
 *      is deterministic too), extra CPU, no Runtime change. A caller holding the real upstream ExecutionPlanSet
 *      can bypass this via the optional `loadExecutionPlans` parameter below.
 *
 *   2. @oram/events still has no event type for "Execution completed" (see ExecutionPlanningEngine.ts).
 *      RecommendationsGeneratedEvent is reused again here for the same reason, now a further stretch still:
 *      `opportunityCount: results.length`, `topOpportunityId: null`. A dedicated ExecutionCompletedEvent is
 *      the correct long-term fix, left for a future PR.
 *
 * Uses MemoryAdapter (the executor's own default) -- this engine, like every other one in this package,
 * touches no git, filesystem, or shell command.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "../execution-planning/analysis/build-execution-plans";
import type { ExecutionPlanSet } from "../execution-planning/analysis/types";
import { executeAll } from "./ImplementationExecutor";
import type { ExecutionResult } from "./analysis/types";

export function createImplementationExecutorEngine(
  loadExecutionPlans: (context: RuntimeContext) => ExecutionPlanSet = (context) =>
    buildExecutionPlans(
      buildImplementationRequests(
        buildMissionGraph(
          buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))))
        )
      )
    )
): EngineDescriptor<ExecutionResult[]> {
  return {
    stage: "implementation-executor",
    artifactName: "implementation-executor",
    run(context: RuntimeContext): ExecutionResult[] {
      const planSet = loadExecutionPlans(context);
      return executeAll(planSet);
    },
    buildEvent(runId: string, output: ExecutionResult[], _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
