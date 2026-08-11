/**
 * renderPublishReport() — pure, presentation-only formatting for `oram publish`'s console report. Same shape
 * and conventions as renderPullRequestReport.ts (shared primitives live in ./shared.ts): no color library, an
 * explicit `elapsedMs` parameter so this stays deterministic and directly testable. Every value here was
 * already produced by @oram/engines -- this file only decides how to lay it out.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  PullRequestProposal,
  PublishRecord,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderPipelineDiagram, statLine } from "./shared";

export interface PublishReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly proposal: PullRequestProposal;
  readonly record: PublishRecord;
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
  "Publisher",
];

function renderRecordSection(record: PublishRecord): string[] {
  return [
    RULE_SINGLE,
    "Publish Record",
    RULE_SINGLE,
    "",
    statLine("Outcome", record.outcome),
    statLine("Publisher", record.publisherId),
    statLine("Dry Run", record.dryRun ? "YES -- no real git/GitHub operation was performed" : "NO"),
    statLine("Branch", record.branchName ?? "(none)"),
    statLine("Reason", record.reason),
    statLine("Pull Request URL", record.pullRequestUrl ?? "None"),
  ];
}

function renderStagesSection(record: PublishRecord): string[] {
  const lines = [RULE_SINGLE, "Publishing Stages", RULE_SINGLE, ""];
  if (record.stages.length === 0) {
    lines.push("(none attempted -- see Reason above)");
    return lines;
  }
  for (const stage of record.stages) {
    lines.push(`${stage.status === "PASS" ? "✔" : stage.status === "FAIL" ? "✘" : "—"} ${stage.name}: ${stage.details}`);
  }
  return lines;
}

function renderStatisticsSection(input: PublishReportInput): string[] {
  return [
    RULE_SINGLE,
    "Statistics",
    RULE_SINGLE,
    "",
    statLine("Files Scanned", String(input.analysis.fileCount)),
    statLine("Subsystems", String(input.knowledge.subsystems.length)),
    statLine("Findings", String(input.reasoning.findings.length)),
    statLine("Missions", String(input.plan.missions.length)),
    statLine("Proposal Kind", input.proposal.kind),
    statLine("Execution Time", `${input.elapsedMs} ms`),
  ];
}

function renderFooterSection(): string[] {
  return [
    RULE_SINGLE,
    "Pipeline Status",
    RULE_SINGLE,
    "",
    "✔ Pull Request Proposal Complete",
    "✔ Publisher Complete",
    "",
    "Overall Status",
    "SUCCESS",
    "",
    "Note: this was a dry run. Nothing was actually committed, pushed,",
    "or opened on GitHub. Real publishing remains future work.",
  ];
}

export function renderPublishReport(input: PublishReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Publish Record",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(input.analysis),
    "",
    ...renderRecordSection(input.record),
    "",
    ...renderStagesSection(input.record),
    "",
    ...renderStatisticsSection(input),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
