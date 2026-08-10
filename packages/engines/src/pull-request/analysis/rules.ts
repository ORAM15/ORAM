/**
 * Deterministic rules for the Pull Request Engine: which kind of proposal a decision produces, whether human
 * approval is required, the action statement each DecisionType maps to, and the suggested branch name/title.
 * Fixed lookup tables and pure string derivation only -- the same "fixed template table keyed by an upstream
 * value" technique recommendation/analysis/rules.ts and execution-planning/analysis/rules.ts already use. No
 * rule here calls git or GitHub, inspects the filesystem, or re-evaluates anything upstream.
 */

import { slugify } from "../../repository-analyzer/analysis/identity";
import type { ImplementationRequest } from "../../implementation-requests/analysis/types";
import type { EngineeringDecision, DecisionType } from "../../adaptive-decision/analysis/types";
import type { ProposalKind } from "./types";

/**
 * A fixed default only: this engine is forbidden from calling git, so it cannot read the target repository's
 * real default branch. A future Runtime/Publisher layer that CAN read git should replace this with the real
 * value before publishing -- disclosed here rather than pretended away.
 */
export const DEFAULT_BASE_BRANCH = "main";

/** Suggested-branch namespace -- `oram/<slug>`, marking every ORAM-proposed branch unmistakably as ORAM's. */
export const BRANCH_PREFIX = "oram/";

/** What each DecisionType means for the proposal -- one fixed, deterministic statement per supported decision, mirroring the decision's own nextAction vocabulary (adaptive-decision/analysis/rules.ts). */
export const ACTION_STATEMENTS: Readonly<Record<DecisionType, string>> = {
  CONTINUE: "Proceed with the implementation described in this proposal.",
  RETRY: "Retry the implementation, addressing the outstanding recommendations first, then update this proposal.",
  SPLIT_MISSION: "Split the Mission into smaller, independently reviewable units before implementing this proposal.",
  CHANGE_PROVIDER: "Re-run execution with a different Provider before acting on this proposal.",
  ESCALATE_TO_HUMAN: "Do not act on this proposal until a human reviewer has approved it.",
  STOP: "No implementation pull request should be created for this run.",
};

/** STOP produces a NO_ACTION proposal; so does a run with zero ImplementationRequests -- there is honestly nothing to propose, and fabricating an implementation PR around no work would violate this package's own "carried, never invented" rule. */
export function determineProposalKind(decision: EngineeringDecision, requestCount: number): ProposalKind {
  if (decision.decisionType === "STOP") return "NO_ACTION";
  if (requestCount === 0) return "NO_ACTION";
  return "IMPLEMENTATION";
}

/**
 * A human must approve before any future Publisher may act when the decision itself demands it
 * (ESCALATE_TO_HUMAN), when nothing may proceed at all (STOP), or when the decision's own risk assessment is
 * HIGH -- a HIGH-risk automated change should never publish unreviewed regardless of decision type. Purely a
 * function of the decision's already-computed fields; never re-derived from validation data.
 */
export function requiresHumanApproval(decision: EngineeringDecision): boolean {
  return decision.decisionType === "ESCALATE_TO_HUMAN" || decision.decisionType === "STOP" || decision.riskLevel === "HIGH";
}

/**
 * Deterministic suggested branch name: BRANCH_PREFIX + the primary (first) ImplementationRequest's slugified
 * title -- request order is itself deterministic (one request per Mission, in Mission order), so the same run
 * always suggests the same branch. null when there is nothing to implement: no branch should be created for a
 * NO_ACTION proposal.
 */
export function buildBranchName(kind: ProposalKind, requests: ReadonlyArray<ImplementationRequest>): string | null {
  const primary = requests[0];
  if (kind === "NO_ACTION" || !primary) return null;
  return `${BRANCH_PREFIX}${slugify(primary.title)}`;
}

/** Deterministic PR title: the primary request's own title (plus an honest count of the rest), or an explicit no-action title -- never invented prose. */
export function buildTitle(kind: ProposalKind, requests: ReadonlyArray<ImplementationRequest>): string {
  const primary = requests[0];
  if (kind === "NO_ACTION" || !primary) return "ORAM: no implementation proposed for this run";
  const suffix = requests.length > 1 ? ` (+${requests.length - 1} more)` : "";
  return `ORAM: ${primary.title}${suffix}`;
}
