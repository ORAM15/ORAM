/**
 * Real GitHub publisher stub -- exactly like implementation-executor's RealAdapter and provider-execution's
 * RemoteProviders: the SAME NotImplementedYetError type is reused here (imported read-only, never modified)
 * rather than a near-duplicate error class being invented, so any code in this codebase can check
 * `error instanceof NotImplementedYetError` for "this is a deliberate not-yet-real stub," regardless of
 * which package threw it. Every method throws, unconditionally, so this can never call a real git/GitHub
 * command by accident. Never PublisherEngine's default; that is always MemoryPublisher.
 *
 * Real git/GitHub operations remain out of reach for a structural reason too, not only a safety one:
 * ImplementationRequest.implementationTargets.files is always empty today (implementation-requests/
 * analysis/rules.ts's own disclosed MVP limitation) -- there is no real file-level diff yet for a real Commit
 * stage to stage, even once this stub is filled in.
 */

import { NotImplementedYetError } from "../../implementation-executor/adapters/RealAdapters";
import type { PublisherClient, PublisherStageOutcome, CreateDraftPullRequestOutcome } from "./types";

export class GitHubPublisher implements PublisherClient {
  readonly id = "github-cli-v1";
  readonly dryRun = false;

  createBranch(_input: { readonly branchName: string }): PublisherStageOutcome {
    throw new NotImplementedYetError("GitHubPublisher.createBranch");
  }

  commitChanges(_input: { readonly title: string; readonly changeCount: number }): PublisherStageOutcome {
    throw new NotImplementedYetError("GitHubPublisher.commitChanges");
  }

  pushBranch(_input: { readonly branchName: string; readonly remote: string }): PublisherStageOutcome {
    throw new NotImplementedYetError("GitHubPublisher.pushBranch");
  }

  createDraftPullRequest(_input: {
    readonly branchName: string;
    readonly baseBranch: string;
    readonly title: string;
    readonly body: string;
  }): CreateDraftPullRequestOutcome {
    throw new NotImplementedYetError("GitHubPublisher.createDraftPullRequest");
  }
}
