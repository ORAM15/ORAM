/**
 * PullRequestProposal — Capability Sprint 16 (Pull Request Engine).
 *
 * Adaptive Decision (../../adaptive-decision/) answers "what should happen next?" -- the Pull Request Engine
 * is the stage after it: it converts that EngineeringDecision plus the run's already-computed implementation
 * artifacts into one deterministic, structured PullRequestProposal that a future Runtime/Publisher layer can
 * consume. This is explicitly NOT the GitHub publisher: nothing in this package calls GitHub, calls git,
 * invokes an LLM, writes a file, executes a shell command, or applies a patch. It only assembles a proposal
 * artifact from data @oram/engines has already produced -- "PROPOSE CHANGE," never "PUBLISH."
 *
 * Every field is carried or synthesized 1:1 from an upstream artifact (ImplementationRequestSet,
 * ExecutionPlanSet, ValidationResult, RecommendationSet, ReflectionReport, EngineeringDecision) -- nothing
 * here re-inspects a repository, re-validates a patch, or re-decides anything. Machine-independence follows
 * Engineering Memory's own repositoryId precedent (memory/analysis/build-run-snapshot.ts): no absolute
 * filesystem path ever appears in a proposal, so the same repository produces the same proposal on Windows,
 * Linux, and macOS.
 */

import type { ImplementationRequestSet } from "../../implementation-requests/analysis/types";
import type { ExecutionPlanSet } from "../../execution-planning/analysis/types";
import type { ValidationResult } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import type { ReflectionReport } from "../../reflection/analysis/types";
import type { EngineeringDecision, DecisionType, RiskLevel } from "../../adaptive-decision/analysis/types";

/** Everything buildPullRequestProposal() needs -- one bundle per already-computed pipeline run, nothing re-derived. */
export interface PullRequestInputs {
  /** The repository path this run analyzed -- used ONLY to derive the machine-independent repositoryId (see memory/analysis/build-run-snapshot.ts's makeRepositoryId); never carried into the proposal itself. */
  readonly repositoryRoot: string;
  readonly requestSet: ImplementationRequestSet;
  readonly planSet: ExecutionPlanSet;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly reflectionReport: ReflectionReport;
  readonly decision: EngineeringDecision;
}

/**
 * IMPLEMENTATION: a real implementation pull request is being proposed.
 * NO_ACTION: no implementation pull request should be created -- either the Adaptive Decision was STOP, or
 * the run produced zero ImplementationRequests (nothing to propose; proposing anyway would be fabrication).
 */
export type ProposalKind = "IMPLEMENTATION" | "NO_ACTION";

/** One proposed unit of work -- a 1:1 projection of an ImplementationRequest and its ExecutionPlan, never new content. */
export interface ProposedChange {
  /** id of the ImplementationRequest (see implementation-requests/analysis/types.ts) this change represents. */
  readonly requestId: string;
  /** id of the ExecutionPlan (see execution-planning/analysis/types.ts) derived from that request. */
  readonly executionPlanId: string;
  readonly title: string;
  /** Carried verbatim from ImplementationRequest.goal. */
  readonly goal: string;
  /** The request's own ImplementationTarget subsystems, carried through as plain names. */
  readonly subsystems: ReadonlyArray<string>;
}

export interface PullRequestProposal {
  /** Unique per proposal (timestamp-derived -- the same reasoning adaptive-decision/analysis/build-decision.ts already documents for EngineeringDecision.id). */
  readonly id: string;
  readonly timestamp: string;
  /** Machine-independent (basename-derived) -- the same canonical id Engineering Memory records under (see makeRepositoryId). */
  readonly repositoryId: string;
  readonly kind: ProposalKind;
  readonly title: string;
  /** One-sentence statement of what ORAM determined should happen -- the PR body's own Summary section, standalone. */
  readonly summary: string;
  /** The full, professional, structured markdown PR body -- deterministic, see ./build-pull-request-proposal.ts. */
  readonly body: string;
  /** Deterministic suggested branch name (see ./rules.ts's buildBranchName); null for a NO_ACTION proposal -- no branch should be created. */
  readonly branchName: string | null;
  /** A fixed default -- this engine may not call git to read the real default branch; see ./rules.ts's DEFAULT_BASE_BRANCH. */
  readonly baseBranch: string;
  /** Carried verbatim from the EngineeringDecision. */
  readonly decision: DecisionType;
  readonly risk: RiskLevel;
  /** 0-100 -- Decision's own aggregate over the raw ValidationResult (adaptive-decision/analysis/rules.ts's computeValidationScore). */
  readonly validationScore: number;
  /** true when a human must approve before any future Publisher may act on this proposal -- see ./rules.ts's approval rule. */
  readonly humanApprovalRequired: boolean;
  readonly implementationRequestIds: ReadonlyArray<string>;
  readonly executionPlanIds: ReadonlyArray<string>;
  /** Deterministic one-line aggregate of the RecommendationSet (counts by priority) -- the recommendations themselves are referenced, never duplicated. */
  readonly recommendationSummary: string;
  /** Carried verbatim from ReflectionReport.summary. */
  readonly reflectionSummary: string;
  readonly proposedChanges: ReadonlyArray<ProposedChange>;
  /** Expected verification steps -- the deduplicated RUN_TESTS/RUN_LINTER/RUN_FORMATTER step descriptions from the run's own ExecutionPlans, never invented checks. */
  readonly verification: ReadonlyArray<string>;
}
