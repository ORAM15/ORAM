/**
 * buildPublishRecord() — assembles one PublishRecord from one already-computed PullRequestProposal and a
 * PublisherClient. Every field except `id`/`timestamp` is a pure function of the inputs; `id`/`timestamp` are
 * the one place this stage cannot be a pure function of its inputs alone -- a record's identity is inherently
 * tied to WHEN it was made, the exact same reasoning pull-request/analysis/build-pull-request-proposal.ts
 * already documents for PullRequestProposal.id, with the same same-millisecond counter guard.
 *
 * Stage sequencing mirrors scripts/github-publisher.js's own runStages() exactly: Create Branch -> Commit ->
 * Push -> Create Draft Pull Request, in order, stopping immediately (recording every remaining stage as
 * SKIPPED) the moment one stage returns FAIL. Under the shipped MemoryPublisher every stage always PASSes
 * (it is a pure simulation with no failure mode), so this early-stop path is unreachable today -- modeled
 * for a future real PublisherClient whose stages genuinely can fail.
 */

import { makeRepositoryId } from "../../memory/analysis/build-run-snapshot";
import { evaluatePublishGate } from "./rules";
import { MemoryPublisher } from "../publishers/MemoryPublisher";
import type { PublisherClient } from "../publishers/types";
import type { PublisherInputs, PublishRecord, PublishStageResult } from "./types";

let publishSequence = 0;

function generatePublishId(): string {
  publishSequence += 1;
  return `publish-record:${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}-${publishSequence}`;
}

const DEFAULT_REMOTE = "origin";

function runStages(proposal: PublisherInputs["proposal"], client: PublisherClient): { stages: PublishStageResult[]; pullRequestUrl: string | null } {
  // Non-null: evaluatePublishGate() already refused a NO_ACTION proposal before this function is ever
  // called -- see buildPublishRecord() below -- so branchName is guaranteed present here.
  const branchName = proposal.branchName as string;

  const stages: PublishStageResult[] = [];
  let pullRequestUrl: string | null = null;
  let stopped = false;

  const createBranch = client.createBranch({ branchName });
  stages.push({ name: "CREATE_BRANCH", ...createBranch });
  if (createBranch.status !== "PASS") stopped = true;

  if (stopped) {
    stages.push({ name: "COMMIT", status: "SKIPPED", details: "Not attempted because an earlier stage failed." });
  } else {
    const commit = client.commitChanges({ title: proposal.title, changeCount: proposal.proposedChanges.length });
    stages.push({ name: "COMMIT", ...commit });
    if (commit.status !== "PASS") stopped = true;
  }

  if (stopped) {
    stages.push({ name: "PUSH", status: "SKIPPED", details: "Not attempted because an earlier stage failed." });
  } else {
    const push = client.pushBranch({ branchName, remote: DEFAULT_REMOTE });
    stages.push({ name: "PUSH", ...push });
    if (push.status !== "PASS") stopped = true;
  }

  if (stopped) {
    stages.push({ name: "CREATE_DRAFT_PULL_REQUEST", status: "SKIPPED", details: "Not attempted because an earlier stage failed." });
  } else {
    const draftPr = client.createDraftPullRequest({ branchName, baseBranch: proposal.baseBranch, title: proposal.title, body: proposal.body });
    stages.push({ name: "CREATE_DRAFT_PULL_REQUEST", status: draftPr.status, details: draftPr.details });
    pullRequestUrl = draftPr.pullRequestUrl;
  }

  return { stages, pullRequestUrl };
}

export function buildPublishRecord(inputs: PublisherInputs, client: PublisherClient = new MemoryPublisher()): PublishRecord {
  const { proposal } = inputs;
  const gate = evaluatePublishGate(proposal);

  if (!gate.shouldPublish) {
    return {
      id: generatePublishId(),
      timestamp: new Date().toISOString(),
      repositoryId: makeRepositoryId(inputs.repositoryRoot),
      proposalId: proposal.id,
      publisherId: client.id,
      dryRun: client.dryRun,
      outcome: "SKIPPED",
      reason: gate.reason,
      branchName: proposal.branchName,
      title: proposal.title,
      stages: [],
      pullRequestUrl: null,
    };
  }

  const { stages, pullRequestUrl } = runStages(proposal, client);
  const allPassed = stages.every((stage) => stage.status === "PASS");

  return {
    id: generatePublishId(),
    timestamp: new Date().toISOString(),
    repositoryId: makeRepositoryId(inputs.repositoryRoot),
    proposalId: proposal.id,
    publisherId: client.id,
    dryRun: client.dryRun,
    outcome: allPassed ? "PUBLISHED" : "FAILED",
    reason: allPassed
      ? `${client.dryRun ? "Simulated" : "Published"} branch "${proposal.branchName}" through all four publishing stages.`
      : "One or more publishing stages failed -- see `stages` for details.",
    branchName: proposal.branchName,
    title: proposal.title,
    stages,
    pullRequestUrl,
  };
}
