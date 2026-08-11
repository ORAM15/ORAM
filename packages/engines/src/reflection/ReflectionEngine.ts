/**
 * ReflectionEngine -- reasons over a whole ValidationResult + RecommendationSet and produces one
 * ReflectionReport. Exactly like Engineering Reasoning (../engineering-reasoning/) reasons over Engineering
 * Knowledge via fixed deterministic rules, never re-deriving anything upstream: this package NEVER executes
 * code, edits files, calls AI, invokes git, or invokes a Provider. `generate()` is the whole batch in, one
 * ReflectionReport out; `buildReflectionReport()` (./analysis/build-reflection.ts) does the actual work,
 * exactly like every prior stage's engine class delegates to its own `build*()` function.
 *
 * `createReflectionEngine()` at the bottom of this file is the EngineDescriptor factory every prior stage
 * provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason Sprints
 * 9-11 each gave: this Sprint's own spec names the core worker class itself `ReflectionEngine`, leaving no
 * distinct, non-redundant name for a separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same gap disclosed in every prior stage's own EngineDescriptor wrapper, plus one
 * new one specific to this stage's event type:
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read Validation's/Recommendation's
 *      actual persisted artifacts for THIS run. Default behavior recomputes the entire pipeline from scratch
 *      via buildRepositoryAnalysis() + ... + buildRecommendationSet() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller holding the real upstream
 *      ValidationResult/RecommendationSet can bypass this via the optional `loadInputs` parameter below.
 *
 *   2. Unlike every prior stage, @oram/events already has a purpose-built event type for this one:
 *      ReflectionCompletedEvent (its own `retryRecommended: boolean` maps directly to this report's own
 *      field) -- used here genuinely, not stretched. Its one mismatch: `missionId` is required and typed
 *      `string`, but this stage reflects over a whole batch of patches/reports, not one Mission -- there is
 *      no single correct id to put there. `missionId: "unknown"` is used, honestly, rather than fabricating
 *      one; a dedicated batch-scoped event (or an optional `missionId`) is the correct long-term fix, left
 *      for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts } from "@oram/runtime";
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
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import type { RecommendationSet } from "../recommendation/analysis/types";
import { buildReflectionReport } from "./analysis/build-reflection";
import type { ReflectionReport } from "./analysis/types";

export class ReflectionEngine {
  /** Reasons over a whole ValidationResult + RecommendationSet batch and produces one ReflectionReport. Pure and deterministic -- see ./analysis/build-reflection.ts. */
  public generate(validationResult: ValidationResult, recommendationSet: RecommendationSet): ReflectionReport {
    return buildReflectionReport(validationResult, recommendationSet);
  }
}

interface ReflectionInputs {
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
}

function defaultLoadInputs(context: RuntimeContext): ReflectionInputs {
  const planSet = buildExecutionPlans(
    buildImplementationRequests(
      buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot)))))
    )
  );
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  return { validationResult, recommendationSet };
}

/** See this file's own header comment (CONCRETE LIMITATION #2) for why ReflectionCompletedEvent's required `missionId` is filled with this fixed sentinel rather than a fabricated id. */
const UNKNOWN_MISSION_ID = "unknown";

export function createReflectionEngine(
  loadInputs: (context: RuntimeContext) => ReflectionInputs = defaultLoadInputs
): EngineDescriptor<ReflectionReport> {
  return {
    stage: "reflection",
    artifactName: "reflection",
    // Sprint 18: consumes the current run's persisted validation + recommendation artifacts when BOTH are
    // available; with NEITHER available, falls back to the injected/default loader; with exactly one
    // available, fails loudly -- the same partial-run contract adaptive-decision/pull-request established in
    // Sprint 17 (silently recomputing over a real artifact would discard it).
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<ReflectionReport> {
      if (artifacts) {
        const hasValidation = await artifacts.has("validation", "validation");
        const hasRecommendation = await artifacts.has("recommendation", "recommendation");
        if (hasValidation !== hasRecommendation) {
          const missing = hasValidation ? "recommendation/recommendation" : "validation/validation";
          throw new Error(
            `Reflection Engine: run "${artifacts.runId}" has some upstream artifacts but is missing: ${missing}. ` +
              `Refusing to mix persisted artifacts with recomputation -- re-run the missing upstream stage for this run.`
          );
        }
        if (hasValidation && hasRecommendation) {
          const validationResult = await artifacts.require<ValidationResult>("validation", "validation");
          const recommendationSet = await artifacts.require<RecommendationSet>("recommendation", "recommendation");
          return buildReflectionReport(validationResult, recommendationSet);
        }
      }
      const { validationResult, recommendationSet } = loadInputs(context);
      return buildReflectionReport(validationResult, recommendationSet);
    },
    buildEvent(runId: string, output: ReflectionReport, _ref: ArtifactRef): OramEvent {
      return {
        type: "ReflectionCompleted",
        runId,
        timestamp: new Date().toISOString(),
        missionId: UNKNOWN_MISSION_ID,
        retryRecommended: output.retryRecommended,
      };
    },
  };
}
