/**
 * MemoryAdapter implementations -- ImplementationExecutor's default. Every method is a deterministic,
 * in-memory simulation: it never touches git, never reads or writes a file, never spawns a shell command.
 * Every call unconditionally reports SUCCESS with a message that says plainly that nothing real happened.
 * This is what makes `oram execute` (and every test in this package) safe to run against a real repository
 * with zero side effects.
 */

import type { ExecutionStep } from "../../execution-planning/analysis/types";
import type { AdapterResult, CommandAdapter, FileAdapter, GitAdapter } from "./types";

function simulated(actionLabel: string, step: ExecutionStep): AdapterResult {
  return {
    outcome: "SUCCESS",
    message: `Simulated ${actionLabel} for step "${step.description}" -- no git, filesystem, or shell command was actually run.`,
  };
}

export class MemoryGitAdapter implements GitAdapter {
  createBranch(step: ExecutionStep): AdapterResult {
    return simulated("branch creation", step);
  }
  commit(step: ExecutionStep): AdapterResult {
    return simulated("commit", step);
  }
  openPullRequest(step: ExecutionStep): AdapterResult {
    return simulated("pull request creation", step);
  }
}

export class MemoryFileAdapter implements FileAdapter {
  createFile(step: ExecutionStep): AdapterResult {
    return simulated("file creation", step);
  }
  modifyFile(step: ExecutionStep): AdapterResult {
    return simulated("file modification", step);
  }
  deleteFile(step: ExecutionStep): AdapterResult {
    return simulated("file deletion", step);
  }
}

export class MemoryCommandAdapter implements CommandAdapter {
  runTests(step: ExecutionStep): AdapterResult {
    return simulated("test run", step);
  }
  runLinter(step: ExecutionStep): AdapterResult {
    return simulated("lint run", step);
  }
  runFormatter(step: ExecutionStep): AdapterResult {
    return simulated("format run", step);
  }
}
