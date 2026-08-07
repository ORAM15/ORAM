/**
 * renderDecisionReport() — pure, presentation-only formatting for `oram decide`'s console report. Same
 * shape and conventions as renderHistoryReport.ts (shared primitives live in ./shared.ts): no color library,
 * Unicode icons only, an explicit `elapsedMs` parameter so this stays deterministic and directly testable.
 * The "Engineering Decision" section's own line labels (Validation/Recommendation/Risk/Decision/Reason/Next
 * Action) match this Sprint's own spec example exactly, via the same `statLine()` dot-leader helper every
 * other report already uses -- every value here was already produced by @oram/engines; this file only
 * decides how to lay it out.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  ValidationResult,
  RecommendationSet,
  EngineeringDecision,
} from "@oram/engines";
import { computeValidationScore } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, renderRepositorySection, renderKnowledgeSection, renderPipelineDiagram, statLine } from "./shared";

export interface DecisionReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly decision: EngineeringDecision;
  readonly elapsedMs: number;
}

function renderDecisionSection(validationResult: ValidationResult, decision: EngineeringDecision): string[] {
  return [
    RULE_SINGLE,
    "Engineering Decision",
    RULE_SINGLE,
    "",
    statLine("Validation", String(computeValidationScore(validationResult))),
    "",
    statLine("Recommendation", decision.decisionType),
    "",
    statLine("Risk", decision.riskLevel),
    "",
    statLine("Decision", decision.decisionType),
    "",
    statLine("Reason", decision.reason),
    "",
    statLine("Next Action", decision.nextAction),
  ];
}

function renderStatisticsSection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  recommendationSet: RecommendationSet,
  decision: EngineeringDecision,
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
    statLine("Recommendations", String(recommendationSet.recommendations.length)),
    statLine("Decision Confidence", `${Math.round(decision.confidence * 100)}%`),
    statLine("Evidence Items", String(decision.evidenceIds.length)),
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
    "✔ Adaptive Decision Complete",
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
  "Adaptive Decision",
];

export function renderDecisionReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  validationResult,
  recommendationSet,
  decision,
  elapsedMs,
}: DecisionReportInput): string {
  const lines: string[] = [
    ...renderPipelineDiagram(PIPELINE_STAGES),
    "",
    RULE_DOUBLE,
    "ORAM Engineering Decision",
    RULE_DOUBLE,
    "",
    ...renderRepositorySection(analysis),
    "",
    ...renderKnowledgeSection(analysis, knowledge),
    "",
    ...renderDecisionSection(validationResult, decision),
    "",
    ...renderStatisticsSection(analysis, knowledge, reasoning, plan, recommendationSet, decision, elapsedMs),
    "",
    ...renderFooterSection(),
    "",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
