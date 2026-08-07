/**
 * renderAnalysisReport() — pure, presentation-only formatting for `oram analyze`'s console report.
 *
 * Deliberately separate from analyzeCommand.ts: this function takes already-computed pipeline output plus
 * an explicit `elapsedMs` (never measures time itself), so it is fully deterministic and directly testable
 * without spawning a process or capturing real timing -- see report/renderAnalysisReport.test.ts.
 *
 * No color library (project convention -- see this package's own header comments elsewhere for "no new
 * dependency for something this simple"). Unicode icons only. Does not compute anything: every value here
 * was already produced by @oram/engines' RepositoryAnalyzer / EngineeringKnowledge / EngineeringReasoning --
 * this file only decides how to lay it out. Shared primitives (pipeline diagram, repository/knowledge
 * sections, stat-line alignment) live in ./shared.ts, reused by renderPlanReport.ts as well.
 */
import type { RepositoryAnalysis, EngineeringKnowledge, EngineeringReasoning, Finding } from "@oram/engines";
import {
  RULE_DOUBLE,
  RULE_SINGLE,
  SEVERITY_ICON,
  renderRepositorySection,
  renderKnowledgeSection,
  renderPipelineDiagram,
  statLine,
} from "./shared";

export interface AnalysisReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly elapsedMs: number;
}

const FINDING_RULE = "-".repeat(44);

/** Display titles for the 5 MVP Engineering Reasoning rules -- see @oram/engines' engineering-reasoning/analysis/rules.ts for their `kind`s. Falls back to the raw kind for any future rule this report doesn't know about yet, rather than crashing. */
const FINDING_TITLES: Readonly<Record<string, string>> = {
  "subsystem-concentration": "Concentrated Subsystem",
  "untested-api-surface": "Untested API Surface",
  "unverified-monorepo": "No CI/CD in Monorepo",
  "subsystem-api-without-auth": "API Without Authentication",
  "opaque-subsystems": "Opaque Subsystems",
};

function findingTitle(finding: Finding): string {
  return FINDING_TITLES[finding.kind] ?? finding.kind;
}

function renderFindingsSection(reasoning: EngineeringReasoning): string[] {
  const lines: string[] = [RULE_SINGLE, "Engineering Findings", RULE_SINGLE, ""];
  if (reasoning.findings.length === 0) {
    lines.push("✔ No findings detected.");
    return lines;
  }
  for (const finding of reasoning.findings) {
    lines.push(`${SEVERITY_ICON[finding.severity]} ${finding.severity.toUpperCase()}`, findingTitle(finding), "", "Reason:", finding.summary, "", FINDING_RULE, "");
  }
  lines.pop(); // drop the trailing blank line after the last finding's rule
  return lines;
}

function renderStatisticsSection(analysis: RepositoryAnalysis, knowledge: EngineeringKnowledge, reasoning: EngineeringReasoning, elapsedMs: number): string[] {
  return [
    RULE_SINGLE,
    "Statistics",
    RULE_SINGLE,
    "",
    statLine("Files Scanned", String(analysis.fileCount)),
    statLine("Subsystems", String(knowledge.subsystems.length)),
    statLine("Relationships", String(knowledge.dependencyRelationships.length)),
    statLine("Findings", String(reasoning.findings.length)),
    statLine("Execution Time", `${elapsedMs} ms`),
  ];
}

function renderFooterSection(): string[] {
  return [
    RULE_SINGLE,
    "Pipeline Status",
    RULE_SINGLE,
    "",
    "✔ Repository Analysis Complete",
    "✔ Engineering Knowledge Complete",
    "✔ Engineering Reasoning Complete",
    "",
    "Overall Status",
    "SUCCESS",
  ];
}

const PIPELINE_STAGES: ReadonlyArray<string> = ["Repository", "Repository Analysis", "Engineering Knowledge", "Engineering Reasoning"];

export function renderAnalysisReport({ analysis, knowledge, reasoning, elapsedMs }: AnalysisReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Engineering Analysis",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderFindingsSection(reasoning),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
