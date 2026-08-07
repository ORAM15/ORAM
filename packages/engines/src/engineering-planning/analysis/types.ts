/**
 * EngineeringPlan — Capability Sprint 2 (Engineering Planning).
 *
 * Engineering Reasoning (../../engineering-reasoning/) answers "what's wrong?" -- Engineering Planning maps
 * those Findings (never EngineeringKnowledge or RepositoryAnalysis directly, and never a new filesystem read)
 * into Missions: concrete, prioritized units of engineering work. Deterministic, no LLM. Every Mission and
 * MissionTask traces back to the specific Findings it was derived from via `sourceFindingIds`/`sourceFindingId`
 * -- the same identity-preservation discipline established for RepositoryAnalysis, EngineeringKnowledge, and
 * EngineeringReasoning (see repository-analyzer/analysis/identity.ts).
 *
 * MVP SCOPE: exactly 3 mapping rules (see ./rules.ts). A Finding whose kind/category matches none of them
 * simply produces no Mission -- not every Finding needs to become work yet, and no Mission is fabricated
 * to cover a Finding this MVP doesn't yet know how to plan for. No scheduling, no dependency ordering between
 * Missions, no execution -- that is explicitly out of scope (a later Execution phase's job, per the roadmap).
 */

export type Priority = "High" | "Medium" | "Low";

export type EstimatedEffort = "Small" | "Medium" | "Large";

export interface MissionTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** id of the Finding (see engineering-reasoning/analysis/types.ts) this task was derived from. */
  readonly sourceFindingId: string;
}

export interface Mission {
  readonly id: string;
  /** Which mapping rule produced this Mission (e.g. "improve-subsystem-documentation") -- stable across runs. */
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly rationale: string;
  readonly estimatedEffort: EstimatedEffort;
  readonly expectedImpact: string;
  readonly tasks: ReadonlyArray<MissionTask>;
  /** ids of every Finding this Mission was derived from -- the union of its tasks' sourceFindingId values. */
  readonly sourceFindingIds: ReadonlyArray<string>;
}

export interface EngineeringPlan {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly missions: ReadonlyArray<Mission>;
  readonly timestamp: string;
}
