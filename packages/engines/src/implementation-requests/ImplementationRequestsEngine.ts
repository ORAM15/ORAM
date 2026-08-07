/**
 * ImplementationRequestsEngine — wraps buildImplementationRequests() (./analysis/build-implementation-requests.ts)
 * as an EngineDescriptor, following the exact same shape as EngineeringMissionsEngine.ts / EngineeringPlanningEngine.ts.
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (the same two gaps disclosed one stage
 * up in EngineeringMissionsEngine.ts, now one stage further down the pipeline)
 *
 *   1. Same gap as EngineeringMissionsEngine.ts: EngineDescriptor.run(context) receives no `runId`, so this
 *      engine cannot read Missions' actual persisted MissionGraph artifact for THIS run. Default behavior
 *      recomputes the entire pipeline from scratch via buildRepositoryAnalysis() + buildEngineeringKnowledge()
 *      + buildEngineeringReasoning() + buildEngineeringPlan() + buildMissionGraph() -- same deterministic
 *      result, extra CPU, no Runtime change. A caller holding the real upstream MissionGraph can bypass this
 *      via the optional `loadMissionGraph` parameter below.
 *
 *   2. @oram/events still has no event type for "Implementation Requests produced" (see
 *      EngineeringMissionsEngine.ts). RecommendationsGeneratedEvent is reused again here for the same reason,
 *      now a further stretch still: `opportunityCount: requests.length`, `topOpportunityId: null`. A
 *      dedicated ImplementationRequestsGeneratedEvent is the correct long-term fix, left for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import type { MissionGraph } from "../engineering-missions/analysis/types";
import { buildImplementationRequests } from "./analysis/build-implementation-requests";
import type { ImplementationRequestSet } from "./analysis/types";

export function createImplementationRequestsEngine(
  loadMissionGraph: (context: RuntimeContext) => MissionGraph = (context) =>
    buildMissionGraph(
      buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))))
    )
): EngineDescriptor<ImplementationRequestSet> {
  return {
    stage: "implementation-requests",
    artifactName: "implementation-requests",
    run(context: RuntimeContext): ImplementationRequestSet {
      const graph = loadMissionGraph(context);
      return buildImplementationRequests(graph);
    },
    buildEvent(runId: string, output: ImplementationRequestSet, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.requests.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
