/**
 * renderExecutionReport() — pure, presentation-only formatting for `oram execute`'s console report. Same
 * shape and conventions as renderExecutionPlanReport.ts (shared primitives live in ./shared.ts): no color
 * library, Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly
 * testable. Adds one more pipeline stage (Implementation Executor) and replaces the Execution Plans section
 * with an Execution section showing what actually happened when each plan's steps were run through the
 * (MemoryAdapter-backed, side-effect-free) executor -- every value here was already produced by
 * @oram/engines; this file only decides how to lay it out.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  ExecutionPlanSet,
  ExecutionResult,
  ExecutionStatus,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface ExecutionReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly planSet: ExecutionPlanSet;
  readonly results: ReadonlyArray<ExecutionResult>;
  readonly elapsedMs: number;
}

const STEP_RULE = "-".repeat(44);

const STATUS_ICON: Readonly<Record<ExecutionStatus, string>> = {
  SUCCESS: "✔",
  FAILED: "✖",
  SKIPPED: "○",
  PENDING: "…",
  RUNNING: "…",
};

/** "Execution Plan N" (1-based) for a given plan id, using its position in the plan set's own executionOrder -- same technique as renderExecutionPlanReport.ts's own planLabel(). */
function planLabel(planId: string, planSet: ExecutionPlanSet): string {
  const position = planSet.executionOrder.indexOf(planId);
  return `Execution Plan ${position + 1}`;
}

function planTitle(planId: string, planSet: ExecutionPlanSet): string {
  return planSet.plans.find((plan) => plan.id === planId)?.title ?? planId;
}

function renderResult(result: ExecutionResult, planSet: ExecutionPlanSet): string[] {
  const lines: string[] = [`${planLabel(result.planId, planSet)}: ${planTitle(result.planId, planSet)}`, ""];
  result.steps.forEach((step, index) => {
    lines.push(`Step ${index + 1}`, step.action, `${STATUS_ICON[step.status]} ${step.status}`, "", STEP_RULE, "");
  });
  lines.pop(); // drop the trailing blank line after the last step's rule
  return lines;
}

function renderExecutionSection(results: ReadonlyArray<ExecutionResult>, planSet: ExecutionPlanSet): string[] {
  const lines: string[] = [RULE_SINGLE, "Execution", RULE_SINGLE, ""];
  if (results.length === 0) {
    lines.push("✔ No execution plans to run.");
    return lines;
  }
  results.forEach((result, index) => {
    lines.push(...renderResult(result, planSet));
    if (index < results.length - 1) lines.push("", "");
  });
  return lines;
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  planSet: ExecutionPlanSet,
  results: ReadonlyArray<ExecutionResult>,
  elapsedMs: number
): string[] {
  const stepCount = results.reduce((total, result) => total + result.steps.length, 0);
  const succeededSteps = results.reduce((total, result) => total + result.steps.filter((s) => s.status === "SUCCESS").length, 0);
  const failedPlans = results.filter((result) => result.status === "FAILED").length;
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
    statLine("Execution Plans", String(planSet.plans.length)),
    statLine("Steps Run", String(stepCount)),
    statLine("Steps Succeeded", String(succeededSteps)),
    statLine("Plans Failed", String(failedPlans)),
    statLine("Execution Time", `${elapsedMs} ms`),
  ];
}

function renderFooterSection(overallSuccess: boolean): string[] {
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
    overallSuccess ? "✔ Implementation Executor Complete" : "✖ Implementation Executor Failed",
    "",
    "Overall Status",
    overallSuccess ? "SUCCESS" : "FAILED",
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
];

export function renderExecutionReport({ analysis, knowledge, reasoning, plan, planSet, results, elapsedMs }: ExecutionReportInput): string {
  const overallSuccess = results.every((result) => result.status === "SUCCESS");

  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Execution",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderExecutionSection(results, planSet),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, planSet, results, elapsedMs),
    "",
    ...renderFooterSection(overallSuccess),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
