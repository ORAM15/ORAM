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
 *   1. PARTIALLY CLOSED by Capability Sprint 17 (Runtime Artifact Handoff): EngineDescriptor.run() now
 *      receives a RunArtifacts view of THIS run's persisted artifacts, and this engine declares its upstream
 *      dependencies explicitly (DECISION_UPSTREAM_ARTIFACTS below). When every declared upstream artifact is
 *      available for the current run, they are consumed directly -- no recomputation. When NONE are
 *      available (e.g. a direct invocation outside a full pipeline run, or a pre-Sprint-17 caller), the
 *      pre-existing, explicitly documented fallback still applies: recompute the pipeline from scratch via
 *      buildRepositoryAnalysis() + ... + buildReflectionReport() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU. A PARTIAL set of upstream artifacts is a broken run and
 *      fails loudly (see loadDecisionInputsFromRun) -- silently recomputing over real artifacts would
 *      discard them. A caller holding the real upstream pipeline output can still bypass everything via the
 *      optional `loadInputs` parameter below.
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

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts, ArtifactDependency } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import type { ValidationResult } from "../validation/analysis/types";
import type { RecommendationSet } from "../recommendation/analysis/types";
import type { ReflectionReport } from "../reflection/analysis/types";
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

/**
 * The upstream artifacts this engine consumes from the current run, declared explicitly (Sprint 17) --
 * exactly the three whole-batch inputs buildEngineeringDecision() reasons over. `previousRun` is deliberately
 * NOT an artifact dependency: the memory stage's `run-snapshot` artifact for THIS run describes this run
 * itself, not a previous one, so reading it here would be dishonest (the same reasoning `oram engineer`'s own
 * header documents); previousRun stays null until cross-run Memory persistence exists.
 */
export const DECISION_UPSTREAM_ARTIFACTS: ReadonlyArray<ArtifactDependency> = [
  { stage: "validation", name: "validation" },
  { stage: "recommendation", name: "recommendation" },
  { stage: "reflection", name: "reflection" },
];

/**
 * Sprint 17 artifact path: loads DecisionInputs from the current run's persisted artifacts.
 *   - Every declared upstream artifact available -> the loaded inputs (no recomputation).
 *   - None available -> null; the caller applies the pre-existing, documented recompute fallback.
 *   - SOME available but not all -> a loud, deterministic error naming exactly what is missing: a partial
 *     run is broken, and silently recomputing would discard the real artifacts that DO exist.
 */
export async function loadDecisionInputsFromRun(artifacts: RunArtifacts): Promise<DecisionInputs | null> {
  const missing = await artifacts.missing(DECISION_UPSTREAM_ARTIFACTS);
  if (missing.length === DECISION_UPSTREAM_ARTIFACTS.length) return null;
  if (missing.length > 0) {
    const missingList = missing.map((dependency) => `${dependency.stage}/${dependency.name}`).join(", ");
    throw new Error(
      `Adaptive Decision Engine: run "${artifacts.runId}" has some upstream artifacts but is missing: ${missingList}. ` +
        `Refusing to mix persisted artifacts with recomputation -- re-run the missing upstream stage(s) for this run.`
    );
  }

  const validationResult = await artifacts.require<ValidationResult>("validation", "validation");
  const recommendationSet = await artifacts.require<RecommendationSet>("recommendation", "recommendation");
  const reflectionReport = await artifacts.require<ReflectionReport>("reflection", "reflection");

  // See this file's own CONCRETE LIMITATION #2 -- previousRun remains honestly null (no cross-run persistence).
  return { reflectionReport, validationResult, recommendationSet, previousRun: null };
}

export function createAdaptiveDecisionEngine(
  loadInputs: (context: RuntimeContext) => DecisionInputs = defaultLoadInputs
): EngineDescriptor<EngineeringDecision> {
  const engine = new DecisionEngine();
  return {
    stage: "adaptive-decision",
    artifactName: "engineering-decision",
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<EngineeringDecision> {
      const inputs = (artifacts && (await loadDecisionInputsFromRun(artifacts))) ?? loadInputs(context);
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
