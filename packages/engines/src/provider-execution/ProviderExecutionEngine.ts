/**
 * ProviderExecutionEngine -- walks a single ExecutionPlan's steps, in order: builds a PromptArtifact per
 * step (./analysis/build-prompt.ts), calls Provider.generate() to get an LLMResponse, and wraps that as a
 * PatchArtifact (./analysis/build-patch.ts). No AI calls happen under the default Provider (MemoryProvider);
 * no git, filesystem, or shell command is ever touched; no patch is ever applied -- Validation and
 * Application are both explicitly future-sprint work, not this one's.
 *
 * `createProviderExecutionEngine()` at the bottom of this file is the EngineDescriptor factory every prior
 * stage provides (normally from its own `<Stage>Engine.ts` file) -- co-located here because this Sprint's
 * own spec names the core worker class itself `ProviderExecutionEngine`, leaving no distinct, non-redundant
 * name for a separate wrapper file (`ProviderExecutionEngineEngine.ts` would be absurd).
 *
 * CONCRETE LIMITATION -- the same two gaps disclosed in every prior stage's own EngineDescriptor wrapper:
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read Execution Planning's actual
 *      persisted ExecutionPlanSet artifact for THIS run. Default behavior recomputes the entire pipeline
 *      from scratch via buildRepositoryAnalysis() + ... + buildExecutionPlans() -- same deterministic result
 *      under MemoryProvider, extra CPU, no Runtime change. A caller holding the real upstream ExecutionPlanSet
 *      can bypass this via the optional `loadExecutionPlans` parameter below.
 *
 *   2. @oram/events still has no event type for "Provider execution completed." RecommendationsGeneratedEvent
 *      is reused again here for the same reason as every prior stage: `opportunityCount: results.length`,
 *      `topOpportunityId: null`. A dedicated ProviderExecutionCompletedEvent is the correct long-term fix,
 *      left for a future PR.
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
import type { ExecutionPlan, ExecutionPlanSet } from "../execution-planning/analysis/types";
import { buildPromptArtifact } from "./analysis/build-prompt";
import { buildPatchArtifact } from "./analysis/build-patch";
import { MemoryProvider } from "./providers/MemoryProvider";
import type { Provider } from "./providers/types";
import type { ProviderExecutionResult, ProviderExecutionStepResult } from "./analysis/types";

export class ProviderExecutionEngine {
  constructor(private readonly provider: Provider = new MemoryProvider()) {}

  public run(plan: ExecutionPlan): ProviderExecutionResult {
    const startedAt = new Date().toISOString();

    const steps: ProviderExecutionStepResult[] = plan.steps.map((step) => {
      const prompt = buildPromptArtifact(step);
      const response = this.provider.generate(prompt);
      const patch = buildPatchArtifact(response);
      return { executionStepId: step.id, prompt, response, patch };
    });

    const finishedAt = new Date().toISOString();
    return { planId: plan.id, steps, startedAt, finishedAt };
  }
}

/** Runs every ExecutionPlan in a set, in order, through one ProviderExecutionEngine -- a thin convenience wrapper, mirroring implementation-executor's own executeAll(). */
export function runAll(planSet: ExecutionPlanSet, engine: ProviderExecutionEngine = new ProviderExecutionEngine()): ProviderExecutionResult[] {
  return planSet.plans.map((plan) => engine.run(plan));
}

export function createProviderExecutionEngine(
  loadExecutionPlans: (context: RuntimeContext) => ExecutionPlanSet = (context) =>
    buildExecutionPlans(
      buildImplementationRequests(
        buildMissionGraph(
          buildEngineeringPlan(buildEngineeringReasoning(buildEngineeringKnowledge(buildRepositoryAnalysis(context.repositoryRoot))))
        )
      )
    )
): EngineDescriptor<ProviderExecutionResult[]> {
  return {
    stage: "provider-execution",
    artifactName: "provider-execution",
    // Sprint 18: consumes the current run's persisted execution-planning artifact when available; falls
    // back to the injected/default loader otherwise (Sprint 17's artifact-first contract). Execution itself
    // is unchanged: the existing Provider abstraction with the deterministic MemoryProvider default.
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<ProviderExecutionResult[]> {
      const fromRun =
        artifacts && (await artifacts.has("execution-planning", "execution-planning"))
          ? await artifacts.require<ExecutionPlanSet>("execution-planning", "execution-planning")
          : null;
      const planSet = fromRun ?? loadExecutionPlans(context);
      return runAll(planSet);
    },
    buildEvent(runId: string, output: ProviderExecutionResult[], _ref: ArtifactRef): OramEvent {
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
