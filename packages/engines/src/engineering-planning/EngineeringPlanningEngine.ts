/**
 * EngineeringPlanningEngine — wraps buildEngineeringPlan() (./analysis/build-plan.ts) as an EngineDescriptor,
 * following the exact same shape as EngineeringReasoningEngine.ts / EngineeringKnowledgeEngine.ts.
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (two, both disclosed rather than
 * worked around silently -- both are the same, already-disclosed gaps EngineeringReasoningEngine.ts
 * documents, now one stage further down the pipeline)
 *
 *   1. Same gap as EngineeringReasoningEngine.ts: EngineDescriptor.run(context) receives no `runId`, so this
 *      engine cannot read Reason's actual persisted EngineeringReasoning artifact for THIS run. Default
 *      behavior recomputes the entire pipeline from scratch via buildRepositoryAnalysis() +
 *      buildEngineeringKnowledge() + buildEngineeringReasoning() -- same deterministic result, extra CPU, no
 *      Runtime change. A caller holding the real upstream EngineeringReasoning can bypass this via the
 *      optional `loadEngineeringReasoning` parameter below.
 *
 *   2. @oram/events still has no event type for "Missions produced" (or "Findings produced" -- see
 *      EngineeringReasoningEngine.ts). RecommendationsGeneratedEvent is reused again here for the same
 *      reason: it is the frozen vocabulary's "downstream conclusions produced" event, and reusing it honestly
 *      (`opportunityCount: missions.length`, `topOpportunityId: null` -- no ranking/selection in this MVP) is
 *      less dishonest than inventing a new event type unilaterally. This is a bigger stretch than reusing it
 *      for Findings was (a Mission is not an Opportunity), which is exactly why it's flagged again here: a
 *      dedicated MissionsGeneratedEvent is the correct long-term fix, left for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import type { EngineeringReasoning } from "../engineering-reasoning/analysis/types";
import { buildEngineeringPlan } from "./analysis/build-plan";
import type { EngineeringPlan } from "./analysis/types";

export function createEngineeringPlanningEngine(
  loadEngineeringReasoning: (context: RuntimeContext) => EngineeringReasoning = (context) =>
    buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot)))
): EngineDescriptor<EngineeringPlan> {
  return {
    stage: "engineering-planning",
    artifactName: "engineering-planning",
    // Sprint 18: consumes the current run's persisted engineering-reasoning artifact when available;
    // falls back to the injected/default loader otherwise (Sprint 17's artifact-first contract).
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<EngineeringPlan> {
      const fromRun =
        artifacts && (await artifacts.has("engineering-reasoning", "engineering-reasoning"))
          ? await artifacts.require<EngineeringReasoning>("engineering-reasoning", "engineering-reasoning")
          : null;
      const reasoning = fromRun ?? loadEngineeringReasoning(context);
      return buildEngineeringPlan(reasoning);
    },
    buildEvent(runId: string, output: EngineeringPlan, _ref: ArtifactRef): OramEvent {
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
