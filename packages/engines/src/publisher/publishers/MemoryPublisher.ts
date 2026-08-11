/**
 * MemoryPublisher -- deterministic, ALWAYS dry-run. No git invocation, no GitHub CLI invocation, no
 * filesystem write, no network call -- every stage returns a fixed-shape PASS describing what a real
 * publisher WOULD do, in the same "[dry-run] would run: <command>" phrasing
 * publisher/github/client.js's own dry-run branch already uses (this is a direct port of that proven
 * behavior, not a new invention). The same input always produces the same PublisherStageOutcome.
 */

import type { PublisherClient, PublisherStageOutcome, CreateDraftPullRequestOutcome } from "./types";

export class MemoryPublisher implements PublisherClient {
  readonly id = "memory-publisher-v1";
  readonly dryRun = true;

  createBranch(input: { readonly branchName: string }): PublisherStageOutcome {
    return { status: "PASS", details: `[dry-run] would run: git checkout -b ${input.branchName}` };
  }

  commitChanges(input: { readonly title: string; readonly changeCount: number }): PublisherStageOutcome {
    return {
      status: "PASS",
      details: `[dry-run] would run: git add -- <${input.changeCount} proposed change(s)> && git commit -m "${input.title}"`,
    };
  }

  pushBranch(input: { readonly branchName: string; readonly remote: string }): PublisherStageOutcome {
    return { status: "PASS", details: `[dry-run] would run: git push -u ${input.remote} ${input.branchName}` };
  }

  createDraftPullRequest(input: {
    readonly branchName: string;
    readonly baseBranch: string;
    readonly title: string;
    readonly body: string;
  }): CreateDraftPullRequestOutcome {
    void input.body; // carried by a real publisher's real `gh pr create --body`; unused by the simulation itself.
    return {
      status: "PASS",
      details: `[dry-run] would run: gh pr create --draft --title "${input.title}" --head ${input.branchName} --base ${input.baseBranch} (no real pull request was created)`,
      pullRequestUrl: null,
    };
  }
}
