/**
 * PullRequestEngine -- converts one already-computed pipeline run (implementation artifacts + the
 * EngineeringDecision) into one deterministic PullRequestProposal. `propose()` is the whole job. Pure and
 * deterministic: no GitHub, no git, no LLM, no filesystem writes, no shell commands, no patch application --
 * this class only assembles a proposal from data @oram/engines has already produced. Publication is
 * explicitly a future Runtime/Publisher layer's job, not this one's.
 *
 * `createPullRequestEngine()` at the bottom of this file is the EngineDescriptor factory every prior stage
 * provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason Sprints
 * 9-15 each gave: this Sprint's own spec names the core worker class itself `PullRequestEngine`, leaving no
 * distinct, non-redundant name for a separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same gaps disclosed in every prior stage's own EngineDescriptor wrapper:
 *
 *   1. PARTIALLY CLOSED by Capability Sprint 17 (Runtime Artifact Handoff): EngineDescriptor.run() now
 *      receives a RunArtifacts view of THIS run's persisted artifacts, and this engine declares its upstream
 *      dependencies explicitly (PULL_REQUEST_UPSTREAM_ARTIFACTS below). When every declared upstream
 *      artifact is available for the current run, they are consumed directly -- no recomputation. When NONE
 *      are available, the pre-existing, explicitly documented fallback still applies: recompute the pipeline
 *      from scratch via buildRepositoryAnalysis() + ... + buildEngineeringDecision() -- same deterministic
 *      result under MemoryProvider/MemoryAdapter, extra CPU. A PARTIAL set of upstream artifacts is a broken
 *      run and fails loudly (see loadPullRequestInputsFromRun). A caller holding the real upstream pipeline
 *      output can still bypass everything via the optional `loadInputs` parameter below.
 *
 *   2. Per DecisionEngine.ts's own disclosed limitation, the default `previousRun` for the decision is
 *      honestly always null today (no cross-process MemoryStore persistence yet).
 *
 *   3. @oram/events has no event type for "a pull request was proposed." RecommendationsGeneratedEvent is
 *      reused the same honest way every stage since Sprint 5 that lacks a purpose-built event has reused it:
 *      `opportunityCount: 1`, `topOpportunityId: null` always. A dedicated PullRequestProposedEvent is the
 *      correct long-term fix, left for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts, ArtifactDependency } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import type { ImplementationRequestSet } from "../implementation-requests/analysis/types";
import type { ExecutionPlanSet } from "../execution-planning/analysis/types";
import type { ValidationResult } from "../validation/analysis/types";
import type { RecommendationSet } from "../recommendation/analysis/types";
import type { ReflectionReport } from "../reflection/analysis/types";
import type { EngineeringDecision } from "../adaptive-decision/analysis/types";
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
import { buildEngineeringDecision } from "../adaptive-decision/analysis/build-decision";
import { buildPullRequestProposal } from "./analysis/build-pull-request-proposal";
import type { PullRequestInputs, PullRequestProposal } from "./analysis/types";

export class PullRequestEngine {
  /** Assembles one PullRequestProposal from a PullRequestInputs bundle. Pure and deterministic -- see ./analysis/build-pull-request-proposal.ts. */
  propose(inputs: PullRequestInputs): PullRequestProposal {
    return buildPullRequestProposal(inputs);
  }
}

function defaultLoadInputs(context: RuntimeContext): PullRequestInputs {
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
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });

  return { repositoryRoot: context.repositoryRoot, requestSet, planSet, validationResult, recommendationSet, reflectionReport, decision };
}

/** The upstream artifacts this engine consumes from the current run, declared explicitly (Sprint 17) -- exactly the six already-computed artifacts PullRequestInputs bundles (repositoryRoot comes from RuntimeContext, not an artifact). */
export const PULL_REQUEST_UPSTREAM_ARTIFACTS: ReadonlyArray<ArtifactDependency> = [
  { stage: "implementation-requests", name: "implementation-requests" },
  { stage: "execution-planning", name: "execution-planning" },
  { stage: "validation", name: "validation" },
  { stage: "recommendation", name: "recommendation" },
  { stage: "reflection", name: "reflection" },
  { stage: "adaptive-decision", name: "engineering-decision" },
];

/**
 * Sprint 17 artifact path: loads PullRequestInputs from the current run's persisted artifacts.
 *   - Every declared upstream artifact available -> the loaded inputs (no recomputation).
 *   - None available -> null; the caller applies the pre-existing, documented recompute fallback.
 *   - SOME available but not all -> a loud, deterministic error naming exactly what is missing: a partial
 *     run is broken, and silently recomputing would discard the real artifacts that DO exist.
 */
export async function loadPullRequestInputsFromRun(context: RuntimeContext, artifacts: RunArtifacts): Promise<PullRequestInputs | null> {
  const missing = await artifacts.missing(PULL_REQUEST_UPSTREAM_ARTIFACTS);
  if (missing.length === PULL_REQUEST_UPSTREAM_ARTIFACTS.length) return null;
  if (missing.length > 0) {
    const missingList = missing.map((dependency) => `${dependency.stage}/${dependency.name}`).join(", ");
    throw new Error(
      `Pull Request Engine: run "${artifacts.runId}" has some upstream artifacts but is missing: ${missingList}. ` +
        `Refusing to mix persisted artifacts with recomputation -- re-run the missing upstream stage(s) for this run.`
    );
  }

  return {
    repositoryRoot: context.repositoryRoot,
    requestSet: await artifacts.require<ImplementationRequestSet>("implementation-requests", "implementation-requests"),
    planSet: await artifacts.require<ExecutionPlanSet>("execution-planning", "execution-planning"),
    validationResult: await artifacts.require<ValidationResult>("validation", "validation"),
    recommendationSet: await artifacts.require<RecommendationSet>("recommendation", "recommendation"),
    reflectionReport: await artifacts.require<ReflectionReport>("reflection", "reflection"),
    decision: await artifacts.require<EngineeringDecision>("adaptive-decision", "engineering-decision"),
  };
}

export function createPullRequestEngine(
  loadInputs: (context: RuntimeContext) => PullRequestInputs = defaultLoadInputs
): EngineDescriptor<PullRequestProposal> {
  const engine = new PullRequestEngine();
  return {
    stage: "pull-request",
    artifactName: "pull-request-proposal",
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<PullRequestProposal> {
      const inputs = (artifacts && (await loadPullRequestInputsFromRun(context, artifacts))) ?? loadInputs(context);
      return engine.propose(inputs);
    },
    buildEvent(runId: string, _output: PullRequestProposal, _ref: ArtifactRef): OramEvent {
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
