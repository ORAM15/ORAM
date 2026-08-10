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
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read any prior stage's actual
 *      persisted artifact for THIS run. Default behavior recomputes the entire pipeline from scratch via
 *      buildRepositoryAnalysis() + ... + buildEngineeringDecision() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller holding the real upstream
 *      pipeline output can bypass this via the optional `loadInputs` parameter below.
 *
 *   2. Per DecisionEngine.ts's own disclosed limitation, the default `previousRun` for the decision is
 *      honestly always null today (no cross-process MemoryStore persistence yet).
 *
 *   3. @oram/events has no event type for "a pull request was proposed." RecommendationsGeneratedEvent is
 *      reused the same honest way every stage since Sprint 5 that lacks a purpose-built event has reused it:
 *      `opportunityCount: 1`, `topOpportunityId: null` always. A dedicated PullRequestProposedEvent is the
 *      correct long-term fix, left for a future PR.
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

export function createPullRequestEngine(
  loadInputs: (context: RuntimeContext) => PullRequestInputs = defaultLoadInputs
): EngineDescriptor<PullRequestProposal> {
  const engine = new PullRequestEngine();
  return {
    stage: "pull-request",
    artifactName: "pull-request-proposal",
    run(context: RuntimeContext): PullRequestProposal {
      const inputs = loadInputs(context);
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
