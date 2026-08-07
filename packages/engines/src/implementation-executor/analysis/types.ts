/**
 * ExecutionResult — Capability Sprint 8 (Implementation Executor).
 *
 * Execution Planning (../../execution-planning/) answers "what, in what order, should happen?" -- the
 * Implementation Executor (../ImplementationExecutor.ts) actually walks a single ExecutionPlan's steps, one
 * at a time, in order, and reports what happened. Deterministic, no AI, no autonomous decisions: every
 * step's outcome comes from a plain adapter call (../adapters/types.ts), never a judgment call this package
 * makes on its own.
 *
 * IMPORTANT: by default (MemoryAdapter, see ../adapters/MemoryAdapters.ts) this package touches NEITHER git
 * NOR the filesystem NOR any shell command -- every "execution" is a deterministic, in-memory simulation
 * that always reports SUCCESS. RealAdapter (../adapters/RealAdapters.ts) exists as a stub for a future PR
 * wiring actual git/filesystem/shell execution; every one of its methods throws NotImplementedYetError
 * today, on purpose, so it can never be used by accident (it is never the default).
 *
 * No `ExecutionResultSet`/aggregate type is defined here -- unlike every prior stage, this Sprint's own spec
 * asked only for the singular types below plus `ImplementationExecutor.execute(plan)`, one plan in, one
 * result out. Running a whole ExecutionPlanSet is a thin caller-level concern (see ../ImplementationExecutor.ts's
 * `executeAll()`), not a new named artifact type.
 */

import type { ExecutionAction } from "../../execution-planning/analysis/types";

export type { ExecutionAction };

/**
 * PENDING/RUNNING exist for API completeness (a step or plan conceptually passes through them) but never
 * appear in a finished ExecutionResult/ExecutionStepResult -- execute() runs synchronously to completion and
 * only ever returns a terminal status. SKIPPED is a per-step status only (steps after the first failure);
 * it is never an ExecutionResult's own overall `status` (that is always SUCCESS or FAILED).
 */
export type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ExecutionLog {
  readonly id: string;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  /** id of the ExecutionStep this entry relates to, or null for a plan-level entry (e.g. "no steps to run"). */
  readonly stepId: string | null;
}

export interface ExecutionStepResult {
  readonly stepId: string;
  readonly action: ExecutionAction;
  readonly status: ExecutionStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly message: string;
}

/** Describes the FIRST step that failed in a run -- once one step fails, every remaining step is SKIPPED, so there is only ever one ExecutionFailure per ExecutionResult. */
export interface ExecutionFailure {
  readonly stepId: string;
  readonly action: ExecutionAction;
  readonly reason: string;
}

export interface ExecutionResult {
  readonly planId: string;
  readonly status: ExecutionStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: ReadonlyArray<ExecutionStepResult>;
  readonly logs: ReadonlyArray<ExecutionLog>;
  readonly failure: ExecutionFailure | null;
}
