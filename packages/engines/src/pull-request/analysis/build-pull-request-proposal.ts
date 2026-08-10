/**
 * buildPullRequestProposal() — assembles one PullRequestProposal from one already-computed pipeline run.
 * Every field except `id`/`timestamp` is a pure function of the inputs (see ./rules.ts for the fixed rule
 * tables); `id`/`timestamp` are the one place this stage cannot be a pure function of its inputs alone -- a
 * proposal's identity is inherently tied to WHEN it was made, the exact same reasoning
 * adaptive-decision/analysis/build-decision.ts documents for EngineeringDecision.id (and memory's
 * RunSnapshot.runId before it), with the same same-millisecond counter guard.
 *
 * The PR body is a deterministic markdown document built ONLY from upstream values -- no timestamps, no ids
 * with embedded timestamps, no absolute paths, no invented prose. Building it twice from the same inputs
 * yields the identical string; that determinism is pinned directly by this package's own test suite.
 */

import { makeRepositoryId } from "../../memory/analysis/build-run-snapshot";
import { computeValidationScore } from "../../adaptive-decision/analysis/rules";
import type { ValidationResult, ValidationSeverity } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import { ACTION_STATEMENTS, DEFAULT_BASE_BRANCH, buildBranchName, buildTitle, determineProposalKind, requiresHumanApproval } from "./rules";
import type { ProposalKind, ProposedChange, PullRequestInputs, PullRequestProposal } from "./types";

let proposalSequence = 0;

function generateProposalId(): string {
  proposalSequence += 1;
  return `pull-request-proposal:${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}-${proposalSequence}`;
}

function countBySeverity(validationResult: ValidationResult, severity: ValidationSeverity): number {
  return validationResult.reports.flatMap((report) => report.issues).filter((issue) => issue.severity === severity).length;
}

/** One deterministic line aggregating the RecommendationSet by priority -- the recommendations themselves stay referenced upstream, never duplicated into the proposal. */
function summarizeRecommendations(recommendationSet: RecommendationSet): string {
  const total = recommendationSet.recommendations.length;
  if (total === 0) return "No recommendations were produced for this run.";
  const count = (priority: string): number => recommendationSet.recommendations.filter((r) => r.priority === priority).length;
  return `${total} recommendation(s): ${count("ERROR")} ERROR, ${count("WARNING")} WARNING, ${count("INFO")} INFO.`;
}

/** The deduplicated RUN_TESTS/RUN_LINTER/RUN_FORMATTER step descriptions from the run's own ExecutionPlans -- expected checks that already exist upstream, never invented ones. */
function collectVerification(planSet: PullRequestInputs["planSet"]): ReadonlyArray<string> {
  const verificationActions = new Set(["RUN_TESTS", "RUN_LINTER", "RUN_FORMATTER"]);
  const descriptions: string[] = [];
  for (const plan of planSet.plans) {
    for (const step of plan.steps) {
      if (verificationActions.has(step.action) && !descriptions.includes(step.description)) descriptions.push(step.description);
    }
  }
  return descriptions;
}

/** 1:1 projection of each ImplementationRequest (and its ExecutionPlan, joined on ExecutionPlan.requestId) into a ProposedChange. */
function collectProposedChanges(inputs: PullRequestInputs): ReadonlyArray<ProposedChange> {
  return inputs.requestSet.requests.map((request) => ({
    requestId: request.id,
    executionPlanId: inputs.planSet.plans.find((plan) => plan.requestId === request.id)?.id ?? "",
    title: request.title,
    goal: request.goal,
    subsystems: request.implementationTargets.map((target) => target.subsystem),
  }));
}

function buildSummary(kind: ProposalKind, inputs: PullRequestInputs): string {
  if (kind === "NO_ACTION") {
    return inputs.decision.decisionType === "STOP"
      ? `ORAM decided ${inputs.decision.decisionType}: ${inputs.decision.reason}`
      : "ORAM found no implementation work to propose for this run.";
  }
  return `ORAM proposes ${inputs.requestSet.requests.length} implementation change(s) for this repository. ${inputs.decision.reason}`;
}

