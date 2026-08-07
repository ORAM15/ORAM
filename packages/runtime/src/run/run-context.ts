/**
 * RunContext — the immutable execution input for one Run: which repository, which workflow. Nothing else.
 *
 * NOT RuntimeContext (../RuntimeContext.ts) -- that remains the DI bag threaded through EngineRunner/Engines
 * (logger, eventBus, artifactStore, providerRegistry, config, repositoryRoot). RunContext is smaller and
 * Run-scoped only; it is not merged with, renamed from, or a replacement for RuntimeContext.
 */
export interface RunContext {
  readonly repositoryRoot: string;
  readonly workflowId: string;
}
