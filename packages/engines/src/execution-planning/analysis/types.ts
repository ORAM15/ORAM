/**
 * ExecutionPlanSet — Capability Sprint 7 (Execution Planning).
 *
 * Implementation Requests are converted into deterministic, ordered ExecutionPlans. Sprint 21 preserves the
 * request's source-file provenance through this boundary; it remains evidence/context, not an inferred edit set.
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
  readonly order: number;
  readonly action: ExecutionAction;
  readonly description: string;
}

export interface ExecutionDependency {
  readonly id: string;
  readonly planId: string;
  readonly dependsOnPlanId: string;
}

export interface ExecutionPlan {
  readonly id: string;
  /** id of the ImplementationRequest this plan was derived from. */
  readonly requestId: string;
  readonly title: string;
  readonly priority: Priority;
  /** Repository files that supplied evidence for the originating request; not an inferred edit target list. */
  readonly sourceFiles: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<ExecutionStep>;
  readonly dependencyIds: ReadonlyArray<string>;
  readonly order: number;
}

export interface ExecutionPlanSet {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly plans: ReadonlyArray<ExecutionPlan>;
  readonly dependencies: ReadonlyArray<ExecutionDependency>;
  readonly executionOrder: ReadonlyArray<string>;
  readonly timestamp: string;
}