function buildBody(
  kind: ProposalKind,
  inputs: PullRequestInputs,
  summary: string,
  validationScore: number,
  recommendationSummary: string,
  proposedChanges: ReadonlyArray<ProposedChange>,
  verification: ReadonlyArray<string>,
  humanApprovalRequired: boolean
): string {
  const lines: string[] = [];

  lines.push("## Summary", "", summary, "");

  lines.push("## Decision", "", `${inputs.decision.decisionType} — ${ACTION_STATEMENTS[inputs.decision.decisionType]}`, "");

  lines.push("## Risk", "", inputs.decision.riskLevel, "");

  lines.push("## Proposed Changes", "");
  if (proposedChanges.length === 0) {
    lines.push("None — no implementation pull request should be created for this run.", "");
  } else {
    for (const change of proposedChanges) {
      const subsystems = change.subsystems.length > 0 ? ` (subsystems: ${change.subsystems.join(", ")})` : "";
      lines.push(`- **${change.title}**${subsystems}: ${change.goal}`);
    }
    lines.push("");
  }

  lines.push(
    "## Validation",
    "",
    `Validation score: ${validationScore}/100 — ${countBySeverity(inputs.validationResult, "ERROR")} ERROR, ${countBySeverity(inputs.validationResult, "WARNING")} WARNING, ${countBySeverity(inputs.validationResult, "INFO")} INFO issue(s).`,
    "",
    recommendationSummary,
    ""
  );

  lines.push("## Reflection", "", inputs.reflectionReport.summary);
  for (const finding of inputs.reflectionReport.findings) {
    lines.push(`- [${finding.severity}] ${finding.title}: ${finding.description}`);
  }
  lines.push("");

  lines.push("## Verification", "");
  if (verification.length === 0) {
    lines.push("No verification steps were planned for this run.", "");
  } else {
    for (const step of verification) lines.push(`- ${step}`);
    lines.push("");
  }

  lines.push(
    "## Safety",
    "",
    humanApprovalRequired
      ? "Human approval is REQUIRED before any part of this proposal is executed or published."
      : "Human approval is not required by policy for this proposal; a future Publisher layer may still enforce its own review gate.",
    "",
    "This proposal was generated deterministically by the ORAM Pull Request Engine. ORAM did not modify this repository, did not call git or GitHub, and will not publish anything -- publication belongs to a future Runtime/Publisher layer."
  );

  return lines.join("\n");
}

export function buildPullRequestProposal(inputs: PullRequestInputs): PullRequestProposal {
  const kind = determineProposalKind(inputs.decision, inputs.requestSet.requests.length);
  const humanApprovalRequired = requiresHumanApproval(inputs.decision);
  const validationScore = computeValidationScore(inputs.validationResult);
  const recommendationSummary = summarizeRecommendations(inputs.recommendationSet);
  const proposedChanges = kind === "IMPLEMENTATION" ? collectProposedChanges(inputs) : [];
  const verification = kind === "IMPLEMENTATION" ? collectVerification(inputs.planSet) : [];
  const summary = buildSummary(kind, inputs);

  return {
    id: generateProposalId(),
    timestamp: new Date().toISOString(),
    repositoryId: makeRepositoryId(inputs.repositoryRoot),
    kind,
    title: buildTitle(kind, inputs.requestSet.requests),
    summary,
    body: buildBody(kind, inputs, summary, validationScore, recommendationSummary, proposedChanges, verification, humanApprovalRequired),
    branchName: buildBranchName(kind, inputs.requestSet.requests),
    baseBranch: DEFAULT_BASE_BRANCH,
    decision: inputs.decision.decisionType,
    risk: inputs.decision.riskLevel,
    validationScore,
    humanApprovalRequired,
    implementationRequestIds: inputs.requestSet.requests.map((request) => request.id),
    executionPlanIds: inputs.planSet.plans.map((plan) => plan.id),
    recommendationSummary,
    reflectionSummary: inputs.reflectionReport.summary,
    proposedChanges,
    verification,
  };
}
