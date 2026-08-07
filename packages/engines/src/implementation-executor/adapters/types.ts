/**
 * Adapter contracts -- ImplementationExecutor never touches git, the filesystem, or a shell command
 * directly. It always goes through one of these three adapter interfaces, letting the actual implementation
 * (MemoryAdapter today, RealAdapter as a future stub -- see ./MemoryAdapters.ts / ./RealAdapters.ts) be
 * swapped without ImplementationExecutor's own dispatch logic changing at all.
 *
 * The 9 ExecutionAction kinds (see execution-planning/analysis/types.ts) split cleanly into 3 adapter
 * categories: GitAdapter (CREATE_BRANCH, COMMIT, OPEN_PULL_REQUEST), FileAdapter (CREATE_FILE, MODIFY_FILE,
 * DELETE_FILE), CommandAdapter (RUN_TESTS, RUN_LINTER, RUN_FORMATTER).
 */

import type { ExecutionStep } from "../../execution-planning/analysis/types";

export type AdapterOutcome = "SUCCESS" | "FAILED" | "SKIPPED";

export interface AdapterResult {
  readonly outcome: AdapterOutcome;
  readonly message: string;
}

export interface GitAdapter {
  createBranch(step: ExecutionStep): AdapterResult;
  commit(step: ExecutionStep): AdapterResult;
  openPullRequest(step: ExecutionStep): AdapterResult;
}

export interface FileAdapter {
  createFile(step: ExecutionStep): AdapterResult;
  modifyFile(step: ExecutionStep): AdapterResult;
  deleteFile(step: ExecutionStep): AdapterResult;
}

export interface CommandAdapter {
  runTests(step: ExecutionStep): AdapterResult;
  runLinter(step: ExecutionStep): AdapterResult;
  runFormatter(step: ExecutionStep): AdapterResult;
}

export interface ExecutorAdapters {
  readonly git: GitAdapter;
  readonly file: FileAdapter;
  readonly command: CommandAdapter;
}
