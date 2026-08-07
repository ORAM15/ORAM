/**
 * ImplementationRequestSet — Capability Sprint 6 (Implementation Request Engine).
 *
 * Engineering Missions (../../engineering-missions/) answers "what work, in what order?" -- Implementation
 * Requests transforms that MissionGraph's Missions (never EngineeringPlan/EngineeringReasoning/
 * EngineeringKnowledge/RepositoryAnalysis directly, and never a new filesystem read) into
 * ImplementationRequests: execution-READY specifications, not execution itself. Deterministic, no AI. Every
 * request carries the exact same id/title/priority/rationale/expectedImpact/estimatedEffort its source
 * Mission already had -- nothing here recomputes or re-judges a Mission's own content, it only adds
 * implementation-facing structure (targets, acceptance criteria, constraints) on top.
 *
 * MVP SCOPE: exactly one ImplementationRequest per Mission ("Each Mission becomes exactly one
 * ImplementationRequest"). See ./rules.ts's own file-level note for two disclosed limitations: target
 * subsystems are extracted via a text heuristic over each MissionTask's own description (not a structural
 * join -- MissionGraph carries no subsystem-id references), and target files are always empty (MissionGraph
 * carries no file-level provenance at all). No scheduling, no execution -- that is explicitly out of scope
 * ("Do not implement execution yet"; this stage only prepares execution-ready requests).
 */

import type { Priority, EstimatedEffort } from "../../engineering-missions/analysis/types";

export type { Priority, EstimatedEffort };

export interface ImplementationTarget {
  readonly id: string;
  /** A path-like subsystem identifier (e.g. "packages/api"), extracted from the Mission's own task descriptions -- see ./rules.ts's CONCRETE LIMITATION note. */
  readonly subsystem: string;
  /** Always empty in this MVP -- MissionGraph carries no file-level provenance to derive this from. Modeled as its own field so a future stage that DOES have file-level data doesn't need a shape change. */
  readonly files: ReadonlyArray<string>;
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly description: string;
  /** id of the MissionTask (see engineering-missions/analysis/types.ts) this criterion was derived from. */
  readonly sourceTaskId: string;
}

export interface ImplementationConstraint {
  readonly id: string;
  readonly description: string;
}

export interface ImplementationRequest {
  readonly id: string;
  /** id of the Mission (see engineering-missions/analysis/types.ts) this request was derived from. */
  readonly missionId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly rationale: string;
  /** A single synthesized goal statement -- Mission.title + Mission.expectedImpact, concatenated verbatim, never fabricated new text. */
  readonly goal: string;
  readonly expectedImpact: string;
  readonly estimatedEffort: EstimatedEffort;
  readonly implementationTargets: ReadonlyArray<ImplementationTarget>;
  readonly acceptanceCriteria: ReadonlyArray<AcceptanceCriterion>;
  readonly constraints: ReadonlyArray<ImplementationConstraint>;
}

export interface ImplementationRequestSet {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly requests: ReadonlyArray<ImplementationRequest>;
  readonly timestamp: string;
}
