/**
 * MissionGraph — Capability Sprint 5 (Engineering Mission Engine).
 *
 * Engineering Planning (../../engineering-planning/) answers "what work should happen?" -- Engineering
 * Missions organizes that EngineeringPlan's Missions (never EngineeringReasoning/EngineeringKnowledge/
 * RepositoryAnalysis directly, and never a new filesystem read) into a MissionGraph: the same Missions, now
 * with explicit dependencies and a valid execution order. Deterministic, no AI. Every Mission in the graph
 * carries the exact same title/priority/rationale/estimatedEffort/expectedImpact/tasks Engineering Planning
 * already computed -- nothing here recomputes or re-judges a Mission's own content, it only adds graph
 * structure on top.
 *
 * MVP SCOPE: dependencies are a single deterministic rule -- each Mission depends on the one immediately
 * before it in EngineeringPlan's own (already-deterministic) mission order, forming one linear chain. See
 * ./rules.ts's own file-level note for why. No parallel branches, no cycle handling (a linear chain cannot
 * cycle), no scheduling, no execution -- that is explicitly out of scope (a later Execution phase's job, per
 * the roadmap; "Do not implement execution yet").
 */

import type { Priority, EstimatedEffort, MissionTask } from "../../engineering-planning/analysis/types";

export type { Priority, EstimatedEffort, MissionTask };

export interface MissionDependency {
  readonly id: string;
  /** The Mission that has the dependency -- it cannot start until `dependsOnMissionId` completes. */
  readonly missionId: string;
  readonly dependsOnMissionId: string;
}

export interface Mission {
  readonly id: string;
  /** Which Engineering Planning mapping rule produced this Mission (e.g. "improve-subsystem-documentation") -- carried through unchanged from EngineeringPlan. */
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly rationale: string;
  readonly estimatedEffort: EstimatedEffort;
  readonly expectedImpact: string;
  readonly tasks: ReadonlyArray<MissionTask>;
  readonly sourceFindingIds: ReadonlyArray<string>;
  /** ids of Missions in this same MissionGraph that must complete before this one starts (direct dependencies only, not the transitive closure). */
  readonly dependencyIds: ReadonlyArray<string>;
  /** This Mission's 0-based position in a valid topological execution order for the graph -- see MissionGraph.executionOrder. */
  readonly order: number;
}

export interface MissionGraph {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly missions: ReadonlyArray<Mission>;
  readonly dependencies: ReadonlyArray<MissionDependency>;
  /** Mission ids in a valid topological execution order. Equivalent to `missions.map(m => m.id)` under this MVP's linear-chain dependency rule, but modeled as its own field so a future non-linear dependency rule doesn't change what this field means. */
  readonly executionOrder: ReadonlyArray<string>;
  readonly timestamp: string;
}
