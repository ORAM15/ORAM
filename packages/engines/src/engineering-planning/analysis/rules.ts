/**
 * The 3 initial deterministic Finding -> Mission mapping rules (Engineering Planning MVP). Each rule matches
 * a subset of EngineeringReasoning's Findings and, if any match, produces exactly one Mission aggregating all
 * of them (one MissionTask per matching Finding) -- never one Mission per Finding, so related Findings become
 * one coherent unit of work instead of a flat 1:1 restatement of the Findings list.
 *
 * CONCRETE LIMITATION -- READ BEFORE ASSUMING ALL 3 MAPPINGS FIRE ON A REAL REPOSITORY TODAY
 *
 *   "Improve Subsystem Documentation" (matches Finding.kind === "opaque-subsystems") and "Increase Test
 *   Coverage" (matches Finding.category === "testing-gap", which today only ever means the existing
 *   "untested-api-surface" rule) are both real. "Refactor Circular Dependencies" matches Finding.kind ===
 *   "circular-dependencies" -- a Finding kind Engineering Reasoning does not emit yet. That mapping is
 *   included because it was explicitly requested as an initial supported mapping; it will not fire against
 *   any real run until a future reasoning rule detects circular dependencies.
 *
 * Sprint 21 provenance addition: each Mission preserves the unique sourceFiles from all Findings matched by
 * its template. This is a deterministic provenance join, not a claim that every source file is an edit target.
 */

import type { Finding } from "../../engineering-reasoning/analysis/types";
import { makeId } from "../../repository-analyzer/analysis/identity";
import type { EstimatedEffort, Mission, MissionTask, Priority } from "./types";

interface MissionTemplate {
  readonly kind: string;
  readonly title: string;
  readonly taskTitle: string;
  readonly expectedImpact: string;
  readonly rationaleIntro: string;
  readonly matches: (finding: Finding) => boolean;
}

const SEVERITY_RANK: Readonly<Record<Priority, number>> = { Low: 0, Medium: 1, High: 2 };

const TEMPLATES: ReadonlyArray<MissionTemplate> = [
  {
    kind: "improve-subsystem-documentation",
    title: "Improve Subsystem Documentation",
    taskTitle: "Document subsystem responsibilities and dependencies",
    expectedImpact: "Reduces onboarding friction and clarifies subsystem ownership and responsibilities.",
    rationaleIntro: "Undocumented subsystems slow onboarding and increase the risk of duplicated or conflicting work as the codebase grows.",
    matches: (finding) => finding.kind === "opaque-subsystems",
  },
  {
    kind: "increase-test-coverage",
    title: "Increase Test Coverage",
    taskTitle: "Add automated test coverage",
    expectedImpact: "Reduces the risk of undetected regressions and makes future changes safer to make.",
    rationaleIntro: "Untested code -- especially an exposed API surface -- carries a materially higher risk of undetected regressions.",
    matches: (finding) => finding.category === "testing-gap",
  },
  {
    kind: "refactor-circular-dependencies",
    title: "Refactor Circular Dependencies",
    taskTitle: "Break circular dependency",
    expectedImpact: "Improves buildability, testability, and the ability to reason about or change one module in isolation.",
    rationaleIntro: "Circular dependencies make modules harder to test, build, and reason about in isolation.",
    matches: (finding) => finding.kind === "circular-dependencies",
  },
];

function estimateEffort(taskCount: number): EstimatedEffort {
  if (taskCount <= 1) return "Small";
  if (taskCount <= 3) return "Medium";
  return "Large";
}

function priorityFor(findings: ReadonlyArray<Finding>): Priority {
  let highest: Priority = "Low";
  for (const finding of findings) {
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest]) highest = finding.severity;
  }
  return highest;
}

function buildTask(template: MissionTemplate, finding: Finding): MissionTask {
  return {
    id: makeId(`${template.kind}-task`, finding.id),
    title: template.taskTitle,
    description: finding.summary,
    sourceFindingId: finding.id,
  };
}

function collectSourceFiles(findings: ReadonlyArray<Finding>): string[] {
  return [...new Set(findings.flatMap((finding) => finding.sourceFiles))].sort();
}

function buildMission(template: MissionTemplate, findings: ReadonlyArray<Finding>): Mission {
  const tasks = findings.map((finding) => buildTask(template, finding));
  return {
    id: makeId("mission", template.kind),
    kind: template.kind,
    title: template.title,
    description: `${findings.length} finding(s) from Engineering Reasoning map to this mission.`,
    priority: priorityFor(findings),
    rationale: `${template.rationaleIntro} Derived from: ${findings.map((f) => f.id).join(", ")}.`,
    estimatedEffort: estimateEffort(tasks.length),
    expectedImpact: template.expectedImpact,
    tasks,
    sourceFindingIds: findings.map((f) => f.id),
    sourceFiles: collectSourceFiles(findings),
  };
}

export function planMissions(findings: ReadonlyArray<Finding>): Mission[] {
  const missions: Mission[] = [];
  for (const template of TEMPLATES) {
    const matching = findings.filter((finding) => template.matches(finding));
    if (matching.length === 0) continue;
    missions.push(buildMission(template, matching));
  }
  return missions;
}
