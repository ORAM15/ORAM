/**
 * ExecutionPlanSet — Capability Sprint 7 (Execution Planning Engine).
 *
 * Implementation Requests (../../implementation-requests/) answers "what, specifically, needs to change?" --
 * Execution Planning converts that ImplementationRequestSet's requests (never MissionGraph/EngineeringPlan/
 * EngineeringReasoning/EngineeringKnowledge/RepositoryAnalysis directly, and never a new filesystem read)
 * into ExecutionPlans: deterministic, ordered sequences of ExecutionSteps. Steps are templates only -- they
 * describe what an implementer (human or automated) should do, in what order; nothing in this package reads
 * a file, writes a file, spawns a process, or calls @oram/runtime's execution machinery. Deterministic, no
 * AI.
 *
 * MVP SCOPE: exactly one ExecutionPlan per ImplementationRequest ("Exactly ONE ExecutionPlan per
 * ImplementationRequest"). See ./rules.ts's own file-level note for two disclosed limitations: step content
 * is looked up by the request's own `title` text (a small, fully known, fixed set of exact strings today --
 * Sprint 6 did not carry Mission.kind through to ImplementationRequest, so `title` is the closest stable,
 * deterministic key still available), and plan dependencies are a single linear chain over the request set's
 * own existing order (Sprint 6 did not carry MissionGraph's dependencyIds through to ImplementationRequest
 * either, so there is no real dependency signal left to work from -- same honest-default reasoning Sprint 5
 * used for the exact same situation one stage up). No scheduling, no execution -- that is explicitly out of
 * scope ("Execution Planning must NOT modify files. Execution Planning must NOT execute commands.").
 */

import type { Priority } from "../../engineering-missions/analysis/types";

export type { Priority };

export type ExecutionAction =
  | "CREATE_BRANCH"
  | "CREATE_FILE"
  | "MODIFY_FILE"
  | "DELETE_FILE"
  | "RUN_TESTS"
  | "RUN_LINTER"
  | "RUN_FORMATTER"
  | "COMMIT"
  | "OPEN_PULL_REQUEST";

export interface ExecutionStep {
  readonly id: string;
  /** 0-based position of this step within its ExecutionPlan's own `steps` array. */
  readonly order: number;
  readonly action: ExecutionAction;
  readonly description: string;
}

export interface ExecutionDependency {
  readonly id: string;
  /** The ExecutionPlan that has the dependency -- it cannot start until `dependsOnPlanId` completes. */
  readonly planId: string;
  readonly dependsOnPlanId: string;
}

export interface ExecutionPlan {
  readonly id: string;
  /** id of the ImplementationRequest (see implementation-requests/analysis/types.ts) this plan was derived from. */
  readonly requestId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly steps: ReadonlyArray<ExecutionStep>;
  /** ids of ExecutionPlans in this same ExecutionPlanSet that must complete before this one starts (direct dependencies only). */
  readonly dependencyIds: ReadonlyArray<string>;
  /** This ExecutionPlan's 0-based position in a valid topological execution order -- see ExecutionPlanSet.executionOrder. */
  readonly order: number;
}

export interface ExecutionPlanSet {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly plans: ReadonlyArray<ExecutionPlan>;
  readonly dependencies: ReadonlyArray<ExecutionDependency>;
  /** ExecutionPlan ids in a valid topological execution order. Equivalent to `plans.map(p => p.id)` under this MVP's linear-chain dependency rule, but modeled as its own field so a future non-linear dependency rule doesn't change what this field means. */
  readonly executionOrder: ReadonlyArray<string>;
  readonly timestamp: string;
}
