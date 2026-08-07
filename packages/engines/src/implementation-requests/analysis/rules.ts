/**
 * The per-Mission -> ImplementationRequest transformation (Implementation Request Engine MVP). Pure string/
 * data operations over an already-computed MissionGraph -- no filesystem, no Repository Analysis, no AI.
 *
 * CONCRETE LIMITATION -- READ BEFORE TRUSTING implementationTargets AS STRUCTURAL DATA
 *
 *   `implementationTargets[].subsystem` is extracted via a plain regex heuristic (PATH_PATTERN below) over
 *   each MissionTask's own `description` text (itself carried through, unchanged, from an Engineering
 *   Reasoning Finding's `summary`). This is NOT a structural join against EngineeringKnowledge's real
 *   subsystem ids -- MissionGraph carries no such reference at all (a Mission only knows `sourceFindingIds`,
 *   opaque Finding ids, never a `subsystem:<path>` id). The heuristic was verified against all 5 Engineering
 *   Reasoning Finding summary templates (see engineering-reasoning/analysis/rules.ts) and produces zero false
 *   positives / correct matches on the real ones today, but it is still a text heuristic: a future Finding
 *   summary phrased differently could be missed, or (much less likely, given the pattern requires a real
 *   `word/word` shape) could false-positive. `implementationTargets[].files` is always `[]` -- MissionGraph
 *   carries no file-level provenance whatsoever to derive it from; a genuine future fix requires threading
 *   Finding.sourceFiles through Planning and Missions, not something this stage can invent from what it's
 *   given. Both are disclosed here rather than silently treated as ground truth.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { Mission, MissionTask } from "../../engineering-missions/analysis/types";
import type { AcceptanceCriterion, ImplementationConstraint, ImplementationRequest, ImplementationTarget } from "./types";

/** Matches path-like tokens (at least one "/", alphanumeric/./-/_ segments) wherever they appear in free text -- see this file's own CONCRETE LIMITATION note. */
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

/** One constraint every request carries, regardless of Mission kind -- this project's own standing rule, echoed here since it applies equally to whatever implements the request. */
const UNIVERSAL_CONSTRAINT = "No AI/LLM-generated code -- implementation must be deterministic and human-reviewable.";

/** Per-Mission-kind guardrails. Unrecognized kinds (e.g. a future Engineering Planning mapping this stage doesn't know about yet) fall back to a generic, still-honest constraint rather than guessing something kind-specific. */
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
    implementationTargets: buildImplementationTargets(mission.id, mission.tasks),
    acceptanceCriteria: buildAcceptanceCriteria(mission.tasks),
    constraints: buildConstraints(mission.kind),
  };
}
