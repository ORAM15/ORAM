/**
 * ImplementationExecutor -- walks a single ExecutionPlan's steps, in order, dispatching each to the
 * appropriate adapter (GitAdapter/FileAdapter/CommandAdapter -- see ./adapters/types.ts) and recording what
 * happened. No AI, no autonomous decisions: the only "decision" this class makes is "stop and skip the rest
 * once something fails," a fixed, deterministic rule, not a judgment call.
 *
 * Defaults to MemoryAdapter (./adapters/MemoryAdapters.ts) -- deterministic, in-memory, zero side effects.
 * A caller can inject RealAdapter (./adapters/RealAdapters.ts) instead, but every RealAdapter method throws
 * NotImplementedYetError today, on purpose (see that file's own header comment).
 */

import { makeId } from "../repository-analyzer/analysis/identity";
import type { ExecutionPlan, ExecutionPlanSet, ExecutionStep } from "../execution-planning/analysis/types";
import type { AdapterResult, ExecutorAdapters } from "./adapters/types";
import { MemoryCommandAdapter, MemoryFileAdapter, MemoryGitAdapter } from "./adapters/MemoryAdapters";
import type { ExecutionAction, ExecutionFailure, ExecutionLog, ExecutionResult, ExecutionStepResult, LogLevel } from "./analysis/types";

const DEFAULT_ADAPTERS: ExecutorAdapters = {
  git: new MemoryGitAdapter(),
  file: new MemoryFileAdapter(),
  command: new MemoryCommandAdapter(),
};

type ActionHandler = (step: ExecutionStep) => AdapterResult;

export class ImplementationExecutor {
  private readonly handlers: Readonly<Record<ExecutionAction, ActionHandler>>;

  constructor(private readonly adapters: ExecutorAdapters = DEFAULT_ADAPTERS) {
    this.handlers = {
      CREATE_BRANCH: (step) => this.adapters.git.createBranch(step),
      COMMIT: (step) => this.adapters.git.commit(step),
      OPEN_PULL_REQUEST: (step) => this.adapters.git.openPullRequest(step),
      CREATE_FILE: (step) => this.adapters.file.createFile(step),
      MODIFY_FILE: (step) => this.adapters.file.modifyFile(step),
      DELETE_FILE: (step) => this.adapters.file.deleteFile(step),
      RUN_TESTS: (step) => this.adapters.command.runTests(step),
      RUN_LINTER: (step) => this.adapters.command.runLinter(step),
      RUN_FORMATTER: (step) => this.adapters.command.runFormatter(step),
    };
  }

  public execute(plan: ExecutionPlan): ExecutionResult {
    const startedAt = new Date().toISOString();
    const logs: ExecutionLog[] = [];
    const steps: ExecutionStepResult[] = [];
    let failure: ExecutionFailure | null = null;

    if (plan.steps.length === 0) {
      logs.push(this.log(plan.id, logs.length, "INFO", "No execution steps to run.", null));
    }

    for (const step of plan.steps) {
      if (failure) {
        const skippedAt = new Date().toISOString();
        const message = `Skipped because step "${failure.stepId}" (${failure.action}) failed.`;
        steps.push({ stepId: step.id, action: step.action, status: "SKIPPED", startedAt: skippedAt, finishedAt: skippedAt, message });
        logs.push(this.log(plan.id, logs.length, "WARN", message, step.id));
        continue;
      }

      const stepStartedAt = new Date().toISOString();
      const result = this.runStep(step);
      const stepFinishedAt = new Date().toISOString();

      steps.push({
        stepId: step.id,
        action: step.action,
        status: result.outcome,
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        message: result.message,
      });
      logs.push(this.log(plan.id, logs.length, result.outcome === "FAILED" ? "ERROR" : "INFO", result.message, step.id));

      if (result.outcome === "FAILED") {
        failure = { stepId: step.id, action: step.action, reason: result.message };
      }
    }

    const finishedAt = new Date().toISOString();
    return {
      planId: plan.id,
      status: failure ? "FAILED" : "SUCCESS",
      startedAt,
      finishedAt,
      steps,
      logs,
      failure,
    };
  }

  private runStep(step: ExecutionStep): AdapterResult {
    try {
      return this.handlers[step.action](step);
    } catch (error) {
      return { outcome: "FAILED", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private log(planId: string, index: number, level: LogLevel, message: string, stepId: string | null): ExecutionLog {
    return {
      id: makeId("execution-log", `${planId}:${index}`),
      timestamp: new Date().toISOString(),
      level,
      message,
      stepId,
    };
  }
}

/** Runs every ExecutionPlan in a set, in order, through one ImplementationExecutor -- a thin convenience wrapper, not a new artifact type (see ./analysis/types.ts's own header comment on why there is no ExecutionResultSet). */
export function executeAll(planSet: ExecutionPlanSet, executor: ImplementationExecutor = new ImplementationExecutor()): ExecutionResult[] {
  return planSet.plans.map((plan) => executor.execute(plan));
}
