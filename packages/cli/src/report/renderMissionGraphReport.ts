/**
 * renderMissionGraphReport() — pure, presentation-only formatting for `oram missions`'s console report. Same
 * shape and conventions as renderPlanReport.ts (shared primitives live in ./shared.ts): no color library,
 * Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly testable.
 * Adds one more pipeline stage (Engineering Missions) and replaces the flat Missions list with a "Mission
 * Graph" section that also shows each Mission's dependencies -- every value here was already produced by
 * @oram/engines; this file only decides how to lay it out.
 */
import type { RepositoryAnalysis, EngineeringKnowledge, EngineeringReasoning, EngineeringPlan, MissionGraph, MissionNode } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface MissionGraphReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly graph: MissionGraph;
  readonly elapsedMs: number;
}

const MISSION_RULE = "-".repeat(44);

/** "Mission N" (1-based) for a given Mission id, using its position in the graph's own executionOrder -- the graph's single source of truth for numbering, never recomputed from array position. */
function missionLabel(missionId: string, graph: MissionGraph): string {
  const position = graph.executionOrder.indexOf(missionId);
  return `Mission ${position + 1}`;
}

function renderMissionNode(mission: MissionNode, graph: MissionGraph): string[] {
  const dependencies = mission.dependencyIds.length === 0 ? "None" : mission.dependencyIds.map((id) => missionLabel(id, graph)).join(", ");

  const lines: string[] = [
    `${missionLabel(mission.id, graph)}: ${mission.title}`,
    "",
    `Priority: ${mission.priority.toUpperCase()}`,
    `Estimated Effort: ${mission.estimatedEffort}`,
    `Expected Impact: ${mission.expectedImpact}`,
    `Dependencies: ${dependencies}`,
    "",
    "Tasks:",
  ];
  mission.tasks.forEach((task, index) => {
    lines.push(`  ${index + 1}. ${task.title}`, `     ${task.description}`);
  });
  lines.push("", MISSION_RULE, "");
  return lines;
}

function renderMissionGraphSection(graph: MissionGraph): string[] {
  const lines: string[] = [RULE_SINGLE, "Mission Graph", RULE_SINGLE, ""];
  if (graph.missions.length === 0) {
    lines.push("✔ No missions planned.");
    return lines;
  }
  for (const mission of graph.missions) lines.push(...renderMissionNode(mission, graph));
  lines.pop(); // drop the trailing blank line after the last mission's rule
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  graph: MissionGraph,
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
    statLine("Missions", String(graph.missions.length)),
    statLine("Tasks", String(taskCount)),
    statLine("Dependencies", String(graph.dependencies.length)),
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
];

export function renderMissionGraphReport({ analysis, knowledge, reasoning, plan, graph, elapsedMs }: MissionGraphReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Mission Graph",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderMissionGraphSection(graph),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, graph, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
