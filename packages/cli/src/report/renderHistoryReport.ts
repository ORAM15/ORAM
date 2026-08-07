/**
 * renderHistoryReport() — pure, presentation-only formatting for `oram history`'s console report. Same
 * shape and conventions as renderReflectionReport.ts (shared primitives live in ./shared.ts): no color
 * library, Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly
 * testable. Shows Repository / Total Runs / Latest Run / Average Score / Best Score / Worst Score / Retry %
 * / Trend / Last Reflection -- every value here was already produced by @oram/engines' MemoryStore; this
 * file only decides how to lay it out and computes "Trend," a presentation-only derived label never baked
 * into MemoryStatistics itself (that type's own field list matches this Sprint's "Statistics" section
 * exactly, which does not include a trend).
 */
import type { RepositoryAnalysis, EngineeringKnowledge, EngineeringReasoning, EngineeringPlan, RunSnapshot, RepositoryHistory, MemoryStatistics } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface HistoryReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly snapshot: RunSnapshot;
  readonly history: RepositoryHistory;
  readonly statistics: MemoryStatistics;
  readonly elapsedMs: number;
}

type Trend = "IMPROVING" | "DECLINING" | "STABLE" | "N/A";

/** Compares the latest snapshot's validationScore against the average of every PRIOR snapshot for this repository. "N/A" when there is no prior run to compare against -- never a guessed direction from a single data point. */
function computeTrend(history: RepositoryHistory): Trend {
  if (history.snapshots.length < 2) return "N/A";
  const ordered = [...history.snapshots].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = ordered[ordered.length - 1]!;
  const prior = ordered.slice(0, -1);
  const priorAverage = prior.reduce((total, s) => total + s.validationScore, 0) / prior.length;
  if (latest.validationScore > priorAverage) return "IMPROVING";
  if (latest.validationScore < priorAverage) return "DECLINING";
  return "STABLE";
}

function renderHistorySection(snapshot: RunSnapshot, history: RepositoryHistory, statistics: MemoryStatistics): string[] {
  const retryPercent = Math.round(statistics.averageRetryRate * 100);
  return [
    RULE_SINGLE,
    "Run History",
    RULE_SINGLE,
    "",
    `Repository: ${snapshot.repositoryId}`,
    `Total Runs: ${statistics.totalRuns}`,
    `Latest Run: ${snapshot.runId}`,
    `Average Score: ${statistics.averageValidationScore}/100`,
    `Best Score: ${statistics.bestScore ?? "N/A"}`,
    `Worst Score: ${statistics.worstScore ?? "N/A"}`,
    `Retry %: ${retryPercent}%`,
    `Trend: ${computeTrend(history)}`,
    `Last Reflection: ${snapshot.reflectionSummary}`,
  ];
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  statistics: MemoryStatistics,
  elapsedMs: number
): string[] {
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
    statLine("Avg Validation Score", String(statistics.averageValidationScore)),
    statLine("Avg Recommendations", statistics.averageRecommendationCount.toFixed(1)),
    statLine("Avg Missions", statistics.averageMissionCount.toFixed(1)),
    statLine("Avg Execution Plans", statistics.averageExecutionPlanCount.toFixed(1)),
    statLine("Avg Retries", `${Math.round(statistics.averageRetryRate * 100)}%`),
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
    "✔ Engineering Memory Complete",
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
  "Engineering Memory",
];

export function renderHistoryReport({ analysis, knowledge, reasoning, plan, snapshot, history, statistics, elapsedMs }: HistoryReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Run History",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderHistorySection(snapshot, history, statistics),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, statistics, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
