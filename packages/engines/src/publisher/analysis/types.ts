/**
 * PublishRecord — Capability Sprint 20 (Publisher Engine).
 *
 * Pull Request (../../pull-request/) answers "what change should be proposed, and how?" -- the Publisher is
 * the stage after it: it converts that PullRequestProposal into one deterministic PublishRecord describing
 * whether (and how) the proposal was published. This is the "Publisher" half of Lifecycle.ts's own
 * PUBLISHING phase mapping ("Pull Request Generator + Publisher") -- Sprint 16 built the first half, this is
 * the second.
 *
 * Modeled directly on scripts/github-publisher.js + publisher/github/client.js (System A's real, tested,
 * dry-run-by-default GitHub adapter -- see ORAM's own ROADMAP.md, which names both as "the intended starting
 * point" for this package): the same four publishing stages (Create Branch, Commit, Push, Create Draft Pull
 * Request), the same PASS/FAIL/SKIPPED vocabulary, the same "stop at the first failure, record the rest as
 * SKIPPED" behavior, the same dry-run-by-default safety posture.
 *
 * The shipped PublisherClient (see ../publishers/) is MemoryPublisher -- a deterministic, ALWAYS-dry-run
 * simulation: no git invocation, no GitHub CLI invocation, no filesystem write, no network call. A future
 * GitHubPublisher (stub only, see ../publishers/RemotePublishers.ts) is the real, side-effecting
 * implementation; it is never the default. Real git/GitHub operations are additionally out of reach today for
 * a structural reason, not just a safety one: ImplementationRequest.implementationTargets.files is always
 * empty (implementation-requests/analysis/rules.ts's own disclosed MVP limitation) -- there is no real
 * file-level diff yet for a real Commit stage to stage.
 */

import type { PullRequestProposal } from "../../pull-request/analysis/types";

export interface PublisherInputs {
  /** The repository path this run analyzed -- used ONLY to derive the machine-independent repositoryId (see memory/analysis/build-run-snapshot.ts's makeRepositoryId); never carried into the record itself. */
  readonly repositoryRoot: string;
  readonly proposal: PullRequestProposal;
}

export type PublishStageName = "CREATE_BRANCH" | "COMMIT" | "PUSH" | "CREATE_DRAFT_PULL_REQUEST";
export type PublishStageStatus = "PASS" | "FAIL" | "SKIPPED";

export interface PublishStageResult {
  readonly name: PublishStageName;
  readonly status: PublishStageStatus;
  readonly details: string;
}

/**
 * PUBLISHED: every stage passed -- a (simulated, under MemoryPublisher) branch/commit/push/draft-PR sequence
 *   completed for an actionable, approved proposal.
 * SKIPPED: the proposal itself says nothing should be published -- kind is NO_ACTION, or
 *   humanApprovalRequired is still true. No stage is attempted; mirrors scripts/github-publisher.js's own
 *   assertApprovedForPR gate, done gracefully (an honest outcome, not a thrown error) the same way Pull
 *   Request's own NO_ACTION kind already handles "nothing to propose."
 * FAILED: a stage was attempted and returned FAIL (unreachable under MemoryPublisher, whose four stages are
 *   deterministic simulations that always pass; modeled for a future real Publisher whose stages can fail).
 */
export type PublishOutcome = "PUBLISHED" | "SKIPPED" | "FAILED";

export interface PublishRecord {
  /** Unique per record (timestamp-derived -- the same reasoning pull-request/analysis/build-pull-request-proposal.ts already documents for PullRequestProposal.id). */
  readonly id: string;
  readonly timestamp: string;
  /** Machine-independent (basename-derived) -- the same canonical id Engineering Memory/Pull Request record under (see makeRepositoryId). */
  readonly repositoryId: string;
  /** id of the PullRequestProposal (see pull-request/analysis/types.ts) this record was produced from. */
  readonly proposalId: string;
  /** Which PublisherClient produced this record -- e.g. "memory-publisher-v1" (mirrors ProviderRegistry's own id convention). */
  readonly publisherId: string;
  /** True for every PublisherClient shipped today (MemoryPublisher) -- carried as its own field, not inferred, so a future real client can report it honestly per-invocation instead of this type silently assuming an always-true default. */
  readonly dryRun: boolean;
  readonly outcome: PublishOutcome;
  /** Human-readable: why the record settled on its outcome -- always non-empty, never a fabricated success message. */
  readonly reason: string;
  /** Carried from the proposal; null when SKIPPED because the proposal itself had none (NO_ACTION). */
  readonly branchName: string | null;
  readonly title: string;
  /** Empty when outcome is SKIPPED -- no stage is attempted for a proposal that should not be published. */
  readonly stages: ReadonlyArray<PublishStageResult>;
  /** Always null under a dry-run/simulated publisher -- no real pull request exists to link to. */
  readonly pullRequestUrl: string | null;
}
