/**
 * RecommendationEngine -- turns a whole ValidationResult into a RecommendationSet. Pure and deterministic: no
 * AI, no filesystem, no re-inspection of any PatchArtifact's `unifiedDiff` (that already happened in
 * validation; this stage only reads `ValidationIssue.title`, see ./analysis/rules.ts). `generate()` is one
 * ValidationResult in, one RecommendationSet out; `buildRecommendationSet()` (./analysis/build-recommendations.ts)
 * does the actual work, exactly like every prior stage's engine class delegates to its own `build*()` function.
 *
 * `createRecommendationEngine()` at the bottom of this file is the EngineDescriptor factory every prior stage
 * provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason Sprint 9's
 * ProviderExecutionEngine.ts and Sprint 10's ValidationEngine.ts both gave: this Sprint's own spec names the
 * core worker class itself `RecommendationEngine` (well, "Recommendation Engine"), leaving no distinct,
 * non-redundant name for a separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same two gaps disclosed in every prior stage's own EngineDescriptor wrapper:
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read Validation's actual persisted
 *      ValidationResult artifact for THIS run. Default behavior recomputes the entire pipeline from scratch
 *      via buildRepositoryAnalysis() + ... + validateAll() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller holding the real upstream
 *      ValidationResult can bypass this via the optional `loadValidationResult` parameter below.
 *
 *   2. RecommendationsGeneratedEvent's name reads like a natural fit for this stage, but its own
 *      `topOpportunityId` field is typed `number | null` (see @oram/events' types.ts) while every id in this
 *      pipeline (including Recommendation.id) is a string -- so it is reused the same honest way every prior
 *      stage reused it: `opportunityCount: output.recommendations.length`, `topOpportunityId: null` always,
 *      never a fabricated or type-coerced id. A dedicated RecommendationsGeneratedEvent variant (or a fixed
 *      field type) is the correct long-term fix, left for a future PR. @oram/events' existing
 *      ValidationCompletedEvent was also considered and rejected: it is scoped to one Mission
 *      (`missionId`/`approved`/`score`), not a whole batch of recommendations across many patches.
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
import { runAll as runProviderExecutionAll } from "../provider-execution/ProviderExecutionEngine";
import { validateAll } from "../validation/ValidationEngine";
import type { ValidationResult } from "../validation/analysis/types";
import { buildRecommendationSet } from "./analysis/build-recommendations";
import type { RecommendationSet } from "./analysis/types";

export class RecommendationEngine {
  public generate(result: ValidationResult): RecommendationSet {
    return buildRecommendationSet(result);
  }
}

function defaultLoadValidationResult(context: RuntimeContext): ValidationResult {
  const planSet = buildExecutionPlans(
    buildImplementationRequests(
      buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot)))))
    )
  );
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  return validateAll(patches);
}

export function createRecommendationEngine(
  loadValidationResult: (context: RuntimeContext) => ValidationResult = defaultLoadValidationResult
): EngineDescriptor<RecommendationSet> {
  return {
    stage: "recommendation",
    artifactName: "recommendation",
    run(context: RuntimeContext): RecommendationSet {
      const validationResult = loadValidationResult(context);
      return buildRecommendationSet(validationResult);
    },
    buildEvent(runId: string, output: RecommendationSet, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.recommendations.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
