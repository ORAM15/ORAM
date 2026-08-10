export type { PullRequestInputs, PullRequestProposal, ProposalKind, ProposedChange } from "./analysis/types";
export { buildPullRequestProposal } from "./analysis/build-pull-request-proposal";
export { ACTION_STATEMENTS, BRANCH_PREFIX, DEFAULT_BASE_BRANCH, buildBranchName, buildTitle, determineProposalKind, requiresHumanApproval } from "./analysis/rules";

export { PullRequestEngine, createPullRequestEngine } from "./PullRequestEngine";
