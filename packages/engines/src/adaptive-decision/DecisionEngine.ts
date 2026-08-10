/**
 * DecisionEngine -- synthesizes Reflection + Validation + Recommendation + (optionally) the latest recorded
 * Engineering Memory run into one EngineeringDecision. `decide()` is the whole job: evaluate every policy
 * (./analysis/rules.ts) and return the first match. Pure and deterministic: no AI, no prompts, no filesystem
 * modification -- this class only reasons over data @oram/engines has already produced.
 *
 * `createAdaptiveDecisionEngine()` at the bottom of this file is the EngineDescriptor factory every prior
 * stage provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason
 * Sprints 9-13 each gave: this Sprint's own spec names the core worker concept "Adaptive Decision Engine",
 * leaving no distinct, non-redundant name for a separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same gaps disclosed in every prior stage's own EngineDescriptor wrapper, plus
 * the one specific to this stage's fourth input:
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read any prior stage's actual
 *      persisted artifact for THIS run. Default behavior recomputes the entire pipeline from scratch via
 *      buildRepositoryAnalysis() + ... + buildReflectionReport() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller holding the real upstream
 *      pipeline output can bypass this via the optional `loadInputs` parameter below.
 *
 *   2. Per MemoryStore.ts's own disclosed limitation, nothing persists a MemoryStore across process
 *      invocations -- so the default `previousRun` lookup below always queries a freshly constructed, empty
 *      MemoryStore and honestly gets `null`. `checkRepeatedFailure` (./analysis/rules.ts) is real and fully
 *      exercised directly by this package's own test suite (which constructs a MemoryStore with real prior
 *      history), it simply has nowhere durable to read a real previous run FROM yet in `oram decide` today.
 *
 *   3. @oram/events has no event type for "a decision was made." RecommendationsGeneratedEvent is reused the
 *      same honest way every stage since Sprint 5 that lacks a purpose-built event has reused it:
 *      `opportunityCount: 1`, `topOpportunityId: null` always. A dedicated DecisionMadeEvent is the correct
 *      long-term fix, left for a future PR.
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
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import { makeRepositoryId } from "../memory/analysis/build-run-snapshot";
import { MemoryStore } from "../memory/MemoryStore";
import { buildEngineeringDecision } from "./analysis/build-decision";
import type { DecisionInputs, EngineeringDecision } from "./analysis/types";

export class DecisionEngine {
  /** Evaluates every policy against a DecisionInputs bundle and returns one EngineeringDecision. Pure and deterministic -- see ./analysis/build-decision.ts. */
  decide(inputs: DecisionInputs): EngineeringDecision {
    return buildEngineeringDecision(inputs);
  }
}

function defaultLoadInputs(context: RuntimeContext): DecisionInputs {
  const analysis = buildRepositoryAnalysis(context.repositoryRoot);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);

  // See this file's own CONCRETE LIMITATION #2 -- a freshly constructed store has no prior run to find.
  // makeRepositoryId is Engineering Memory's own canonical key derivation, so this lookup always matches
  // whatever buildRunSnapshot() recorded (never a re-slugified raw path).
  const repositoryId = makeRepositoryId(context.repositoryRoot);
  const previousRun = new MemoryStore().latest(repositoryId);

  return { reflectionReport, validationResult, recommendationSet, previousRun };
}

export function createAdaptiveDecisionEngine(
  loadInputs: (context: RuntimeContext) => DecisionInputs = defaultLoadInputs
): EngineDescriptor<EngineeringDecision> {
  const engine = new DecisionEngine();
  return {
    stage: "adaptive-decision",
    artifactName: "engineering-decision",
    run(context: RuntimeContext): EngineeringDecision {
      const inputs = loadInputs(context);
      return engine.decide(inputs);
    },
    buildEvent(runId: string, _output: EngineeringDecision, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: 1,
          topOpportunityId: null,
        },
      };
    },
  };
}
