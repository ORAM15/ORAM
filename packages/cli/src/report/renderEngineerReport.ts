/**
 * renderEngineerReport() — pure, presentation-only formatting for `oram engineer`'s console report. Same
 * conventions as every other renderer in this directory (shared primitives live in ./shared.ts): no color
 * library, an explicit `elapsedMs` parameter so this stays deterministic and directly testable.
 *
 * This report deliberately looks different from its siblings: `oram engineer` is the flagship "whole
 * platform in one command" demo (Capability Sprint 15), so instead of the boxed pipeline diagram it renders
 * an operating-system-boot-sequence checklist -- one `[✓]` line per engine, in execution order -- followed by
 * the FINAL ENGINEERING DECISION and a one-screen summary. Every value below was already produced by
 * @oram/engines (the summary's "Repository Health" is Engineering Memory's own RunSnapshot.validationScore,
 * "Architecture" is the same describeArchitecture() every other report uses); this file only decides how to
 * lay it out. The checklist itself is honest, not decorative: the input type requires every stage's output,
 * so this function is only callable once all thirteen engines have actually run.
 */
import type {
  RepositoryAnalysis,
  EngineeringKnowledge,
  EngineeringReasoning,
  EngineeringPlan,
  RunSnapshot,
  EngineeringDecision,
  PullRequestProposal,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, describeArchitecture, statLine } from "./shared";

export interface EngineerReportInput {
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  /** Engineering Memory's record of this very run -- the source of the summary's "Repository Health" score. */
  readonly snapshot: RunSnapshot;
  readonly decision: EngineeringDecision;
  /** The Pull Request Engine's deterministic proposal (Capability Sprint 16) -- rendered, never published. */
  readonly proposal: PullRequestProposal;
  readonly elapsedMs: number;
}

/** The thirteen engines `oram engineer` runs, in execution order, under each Sprint's own stage names. */
const BOOT_SEQUENCE: ReadonlyArray<string> = [
  "Repository Analysis",
  "Engineering Knowledge",
  "Engineering Reasoning",
  "Engineering Planning",
  "Engineering Missions",
  "Implementation Requests",
  "Execution Planning",
  "Implementation Executor",
  "Recommendation Engine",
  "Reflection Engine",
  "Engineering Memory",
  "Adaptive Decision Engine",
  "Pull Request Engine",
];

function renderBootSection(analysis: RepositoryAnalysis): string[] {
  return [
    RULE_DOUBLE,
    "ORAM Engineering Pipeline",
    RULE_DOUBLE,
    "",
    statLine("Repository", analysis.projectName),
    "",
    ...BOOT_SEQUENCE.map((stage) => `[✓] ${stage}`),
  ];
}

function renderFinalDecisionSection(decision: EngineeringDecision): string[] {
  return [
    RULE_SINGLE,
    "FINAL ENGINEERING DECISION",
    RULE_SINGLE,
    "",
    statLine("Decision", decision.decisionType),
    "",
    statLine("Risk", decision.riskLevel),
    "",
    statLine("Next Action", decision.nextAction),
  ];
}

function renderProposalSection(proposal: PullRequestProposal): string[] {
  return [
    RULE_SINGLE,
    "PULL REQUEST PROPOSAL",
    RULE_SINGLE,
    "",
    statLine("Kind", proposal.kind),
    "",
    statLine("Branch", proposal.branchName ?? "(none -- no PR should be created)"),
    "",
    statLine("Title", proposal.title),
    "",
    statLine("Human Approval", proposal.humanApprovalRequired ? "REQUIRED" : "NOT REQUIRED"),
  ];
}

function renderSummarySection(
  analysis: RepositoryAnalysis,
  knowledge: EngineeringKnowledge,
  reasoning: EngineeringReasoning,
  plan: EngineeringPlan,
  snapshot: RunSnapshot,
  decision: EngineeringDecision,
  elapsedMs: number
): string[] {
  return [
    RULE_SINGLE,
    "Pipeline Summary",
    RULE_SINGLE,
    "",
    statLine("Repository Health", String(snapshot.validationScore)),
    statLine("Architecture", describeArchitecture(analysis)),
    statLine("Subsystems", String(knowledge.subsystems.length)),
    statLine("Relationships", String(knowledge.dependencyRelationships.length)),
    statLine("Findings", String(reasoning.findings.length)),
    statLine("Missions", String(plan.missions.length)),
    statLine("Decision", decision.decisionType),
    statLine("Execution Time", `${elapsedMs} ms`),
  ];
}

export function renderEngineerReport({
  analysis,
  knowledge,
  reasoning,
  plan,
  snapshot,
  decision,
  proposal,
  elapsedMs,
}: EngineerReportInput): string {
  const lines: string[] = [
    ...renderBootSection(analysis),
    "",
    ...renderFinalDecisionSection(decision),
    "",
    ...renderProposalSection(proposal),
    "",
    ...renderSummarySection(analysis, knowledge, reasoning, plan, snapshot, decision, elapsedMs),
    "",
    RULE_DOUBLE,
    "ORAM COMPLETE",
    RULE_DOUBLE,
  ];
  return lines.join("\n");
}
