/**
 * createFullPipelineEngines() — Capability Sprint 18 (Full Runtime Pipeline). The canonical composition of
 * one EngineDescriptor per FULL_ENGINEERING_WORKFLOW stage, for @oram/runtime's Runtime.runPipeline().
 * This is the Dependency Inversion seam working as designed: Runtime owns orchestration and interprets the
 * declarative workflow, but never imports this package -- the CLI (or any caller) composes these engines and
 * hands them in.
 *
 * Every downstream engine here is wired with a THROWING recompute fallback, on purpose: within a full
 * pipeline run, every upstream artifact is persisted by the stage before it, so recomputation is never
 * legitimate -- if handoff ever silently broke, the run must fail loudly rather than quietly recompute
 * (which would mask the regression and double-execute the pipeline). The engines' own default recompute
 * fallbacks still exist for standalone/direct invocation outside runPipeline; they are simply not used here.
 *
 * No LLM, no git, no GitHub anywhere in this pipeline: Provider Execution uses the existing deterministic
 * MemoryProvider default, and the Publisher stage (Capability Sprint 20) uses the existing deterministic
 * MemoryPublisher default -- always dry-run, never a real git/GitHub call. The Pull Request Proposal is
 * generated; the Publish Record describes what publishing it WOULD do -- neither is ever actually pushed.
 */

import type { PipelineEngines } from "@oram/runtime";
import { createRepositoryAnalyzerEngine } from "./repository-analyzer/RepositoryAnalyzerEngine";
import { createEngineeringKnowledgeEngine } from "./engineering-knowledge/EngineeringKnowledgeEngine";
import { createEngineeringReasoningEngine } from "./engineering-reasoning/EngineeringReasoningEngine";
import { createEngineeringPlanningEngine } from "./engineering-planning/EngineeringPlanningEngine";
import { createEngineeringMissionsEngine } from "./engineering-missions/EngineeringMissionsEngine";
import { createImplementationRequestsEngine } from "./implementation-requests/ImplementationRequestsEngine";
import { createExecutionPlanningEngine } from "./execution-planning/ExecutionPlanningEngine";
import { createProviderExecutionEngine } from "./provider-execution/ProviderExecutionEngine";
import { createValidationEngine } from "./validation/ValidationEngine";
import { createRecommendationEngine } from "./recommendation/RecommendationEngine";
import { createReflectionEngine } from "./reflection/ReflectionEngine";
import { createAdaptiveDecisionEngine } from "./adaptive-decision/DecisionEngine";
import { createPullRequestEngine } from "./pull-request/PullRequestEngine";
import { createPublisherEngine } from "./publisher/PublisherEngine";

/** The loud failure every full-pipeline stage's recompute fallback is wired to -- reaching it means the stage did not find its upstream artifact(s) for the current run, which inside runPipeline() is always a bug, never a situation to paper over by recomputing. */
function forbidRecompute(stage: string, upstream: string): never {
  throw new Error(
    `${stage}: expected upstream artifact "${upstream}" from the current run, but the recompute fallback was reached. ` +
      `Full-pipeline stages never recompute upstream work -- this indicates a broken artifact handoff.`
  );
}

export function createFullPipelineEngines(): PipelineEngines {
  return {
    "repository-intelligence": createRepositoryAnalyzerEngine(),
    "engineering-knowledge": createEngineeringKnowledgeEngine(() => forbidRecompute("engineering-knowledge", "repository-intelligence/repository-analysis")),
    "engineering-reasoning": createEngineeringReasoningEngine(() => forbidRecompute("engineering-reasoning", "engineering-knowledge/engineering-knowledge")),
    "engineering-planning": createEngineeringPlanningEngine(() => forbidRecompute("engineering-planning", "engineering-reasoning/engineering-reasoning")),
    "engineering-missions": createEngineeringMissionsEngine(() => forbidRecompute("engineering-missions", "engineering-planning/engineering-planning")),
    "implementation-requests": createImplementationRequestsEngine(() => forbidRecompute("implementation-requests", "engineering-missions/engineering-missions")),
    "execution-planning": createExecutionPlanningEngine(() => forbidRecompute("execution-planning", "implementation-requests/implementation-requests")),
    "provider-execution": createProviderExecutionEngine(() => forbidRecompute("provider-execution", "execution-planning/execution-planning")),
    validation: createValidationEngine(() => forbidRecompute("validation", "provider-execution/provider-execution")),
    recommendation: createRecommendationEngine(() => forbidRecompute("recommendation", "validation/validation")),
    reflection: createReflectionEngine(() => forbidRecompute("reflection", "validation/validation + recommendation/recommendation")),
    "adaptive-decision": createAdaptiveDecisionEngine(() => forbidRecompute("adaptive-decision", "validation + recommendation + reflection")),
    "pull-request": createPullRequestEngine(() => forbidRecompute("pull-request", "implementation-requests + execution-planning + validation + recommendation + reflection + adaptive-decision")),
    publisher: createPublisherEngine(() => forbidRecompute("publisher", "pull-request/pull-request-proposal")),
  };
}
