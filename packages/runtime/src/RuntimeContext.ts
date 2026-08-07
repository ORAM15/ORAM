/**
 * RuntimeContext — the one dependency-injection bag threaded through the Runtime, EngineRunner, and (from
 * Phase 3 onward) every real Engine and Provider invocation.
 *
 * Directly satisfies Phase 2 design rule 7: "Everything receives RuntimeContext. No globals. No
 * path.resolve(__dirname, ...)." Every one of today's scripts/*.js engines computes its own `root` at
 * module-load time via `path.resolve(__dirname, "..")` -- a hidden global that is exactly what makes those
 * engines assume they live inside the repository they analyze (see ORAM_V3_MIGRATION_PLAN.md's central
 * Section 3 finding). RuntimeContext.repositoryRoot is this repository's replacement: an explicit value
 * that flows in from Runtime.start()'s own RuntimeOptions.repositoryPath, never a module-scope constant.
 *
 * TODO(runtime): replace `config: unknown` with a generated OramConfig type once oram.config.schema.json
 *   has a corresponding TypeScript type (tracked identically in Runtime.ts's own RuntimeOptions.config TODO).
 * TODO(runtime): once @oram/artifacts exists, consider whether RuntimeContext should also carry a
 *   `runId` (today, only EngineRunner.run() receives it as a parameter) -- kept off this shape for now so a
 *   single RuntimeContext can, in principle, be reused across more than one run within a process.
 */

import type { Logger } from "./Logger";
import type { EventBus } from "./EventBus";
import type { ArtifactStore } from "./ArtifactStore";
import type { ProviderRegistry } from "./ProviderRegistry";

export interface RuntimeContext {
  /** Absolute path to the repository ORAM is operating on. The single source of truth every Engine/Provider must use instead of assuming its own install location. */
  readonly repositoryRoot: string;
  /** Parsed oram.config.json for this repository. See TODO above. */
  readonly config: unknown;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly artifactStore: ArtifactStore;
  readonly providerRegistry: ProviderRegistry;
}

export interface CreateRuntimeContextParams {
  readonly repositoryRoot: string;
  readonly config?: unknown;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly artifactStore: ArtifactStore;
  readonly providerRegistry: ProviderRegistry;
}

/**
 * Pure factory -- the only place a RuntimeContext is constructed, so every field's default (today: only
 * `config`) lives in exactly one location rather than being re-decided at every call site.
 */
export function createRuntimeContext(params: CreateRuntimeContextParams): RuntimeContext {
  return {
    repositoryRoot: params.repositoryRoot,
    config: params.config ?? {},
    logger: params.logger,
    eventBus: params.eventBus,
    artifactStore: params.artifactStore,
    providerRegistry: params.providerRegistry,
  };
}
