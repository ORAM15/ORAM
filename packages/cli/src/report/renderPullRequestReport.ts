/**
 * renderPullRequestReport() — pure, presentation-only formatting for `oram pull-request`'s console report.
 * Same shape and conventions as renderDecisionReport.ts (shared primitives live in ./shared.ts): no color
 * library, an explicit `elapsedMs` parameter so this stays deterministic and directly testable. Every value
 * here was already produced by @oram/engines -- this file only decides how to lay it out. The proposal's own
 * markdown `body` is printed verbatim: it IS the artifact this command exists to show.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  EngineeringDecision,
  PullRequestProposal,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderPipelineDiagram, statLine } from "./shared";

export interface PullRequestReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly decision: EngineeringDecision;
  readonly proposal: PullRequestProposal;
  readonly elapsedMs: number;
}

const PIPELINE_STAGES: ReadonlyArray<string> = [
  "Repository",
  "Repository Analysis",
  "Engineering Knowledge",
  "Engineering Reasoning",
  "Engineering Planning",
  "Engineering Missions",
  "Implementation Requests",
  "Execution Planning",
  "Implementation Executor",
  "Provider Execution",
  "Validation",
  "Recommendation",
  "Reflection",
  "Adaptive Decision",
  "Pull Request Proposal",
];

function renderProposalSection(proposal: PullRequestProposal): string[] {
  return [
    RULE_SINGLE,
    "Pull Request Proposal",
    RULE_SINGLE,
    "",
    statLine("Kind", proposal.kind),
    statLine("Decision", proposal.decision),
    statLine("Risk", proposal.risk),
    statLine("Validation Score", String(proposal.validationScore)),
    statLine("Branch", proposal.branchName ?? "(none -- no PR should be created)"),
    statLine("Base Branch", proposal.baseBranch),
    statLine("Title", proposal.title),
    statLine("Human Approval", proposal.humanApprovalRequired ? "REQUIRED" : "NOT REQUIRED"),
    statLine("Proposed Changes", String(proposal.proposedChanges.length)),
    statLine("Verification Steps", String(proposal.verification.length)),
  ];
}

function renderBodySection(proposal: PullRequestProposal): string[] {
  return [RULE_SINGLE, "PR Body", RULE_SINGLE, "", ...proposal.body.split("\n")];
}

function renderStatisticsSection(input: PullRequestReportInput): string[] {
  return [
    RULE_SINGLE,
    "Statistics",
    RULE_SINGLE,
    "",
    statLine("Files Scanned", String(input.analysis.fileCount)),
    statLine("Subsystems", String(input.knowledge.subsystems.length)),
    statLine("Findings", String(input.reasoning.findings.length)),
    statLine("Missions", String(input.plan.missions.length)),
    statLine("Requests", String(input.proposal.implementationRequestIds.length)),
    statLine("Execution Plans", String(input.proposal.executionPlanIds.length)),
    statLine("Execution Time", `${input.elapsedMs} ms`),
  ];
}

function renderFooterSection(): string[] {
  return [
    RULE_SINGLE,
    "Pipeline Status",
    RULE_SINGLE,
    "",
    "✔ Adaptive Decision Complete",
    "✔ Pull Request Proposal Complete",
    "",
    "Overall Status",
    "SUCCESS",
    "",
    "Note: ORAM did not publish anything. This is a deterministic",
    "proposal only -- publication belongs to a future Publisher layer.",
  ];
}

export function renderPullRequestReport(input: PullRequestReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Pull Request Proposal",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(input.analysis),
    "",
    ...renderProposalSection(input.proposal),
    "",
    ...renderBodySection(input.proposal),
    "",
    ...renderStatisticsSection(input),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
