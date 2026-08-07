/**
 * renderRecommendationsReport() — pure, presentation-only formatting for `oram recommend`'s console report.
 * Same shape and conventions as renderExecutionReport.ts (shared primitives live in ./shared.ts): no color
 * library, Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly
 * testable. Adds one more pipeline stage (Recommendation) and replaces the Execution section with a
 * Recommendations section showing, per recommendation, the Issue that produced it, the Recommendation text
 * itself, and its Priority -- every value here was already produced by @oram/engines; this file only decides
 * how to lay it out.
 *
 * Recommendation itself carries only `validationIssueId`, not the source ValidationIssue's own `title` -- so
 * this file builds a small local id -> issue lookup from the ValidationResult it's already given, purely for
 * display; it never re-derives or re-evaluates anything @oram/engines hasn't already produced.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  ValidationResult,
  ValidationIssue,
  Recommendation,
  RecommendationSet,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface RecommendationsReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly elapsedMs: number;
}

const RECOMMENDATION_RULE = "-".repeat(44);

function issueLookup(validationResult: ValidationResult): ReadonlyMap<string, ValidationIssue> {
  const map = new Map<string, ValidationIssue>();
  for (const report of validationResult.reports) {
    for (const issue of report.issues) map.set(issue.id, issue);
  }
  return map;
}

function renderRecommendation(recommendation: Recommendation, index: number, issues: ReadonlyMap<string, ValidationIssue>): string[] {
  const issue = issues.get(recommendation.validationIssueId);
  return [
    `Recommendation ${index + 1}: ${recommendation.title}`,
    "",
    `Issue: ${issue?.title ?? recommendation.validationIssueId}`,
    `Recommendation: ${recommendation.description}`,
    `Priority: ${recommendation.priority}`,
    `Category: ${recommendation.category}`,
    `Confidence: ${Math.round(recommendation.confidence * 100)}%`,
    "",
    RECOMMENDATION_RULE,
    "",
  ];
}

function renderRecommendationsSection(recommendationSet: RecommendationSet, validationResult: ValidationResult): string[] {
  const lines: string[] = [RULE_SINGLE, "Recommendations", RULE_SINGLE, ""];
  if (recommendationSet.recommendations.length === 0) {
    lines.push("✔ No recommendations -- every validated patch passed cleanly.");
    return lines;
  }
  const issues = issueLookup(validationResult);
  recommendationSet.recommendations.forEach((recommendation, index) => lines.push(...renderRecommendation(recommendation, index, issues)));
  lines.pop(); // drop the trailing blank line after the last recommendation's rule
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  validationResult: ValidationResult,
  recommendationSet: RecommendationSet,
  elapsedMs: number
): string[] {
  const issueCount = validationResult.reports.reduce((total, report) => total + report.issues.length, 0);
  const passedReports = validationResult.reports.filter((report) => report.passed).length;
  return [
    RULE_SINGLE,
    "Statistics",
    RULE_SINGLE,
    "",
    statLine("Files Scanned", String(analysis.fileCount)),
    statLine("Subsystems", String(knowledge.subsystems.length)),
    statLine("Relationships", String(knowledge.dependencyRelationships.length)),
    statLine("Findings", String(reasoning.findings.length)),
    statLine("Missions", String(plan.missions.length)),
    statLine("Validation Reports", String(validationResult.reports.length)),
    statLine("Reports Passed", String(passedReports)),
    statLine("Validation Issues", String(issueCount)),
    statLine("Recommendations", String(recommendationSet.recommendations.length)),
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
  "Recommendations",
];

export function renderRecommendationsReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  validationResult,
  recommendationSet,
  elapsedMs,
}: RecommendationsReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Recommendations",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderRecommendationsSection(recommendationSet, validationResult),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, validationResult, recommendationSet, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
