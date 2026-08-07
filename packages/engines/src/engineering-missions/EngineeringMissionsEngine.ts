/**
 * EngineeringMissionsEngine — wraps buildMissionGraph() (./analysis/build-mission-graph.ts) as an
 * EngineDescriptor, following the exact same shape as EngineeringPlanningEngine.ts / EngineeringReasoningEngine.ts.
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (the same two gaps disclosed one stage
 * up in EngineeringPlanningEngine.ts, now one stage further down the pipeline)
 *
 *   1. Same gap as EngineeringPlanningEngine.ts: EngineDescriptor.run(context) receives no `runId`, so this
 *      engine cannot read Plan's actual persisted EngineeringPlan artifact for THIS run. Default behavior
 *      recomputes the entire pipeline from scratch via buildRepositoryAnalysis() + buildEngineeringKnowledge()
 *      + buildEngineeringReasoning() + buildEngineeringPlan() -- same deterministic result, extra CPU, no
 *      Runtime change. A caller holding the real upstream EngineeringPlan can bypass this via the optional
 *      `loadEngineeringPlan` parameter below.
 *
 *   2. @oram/events still has no event type for "Missions produced" (see EngineeringPlanningEngine.ts) or a
 *      graph-shaped equivalent. RecommendationsGeneratedEvent is reused again here for the same reason, now a
 *      further stretch still: `opportunityCount: missions.length`, `topOpportunityId: null`. A dedicated
 *      MissionGraphGeneratedEvent is the correct long-term fix, left for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import type { EngineeringPlan } from "../engineering-planning/analysis/types";
import { buildMissionGraph } from "./analysis/build-mission-graph";
import type { MissionGraph } from "./analysis/types";

export function createEngineeringMissionsEngine(
  loadEngineeringPlan: (context: RuntimeContext) => EngineeringPlan = (context) =>
    buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))))
): EngineDescriptor<MissionGraph> {
  return {
    stage: "engineering-missions",
    artifactName: "engineering-missions",
    run(context: RuntimeContext): MissionGraph {
      const plan = loadEngineeringPlan(context);
      return buildMissionGraph(plan);
    },
    buildEvent(runId: string, output: MissionGraph, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.missions.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
