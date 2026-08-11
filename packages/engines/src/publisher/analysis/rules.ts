/**
 * Deterministic gate for the Publisher: whether a PullRequestProposal may be published at all, before any
 * PublisherClient stage is ever invoked. Mirrors scripts/github-publisher.js's own assertApprovedForPR() gate
 * in spirit -- "refuse to publish an unapproved decision" -- but done gracefully (an honest SKIPPED outcome,
 * never a thrown error), the same way Pull Request's own NO_ACTION kind already handles "nothing to
 * propose" rather than fabricating one.
 */

import type { PullRequestProposal } from "../../pull-request/analysis/types";

export interface PublishGate {
  readonly shouldPublish: boolean;
  readonly reason: string;
}

/**
 * Two independent reasons a proposal must NOT be published, checked in order (first match wins):
 *   1. kind === "NO_ACTION" -- there was nothing to propose in the first place (STOP decision, or zero
 *      ImplementationRequests). Publishing a branch/PR for no work would be fabrication.
 *   2. humanApprovalRequired === true -- the proposal's OWN computed risk/decision (ESCALATE_TO_HUMAN, STOP,
 *      or HIGH risk) still demands a human sign-off on THIS SPECIFIC proposal, independently of whatever
 *      pipeline-level approval already let Provider Execution run (Runtime's own AWAITING_APPROVAL gate,
 *      Capability Sprint 19). The two approvals answer different questions -- "may this run execute at all"
 *      vs. "may this run's specific result be published" -- and neither substitutes for the other.
 * Anything else: publish.
 */
export function evaluatePublishGate(proposal: PullRequestProposal): PublishGate {
  if (proposal.kind === "NO_ACTION") {
    return { shouldPublish: false, reason: `No implementation was proposed for this run (decision: ${proposal.decision}) -- there is nothing to publish.` };
  }
  if (proposal.humanApprovalRequired) {
    return {
      shouldPublish: false,
      reason: `This proposal requires human approval before it may be published (decision: ${proposal.decision}, risk: ${proposal.risk}).`,
    };
  }
  return { shouldPublish: true, reason: `Proposal is actionable (decision: ${proposal.decision}, risk: ${proposal.risk}) and does not require additional human approval.` };
}
