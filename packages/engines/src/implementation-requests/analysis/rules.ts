/**
 * The per-Mission -> ImplementationRequest transformation (Implementation Request Engine MVP). Pure string/
 * data operations over an already-computed MissionGraph -- no filesystem, no Repository Analysis, no AI.
 *
 * Sprint 21 provenance addition: Mission.sourceFiles is copied into ImplementationRequest.sourceFiles.
 * These are source/evidence files, not edit targets. `implementationTargets[].files` remains [] until ORAM
 * has a deterministic, justified mechanism for identifying actual edit targets.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { Mission, MissionTask } from "../../engineering-missions/analysis/types";
import type { AcceptanceCriterion, ImplementationConstraint, ImplementationRequest, ImplementationTarget } from "./types";

const PATH_PATTERN = /\b[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+\b/g;

function extractSubsystemPaths(tasks: ReadonlyArray<MissionTask>): string[] {
  const found = new Set<string>();
  for (const task of tasks) {
    for (const match of task.description.match(PATH_PATTERN) ?? []) found.add(match);
  }
  return Array.from(found).sort();
}

function buildImplementationTargets(missionId: string, tasks: ReadonlyArray<MissionTask>): ImplementationTarget[] {
  return extractSubsystemPaths(tasks).map((subsystem) => ({
    id: makeId("implementation-target", `${missionId}:${subsystem}`),
    subsystem,
    files: [],
  }));
}

function buildAcceptanceCriteria(tasks: ReadonlyArray<MissionTask>): AcceptanceCriterion[] {
  return tasks.map((task) => ({
    id: makeId("acceptance-criterion", task.id),
    description: `Resolved: ${task.description}`,
    sourceTaskId: task.id,
  }));
}

const UNIVERSAL_CONSTRAINT = "No AI/LLM-generated code -- implementation must be deterministic and human-reviewable.";

const KIND_CONSTRAINTS: Readonly<Record<string, string>> = {
  "improve-subsystem-documentation": "Documentation only -- must not change any code behavior.",
  "increase-test-coverage": "Tests only -- must not change existing production code behavior.",
  "refactor-circular-dependencies": "Must preserve existing public APIs and observable behavior.",
};
const DEFAULT_KIND_CONSTRAINT = "Must not change behavior outside the scope described in this Mission's rationale.";

function buildConstraints(missionKind: string): ImplementationConstraint[] {
  const kindDescription = KIND_CONSTRAINTS[missionKind] ?? DEFAULT_KIND_CONSTRAINT;
  return [
    { id: makeId("constraint", `universal:${missionKind}`), description: UNIVERSAL_CONSTRAINT },
    { id: makeId("constraint", `kind:${missionKind}`), description: kindDescription },
  ];
}

export function buildImplementationRequest(mission: Mission): ImplementationRequest {
  return {
    id: makeId("implementation-request", mission.id),
    missionId: mission.id,
    title: mission.title,
    priority: mission.priority,
    rationale: mission.rationale,
    goal: `${mission.title} -- ${mission.expectedImpact}`,
    expectedImpact: mission.expectedImpact,
    estimatedEffort: mission.estimatedEffort,
    sourceFiles: mission.sourceFiles,
    implementationTargets: buildImplementationTargets(mission.id, mission.tasks),
    acceptanceCriteria: buildAcceptanceCriteria(mission.tasks),
    constraints: buildConstraints(mission.kind),
  };
}
