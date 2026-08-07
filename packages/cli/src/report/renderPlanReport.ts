/**
 * renderPlanReport() — pure, presentation-only formatting for `oram plan`'s console report. Same shape and
 * conventions as renderAnalysisReport.ts (shared primitives live in ./shared.ts): no color library, Unicode
 * icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly testable. Adds one
 * more pipeline stage (Engineering Planning) and replaces the Findings section with a Missions section --
 * every value here was already produced by @oram/engines; this file only decides how to lay it out.
 */
import type { RepositoryAnalysis, EngineeringKnowledge, EngineeringReasoning, EngineeringPlan, Mission } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, SEVERITY_ICON, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface PlanReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly elapsedMs: number;
}

const MISSION_RULE = "-".repeat(44);

function renderMission(mission: Mission): string[] {
  const lines: string[] = [
    `${SEVERITY_ICON[mission.priority]} ${mission.priority.toUpperCase()} PRIORITY`,
    mission.title,
    "",
    "Rationale:",
    mission.rationale,
    "",
    `Estimated Effort: ${mission.estimatedEffort}`,
    `Expected Impact: ${mission.expectedImpact}`,
    "",
    "Tasks:",
  ];
  mission.tasks.forEach((task, index) => {
    lines.push(`  ${index + 1}. ${task.title}`, `     ${task.description}`);
  });
  lines.push("", MISSION_RULE, "");
  return lines;
}

function renderMissionsSection(plan: EngineeringPlan): string[] {
  const lines: string[] = [RULE_SINGLE, "Engineering Missions", RULE_SINGLE, ""];
  if (plan.missions.length === 0) {
    lines.push("✔ No missions planned.");
    return lines;
  }
  for (const mission of plan.missions) lines.push(...renderMission(mission));
  lines.pop(); // drop the trailing blank line after the last mission's rule
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  elapsedMs: number
): string[] {
  const taskCount = plan.missions.reduce((total, mission) => total + mission.tasks.length, 0);
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
    statLine("Tasks", String(taskCount)),
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
];

export function renderPlanReport({ analysis, knowledge, reasoning, plan, elapsedMs }: PlanReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Engineering Plan",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderMissionsSection(plan),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
