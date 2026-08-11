import type { PublishStageName, PublishStageStatus } from "../analysis/types";

/** One publishing stage's outcome -- exactly PublishStageResult's shape minus `name` (the caller already knows which stage it invoked). */
export interface PublisherStageOutcome {
  readonly status: PublishStageStatus;
  readonly details: string;
}

/** Stage 4's outcome additionally carries the created pull request's URL (null under a dry-run/simulated client, or on failure). */
export interface CreateDraftPullRequestOutcome extends PublisherStageOutcome {
  readonly pullRequestUrl: string | null;
}

/**
 * PublisherClient — the pluggable, four-operation abstraction every Publisher implementation satisfies,
 * mirroring publisher/github/client.js's own four exported functions exactly (createBranch/commitChanges/
 * pushBranch/createDraftPullRequest) so a future real GitHub-backed implementation is a drop-in replacement
 * for MemoryPublisher, never a redesign.
 */
export interface PublisherClient {
  readonly id: string;
  /** True for a client that never touches git, the filesystem, or the network -- see MemoryPublisher.ts. */
  readonly dryRun: boolean;

  createBranch(input: { readonly branchName: string }): PublisherStageOutcome;
  commitChanges(input: { readonly title: string; readonly changeCount: number }): PublisherStageOutcome;
  pushBranch(input: { readonly branchName: string; readonly remote: string }): PublisherStageOutcome;
  createDraftPullRequest(input: {
    readonly branchName: string;
    readonly baseBranch: string;
    readonly title: string;
    readonly body: string;
  }): CreateDraftPullRequestOutcome;
}

export type { PublishStageName };
