/**
 * ImplementationRequestSet — Capability Sprint 6 (Implementation Request Engine).
 *
 * Engineering Missions transforms MissionGraph Missions into execution-ready specifications. Deterministic,
 * no AI. Sprint 21 adds explicit source-file provenance without treating those files as edit targets.
 */

import type { Priority, EstimatedEffort } from "../../engineering-missions/analysis/types";

export type { Priority, EstimatedEffort };

export interface ImplementationTarget {
  readonly id: string;
  /** A path-like subsystem identifier extracted from the Mission's task descriptions. */
  readonly subsystem: string;
  /** Still empty in this MVP: source provenance is preserved separately and is not silently promoted to edit targets. */
  readonly files: ReadonlyArray<string>;
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly description: string;
  /** id of the MissionTask this criterion was derived from. */
  readonly sourceTaskId: string;
}

export interface ImplementationConstraint {
  readonly id: string;
  readonly description: string;
}

export interface ImplementationRequest {
  readonly id: string;
  /** id of the Mission this request was derived from. */
  readonly missionId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly rationale: string;
  readonly goal: string;
  readonly expectedImpact: string;
  readonly estimatedEffort: EstimatedEffort;
  /** Source files carried forward from the Mission's Findings; provenance only, not inferred edit targets. */
  readonly sourceFiles: ReadonlyArray<string>;
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
