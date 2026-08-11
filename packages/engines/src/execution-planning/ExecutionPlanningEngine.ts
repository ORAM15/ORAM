/**
 * ExecutionPlanningEngine — wraps buildExecutionPlans() (./analysis/build-execution-plans.ts) as an
 * EngineDescriptor, following the exact same shape as ImplementationRequestsEngine.ts / EngineeringMissionsEngine.ts.
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (the same two gaps disclosed one stage
 * up in ImplementationRequestsEngine.ts, now one stage further down the pipeline)
 *
 *   1. Same gap as ImplementationRequestsEngine.ts: EngineDescriptor.run(context) receives no `runId`, so
 *      this engine cannot read Implementation Requests' actual persisted ImplementationRequestSet artifact
 *      for THIS run. Default behavior recomputes the entire pipeline from scratch via
 *      buildRepositoryAnalysis() + buildEngineeringKnowledge() + buildEngineeringReasoning() +
 *      buildEngineeringPlan() + buildMissionGraph() + buildImplementationRequests() -- same deterministic
 *      result, extra CPU, no Runtime change. A caller holding the real upstream ImplementationRequestSet can
 *      bypass this via the optional `loadImplementationRequests` parameter below.
 *
 *   2. @oram/events still has no event type for "Execution Plans produced" (see
 *      ImplementationRequestsEngine.ts). RecommendationsGeneratedEvent is reused again here for the same
 *      reason, now a further stretch still: `opportunityCount: plans.length`, `topOpportunityId: null`. A
 *      dedicated ExecutionPlansGeneratedEvent is the correct long-term fix, left for a future PR.
 *
 * This engine's `run()` -- like every function in ./analysis/ -- reads no file, writes no file, spawns no
 * process, and calls no Provider. It only computes and returns a value, exactly like every other engine in
 * this package; @oram/runtime is imported here only for the EngineDescriptor/RuntimeContext/ArtifactRef
 * TYPES this wrapper's shape requires, matching every prior stage.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import type { ImplementationRequestSet } from "../implementation-requests/analysis/types";
import { buildExecutionPlans } from "./analysis/build-execution-plans";
import type { ExecutionPlanSet } from "./analysis/types";

export function createExecutionPlanningEngine(
  loadImplementationRequests: (context: RuntimeContext) => ImplementationRequestSet = (context) =>
    buildImplementationRequests(
      buildMissionGraph(
        buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))))
      )
    )
): EngineDescriptor<ExecutionPlanSet> {
  return {
    stage: "execution-planning",
    artifactName: "execution-planning",
    // Sprint 18: consumes the current run's persisted implementation-requests artifact when available;
    // falls back to the injected/default loader otherwise (Sprint 17's artifact-first contract).
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<ExecutionPlanSet> {
      const fromRun =
        artifacts && (await artifacts.has("implementation-requests", "implementation-requests"))
          ? await artifacts.require<ImplementationRequestSet>("implementation-requests", "implementation-requests")
          : null;
      const requestSet = fromRun ?? loadImplementationRequests(context);
      return buildExecutionPlans(requestSet);
    },
    buildEvent(runId: string, output: ExecutionPlanSet, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.plans.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
