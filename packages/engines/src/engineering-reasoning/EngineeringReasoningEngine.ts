/**
 * EngineeringReasoningEngine — wraps buildEngineeringReasoning() (./analysis/build-reasoning.ts) as an
 * EngineDescriptor, following the exact same shape as RepositoryAnalyzerEngine.ts / EngineeringKnowledgeEngine.ts.
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME (two, both disclosed rather than
 * worked around silently)
 *
 *   1. Same gap as EngineeringKnowledgeEngine.ts: EngineDescriptor.run(context) receives no `runId`, so this
 *      engine cannot read Understand's actual persisted EngineeringKnowledge artifact for THIS run. Default
 *      behavior recomputes it from scratch via buildRepositoryAnalysis() + buildEngineeringKnowledge() --
 *      same deterministic result, extra CPU, no Runtime change. A caller holding the real upstream
 *      EngineeringKnowledge can bypass this via the optional `loadEngineeringKnowledge` parameter below.
 *
 *   2. @oram/events has no event type for "Findings produced" -- the closest existing type,
 *      RecommendationsGeneratedEvent (the frozen vocabulary's "Reason" phase event), was designed for
 *      Opportunities, not Findings, and its `topOpportunityId` field is typed `number | null` (Findings use
 *      string ids, so it can never carry one). Per this project's standing rule ("no runtime changes unless
 *      a concrete limitation is explained first"), @oram/events is left untouched. buildEvent() below reuses
 *      RecommendationsGeneratedEvent honestly rather than inventing a new type unilaterally:
 *      `opportunityCount: findings.length` is a genuine, non-misleading count (both fields mean "how many
 *      conclusions did this phase produce"); `topOpportunityId` is always `null`, which is also true, not a
 *      workaround -- this MVP does no ranking or selection among Findings ("No planning" is explicit scope),
 *      so there genuinely is no "top" one. Adding a dedicated FindingsGeneratedEvent to @oram/events would be
 *      the correct long-term fix and is a small, purely additive change -- flagged here for a future PR, not
 *      made unilaterally in this one.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import type { EngineeringKnowledge } from "../engineering-knowledge/analysis/types";
import { buildEngineeringReasoning } from "./analysis/build-reasoning";
import type { EngineeringReasoning } from "./analysis/types";

export function createEngineeringReasoningEngine(
  loadEngineeringKnowledge: (context: RuntimeContext) => EngineeringKnowledge = (context) =>
    buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))
): EngineDescriptor<EngineeringReasoning> {
  return {
    stage: "engineering-reasoning",
    artifactName: "engineering-reasoning",
    // Sprint 18: consumes the current run's persisted engineering-knowledge artifact when available;
    // falls back to the injected/default loader otherwise (Sprint 17's artifact-first contract).
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<EngineeringReasoning> {
      const fromRun =
        artifacts && (await artifacts.has("engineering-knowledge", "engineering-knowledge"))
          ? await artifacts.require<EngineeringKnowledge>("engineering-knowledge", "engineering-knowledge")
          : null;
      const knowledge = fromRun ?? loadEngineeringKnowledge(context);
      return buildEngineeringReasoning(knowledge);
    },
    buildEvent(runId: string, output: EngineeringReasoning, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.findings.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
