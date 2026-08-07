/**
 * renderImplementationRequestsReport() — pure, presentation-only formatting for `oram requests`'s console
 * report. Same shape and conventions as renderMissionGraphReport.ts (shared primitives live in ./shared.ts):
 * no color library, Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and
 * directly testable. Adds one more pipeline stage (Implementation Requests) and replaces the Mission Graph
 * section with an Implementation Requests section -- every value here was already produced by @oram/engines;
 * this file only decides how to lay it out.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  MissionGraph,
  ImplementationRequest,
  ImplementationRequestSet,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface ImplementationRequestsReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly graph: MissionGraph;
  readonly requestSet: ImplementationRequestSet;
  readonly elapsedMs: number;
}

const REQUEST_RULE = "-".repeat(44);

/** "Mission N" (1-based) for a given Mission id, using its position in the graph's own executionOrder -- same technique as renderMissionGraphReport.ts's own missionLabel(). */
function missionLabel(missionId: string, graph: MissionGraph): string {
  const position = graph.executionOrder.indexOf(missionId);
  return `Mission ${position + 1}`;
}

function renderRequest(request: ImplementationRequest, index: number, graph: MissionGraph): string[] {
  const lines: string[] = [
    `Implementation Request ${index + 1}: ${request.title}`,
    "",
    `Mission: ${missionLabel(request.missionId, graph)}`,
    `Priority: ${request.priority.toUpperCase()}`,
    `Estimated Effort: ${request.estimatedEffort}`,
    "",
    "Goal:",
    request.goal,
    "",
    "Targets:",
  ];
  if (request.implementationTargets.length === 0) {
    lines.push("  (none identified)");
  } else {
    for (const target of request.implementationTargets) lines.push(`  • ${target.subsystem}`);
  }

  lines.push("", "Acceptance Criteria:");
  request.acceptanceCriteria.forEach((criterion, criterionIndex) => {
    lines.push(`  ${criterionIndex + 1}. ${criterion.description}`);
  });

  lines.push("", "Constraints:");
  for (const constraint of request.constraints) lines.push(`  • ${constraint.description}`);

  lines.push("", REQUEST_RULE, "");
  return lines;
}

function renderRequestsSection(requestSet: ImplementationRequestSet, graph: MissionGraph): string[] {
  const lines: string[] = [RULE_SINGLE, "Implementation Requests", RULE_SINGLE, ""];
  if (requestSet.requests.length === 0) {
    lines.push("✔ No implementation requests generated.");
    return lines;
  }
  requestSet.requests.forEach((request, index) => lines.push(...renderRequest(request, index, graph)));
  lines.pop(); // drop the trailing blank line after the last request's rule
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  graph: MissionGraph,
  requestSet: ImplementationRequestSet,
  elapsedMs: number
): string[] {
  const targetCount = requestSet.requests.reduce((total, request) => total + request.implementationTargets.length, 0);
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
    statLine("Dependencies", String(graph.dependencies.length)),
    statLine("Requests", String(requestSet.requests.length)),
    statLine("Targets", String(targetCount)),
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
];

export function renderImplementationRequestsReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  graph,
  requestSet,
  elapsedMs,
}: ImplementationRequestsReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Implementation Requests",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderRequestsSection(requestSet, graph),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, graph, requestSet, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
