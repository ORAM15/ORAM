/**
 * renderExecutionPlanReport() — pure, presentation-only formatting for `oram execute-plan`'s console report.
 * Same shape and conventions as renderImplementationRequestsReport.ts (shared primitives live in
 * ./shared.ts): no color library, Unicode icons only, an explicit `elapsedMs` parameter so this stays
 * deterministic and directly testable. Adds one more pipeline stage (Execution Planning) and replaces the
 * Implementation Requests section with an Execution Plans section -- every value here was already produced
 * by @oram/engines; this file only decides how to lay it out. Does not execute anything: steps are printed
 * as text, never run.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  ImplementationRequestSet,
  ExecutionPlan,
  ExecutionPlanSet,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface ExecutionPlanReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly requestSet: ImplementationRequestSet;
  readonly planSet: ExecutionPlanSet;
  readonly elapsedMs: number;
}

const PLAN_RULE = "-".repeat(44);

/** "Execution Plan N" (1-based) for a given plan id, using its position in the plan set's own executionOrder. */
function planLabel(planId: string, planSet: ExecutionPlanSet): string {
  const position = planSet.executionOrder.indexOf(planId);
  return `Execution Plan ${position + 1}`;
}

/** "Implementation Request N" (1-based) for a given request id, using its position in the request set's own (already-deterministic) array order. */
function requestLabel(requestId: string, requestSet: ImplementationRequestSet): string {
  const position = requestSet.requests.findIndex((request) => request.id === requestId);
  return `Implementation Request ${position + 1}`;
}

function renderExecutionPlan(executionPlan: ExecutionPlan, requestSet: ImplementationRequestSet, planSet: ExecutionPlanSet): string[] {
  const dependencies =
    executionPlan.dependencyIds.length === 0 ? "None" : executionPlan.dependencyIds.map((id) => planLabel(id, planSet)).join(", ");

  const lines: string[] = [
    `${planLabel(executionPlan.id, planSet)}: ${executionPlan.title}`,
    "",
    `Priority: ${executionPlan.priority.toUpperCase()}`,
    `Request: ${requestLabel(executionPlan.requestId, requestSet)}`,
    `Dependencies: ${dependencies}`,
    "",
    "Execution Steps:",
  ];
  executionPlan.steps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${step.action}`, `     ${step.description}`);
  });
  lines.push("", PLAN_RULE, "");
  return lines;
}

function renderExecutionPlansSection(requestSet: ImplementationRequestSet, planSet: ExecutionPlanSet): string[] {
  const lines: string[] = [RULE_SINGLE, "Execution Plans", RULE_SINGLE, ""];
  if (planSet.plans.length === 0) {
    lines.push("✔ No execution plans generated.");
    return lines;
  }
  for (const executionPlan of planSet.plans) lines.push(...renderExecutionPlan(executionPlan, requestSet, planSet));
  lines.pop(); // drop the trailing blank line after the last plan's rule
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  requestSet: ImplementationRequestSet,
  planSet: ExecutionPlanSet,
  elapsedMs: number
): string[] {
  const stepCount = planSet.plans.reduce((total, executionPlan) => total + executionPlan.steps.length, 0);
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
    statLine("Requests", String(requestSet.requests.length)),
    statLine("Execution Plans", String(planSet.plans.length)),
    statLine("Steps", String(stepCount)),
    statLine("Dependencies", String(planSet.dependencies.length)),
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
];

export function renderExecutionPlanReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  requestSet,
  planSet,
  elapsedMs,
}: ExecutionPlanReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Execution Plan",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderExecutionPlansSection(requestSet, planSet),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, requestSet, planSet, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
