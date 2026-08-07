/**
 * Shared, pure formatting primitives for every `oram` console report (renderAnalysisReport.ts,
 * renderPlanReport.ts, ...). Extracted once two reports needed the identical pipeline-diagram/statistics/
 * repository-section rendering, rather than duplicated per report -- pure presentation, computes nothing
 * @oram/engines hasn't already produced.
 */
import type { RepositoryAnalysis, EngineeringKnowledge, Severity } from "@oram/engines";

export const WIDTH = 52;
export const RULE_DOUBLE = "=".repeat(WIDTH);
export const RULE_SINGLE = "-".repeat(WIDTH);

export const SEVERITY_ICON: Readonly<Record<Severity, string>> = { High: "⚠", Medium: "⚠", Low: "ℹ" };

export function shortLabel(text: string): string {
  const base = text.split("/").pop() ?? text;
  return base.length > 0 ? base.charAt(0).toUpperCase() + base.slice(1) : base;
}

/** "subsystem:<path>" -> that subsystem's own short label; "repository:<name>" (or anything else) -> the project name -- a repo-wide dependency has no one subsystem to name. */
export function relationshipFromLabel(from: string, knowledge: EngineeringKnowledge, projectName: string): string {
  const subsystem = knowledge.subsystems.find((s) => s.id === from);
  return subsystem ? shortLabel(subsystem.path) : projectName;
}

export function describeArchitecture(analysis: RepositoryAnalysis): string {
  const pattern = analysis.architecturalPatterns.find((p) => p.value !== "Unknown");
  if (pattern) return pattern.value;
  if (analysis.monorepo.value) return "Monorepo";
  return analysis.projectType.value;
}

export function renderRepositorySection(analysis: RepositoryAnalysis): string[] {
  const language = analysis.primaryLanguages.find((l) => l.value !== "Unknown")?.value ?? "Unknown";
  const packageManager = analysis.packageManagers[0]?.value ?? "Unknown";
  return [
    "Repository",
    `✔ Name: ${analysis.projectName}`,
    `✔ Language: ${language}`,
    `✔ Package Manager: ${packageManager}`,
    `✔ Architecture: ${describeArchitecture(analysis)}`,
  ];
}

export function renderKnowledgeSection(analysis: RepositoryAnalysis, knowledge: EngineeringKnowledge): string[] {
  const lines: string[] = [RULE_SINGLE, "Engineering Knowledge", RULE_SINGLE, "", "Subsystems"];
  if (knowledge.subsystems.length === 0) {
    lines.push("  (none detected)");
  } else {
    for (const subsystem of knowledge.subsystems) lines.push(`  • ${subsystem.path}`);
  }

  lines.push("", "Relationships");
  if (knowledge.dependencyRelationships.length === 0) {
    lines.push("  (none detected)");
  } else {
    for (const relationship of knowledge.dependencyRelationships) {
      lines.push(`  • ${relationshipFromLabel(relationship.from, knowledge, analysis.projectName)} → ${relationship.to}`);
    }
  }
  return lines;
}

/** Right-pads `label` with dots up to a fixed column so every stat's value lines up, e.g. "Subsystems ............. 10". */
const STAT_LABEL_COLUMN = 24;

export function statLine(label: string, value: string): string {
  const dots = ".".repeat(Math.max(STAT_LABEL_COLUMN - label.length - 1, 3));
  return `${label} ${dots} ${value}`;
}

function centerLabel(label: string, innerWidth: number): string {
  const totalPad = innerWidth - label.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return `${" ".repeat(left)}${label}${" ".repeat(right)}`;
}

/** A boxed top-to-bottom flow diagram of the pipeline stages, printed before the report itself -- pure formatting over a fixed, hardcoded stage list (the pipeline's shape isn't something @oram/engines exposes, so this doesn't read it from anywhere). */
export function renderPipelineDiagram(stages: ReadonlyArray<string>): string[] {
  const innerWidth = Math.max(...stages.map((s) => s.length)) + 2;
  const boxWidth = innerWidth + 2;
  const top = `┌${"─".repeat(innerWidth)}┐`;
  const bottom = `└${"─".repeat(innerWidth)}┘`;
  const connectorColumn = Math.floor(boxWidth / 2);
  const connector = `${" ".repeat(connectorColumn)}│`;
  const arrow = `${" ".repeat(connectorColumn)}▼`;

  const lines: string[] = [];
  stages.forEach((stage, index) => {
    lines.push(top, `│${centerLabel(stage, innerWidth)}│`, bottom);
    if (index < stages.length - 1) lines.push(connector, arrow);
  });
  return lines;
}
