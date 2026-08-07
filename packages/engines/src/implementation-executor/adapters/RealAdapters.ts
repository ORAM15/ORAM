/**
 * RealAdapter implementations -- a deliberate stub for a future PR that wires actual git/filesystem/shell
 * execution. Every method throws NotImplementedYetError, unconditionally, so RealAdapter can never silently
 * do something real by accident: it must be explicitly constructed and explicitly passed to
 * `new ImplementationExecutor({ git, file, command })`, and even then it throws immediately.
 * ImplementationExecutor's default is MemoryAdapter (../MemoryAdapters.ts), never this.
 */

import type { ExecutionStep } from "../../execution-planning/analysis/types";
import type { AdapterResult, CommandAdapter, FileAdapter, GitAdapter } from "./types";

export class NotImplementedYetError extends Error {
  constructor(methodName: string) {
    super(
      `${methodName} is not implemented yet -- RealAdapter is a stub for a future PR that wires actual ` +
        "git/filesystem/shell execution. Use MemoryAdapter (ImplementationExecutor's default) for deterministic, non-executing runs."
    );
    this.name = "NotImplementedYetError";
  }
}

function notImplemented(methodName: string): never {
  throw new NotImplementedYetError(methodName);
}

export class RealGitAdapter implements GitAdapter {
  createBranch(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealGitAdapter.createBranch");
  }
  commit(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealGitAdapter.commit");
  }
  openPullRequest(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealGitAdapter.openPullRequest");
  }
}

export class RealFileAdapter implements FileAdapter {
  createFile(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealFileAdapter.createFile");
  }
  modifyFile(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealFileAdapter.modifyFile");
  }
  deleteFile(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealFileAdapter.deleteFile");
  }
}

export class RealCommandAdapter implements CommandAdapter {
  runTests(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealCommandAdapter.runTests");
  }
  runLinter(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealCommandAdapter.runLinter");
  }
  runFormatter(_step: ExecutionStep): AdapterResult {
    return notImplemented("RealCommandAdapter.runFormatter");
  }
}
