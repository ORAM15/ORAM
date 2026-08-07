/**
 * renderReflectionReport() — pure, presentation-only formatting for `oram reflect`'s console report. Same
 * shape and conventions as renderRecommendationsReport.ts (shared primitives live in ./shared.ts): no color
 * library, Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly
 * testable. Adds one more pipeline stage (Reflection) and a Reflection section showing Findings, the report's
 * own Summary, its Retry Recommendation, Overall Score, and Confidence -- every value here was already
 * produced by @oram/engines; this file only decides how to lay it out.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  ValidationResult,
  RecommendationSet,
  ReflectionFinding,
  ReflectionReport,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface ReflectionReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly reflectionReport: ReflectionReport;
  readonly elapsedMs: number;
}

const FINDING_RULE = "-".repeat(44);

function renderFinding(findingItem: ReflectionFinding, index: number): string[] {
  return [
    `Finding ${index + 1}: ${findingItem.title}`,
    "",
    findingItem.description,
    `Category: ${findingItem.category}`,
    `Severity: ${findingItem.severity}`,
    "",
    FINDING_RULE,
    "",
  ];
}

function renderFindingsSection(reflectionReport: ReflectionReport): string[] {
  const lines: string[] = [RULE_SINGLE, "Findings", RULE_SINGLE, ""];
  if (reflectionReport.findings.length === 0) {
    lines.push("✔ No reflection findings.");
    return lines;
  }
  reflectionReport.findings.forEach((findingItem, index) => lines.push(...renderFinding(findingItem, index)));
  lines.pop(); // drop the trailing blank line after the last finding's rule
  return lines;
}

function renderReflectionSection(reflectionReport: ReflectionReport): string[] {
  return [
    RULE_SINGLE,
    "Reflection",
    RULE_SINGLE,
    "",
    "Summary:",
    reflectionReport.summary,
    "",
    `Retry Recommendation: ${reflectionReport.retryRecommended ? "RETRY" : "NO RETRY"}`,
    `Overall Score: ${reflectionReport.overallScore}/100`,
    `Confidence: ${Math.round(reflectionReport.confidence * 100)}%`,
  ];
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  validationResult: ValidationResult,
  recommendationSet: RecommendationSet,
  reflectionReport: ReflectionReport,
  elapsedMs: number
): string[] {
  const issueCount = validationResult.reports.reduce((total, report) => total + report.issues.length, 0);
  return [
    RULE_SINGLE,
    "Statistics",
    RULE_SINGLE,
    "",
    statLine("Files Scanned", String(analysis.fileCount)),
    statLine("Subsystems", String(knowledge.subsystems.length)),
    statLine("Relationships", String(knowledge.dependencyRelationships.length)),
    statLine("Findings (Reasoning)", String(reasoning.findings.length)),
    statLine("Missions", String(plan.missions.length)),
    statLine("Validation Reports", String(validationResult.reports.length)),
    statLine("Validation Issues", String(issueCount)),
    statLine("Recommendations", String(recommendationSet.recommendations.length)),
    statLine("Reflection Findings", String(reflectionReport.findings.length)),
    statLine("Overall Score", `${reflectionReport.overallScore}/100`),
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
    "✔ Engineering Planning Complete",
    "✔ Engineering Missions Complete",
    "✔ Implementation Requests Complete",
    "✔ Execution Planning Complete",
    "✔ Implementation Executor Complete",
    "✔ Provider Execution Complete",
    "✔ Validation Complete",
    "✔ Recommendation Complete",
    "✔ Reflection Complete",
    "",
    "Overall Status",
    "SUCCESS",
  ];
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
];

export function renderReflectionReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  validationResult,
  recommendationSet,
  reflectionReport,
  elapsedMs,
}: ReflectionReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Reflection",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderFindingsSection(reflectionReport),
    "",
    ...renderReflectionSection(reflectionReport),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, validationResult, recommendationSet, reflectionReport, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
