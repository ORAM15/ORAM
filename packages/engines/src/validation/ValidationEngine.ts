/**
 * ValidationEngine -- evaluates PatchArtifacts (../provider-execution/) and produces ValidationReports. Never
 * executes code, never applies a patch, never modifies a file, never calls an AI: every check in
 * ./analysis/rules.ts is a plain-text structural inspection of `unifiedDiff`. `validate()` is one patch in,
 * one report out; `validateAll()` is a thin batch convenience wrapper, mirroring provider-execution's own
 * `runAll()` and implementation-executor's own `executeAll()`.
 *
 * `createValidationEngine()` at the bottom of this file is the EngineDescriptor factory every prior stage
 * provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason Sprint 9's
 * ProviderExecutionEngine.ts gave: this Sprint's own spec names the core worker class itself
 * `ValidationEngine`, leaving no distinct, non-redundant name for a separate wrapper file
 * (`ValidationEngineEngine.ts` would be absurd).
 *
 * CONCRETE LIMITATION -- the same two gaps disclosed in every prior stage's own EngineDescriptor wrapper:
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read Provider Execution's actual
 *      persisted ProviderExecutionResult[] artifact for THIS run. Default behavior recomputes the entire
 *      pipeline from scratch via buildRepositoryAnalysis() + ... + runProviderExecutionAll() -- same
 *      deterministic result under MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller
 *      holding the real upstream PatchArtifacts can bypass this via the optional `loadPatches` parameter.
 *
 *   2. @oram/events still has no event type for "Validation completed." RecommendationsGeneratedEvent is
 *      reused again here for the same reason as every prior stage: `opportunityCount: result.reports.length`,
 *      `topOpportunityId: null`. A dedicated ValidationCompletedEvent is the correct long-term fix, left for a
 *      future PR.
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
import type { PatchArtifact, ProviderExecutionResult } from "../provider-execution/analysis/types";
import { buildValidationReport } from "./analysis/build-validation-report";
import type { ValidationReport, ValidationResult } from "./analysis/types";

export class ValidationEngine {
  public validate(patch: PatchArtifact): ValidationReport {
    return buildValidationReport(patch);
  }
}

/** Validates every PatchArtifact in a batch, in order, through one ValidationEngine. */
export function validateAll(patches: ReadonlyArray<PatchArtifact>, engine: ValidationEngine = new ValidationEngine()): ValidationResult {
  return { reports: patches.map((patch) => engine.validate(patch)) };
}

function defaultLoadPatches(context: RuntimeContext): ReadonlyArray<PatchArtifact> {
  const planSet = buildExecutionPlans(
    buildImplementationRequests(
      buildMissionGraph(buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot)))))
    )
  );
  const results = runProviderExecutionAll(planSet);
  return results.flatMap((result) => result.steps.map((step) => step.patch));
}

export function createValidationEngine(loadPatches: (context: RuntimeContext) => ReadonlyArray<PatchArtifact> = defaultLoadPatches): EngineDescriptor<ValidationResult> {
  return {
    stage: "validation",
    artifactName: "validation",
    // Sprint 18: consumes the current run's persisted provider-execution artifact when available (the
    // patches are extracted from it exactly as defaultLoadPatches extracts them from a fresh run); falls
    // back to the injected/default loader otherwise (Sprint 17's artifact-first contract).
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<ValidationResult> {
      const fromRun =
        artifacts && (await artifacts.has("provider-execution", "provider-execution"))
          ? await artifacts.require<ProviderExecutionResult[]>("provider-execution", "provider-execution")
          : null;
      const patches = fromRun ? fromRun.flatMap((result) => result.steps.map((step) => step.patch)) : loadPatches(context);
      return validateAll(patches);
    },
    buildEvent(runId: string, output: ValidationResult, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: output.reports.length,
          topOpportunityId: null,
        },
      };
    },
  };
}
