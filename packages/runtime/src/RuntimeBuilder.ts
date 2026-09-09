/**
 * RuntimeBuilder — the Composition Root for the ORAM Runtime.
 *
 * The one place every default Core Runtime dependency (EventBus, ArtifactStore, Logger, ProviderRegistry)
 * is chosen and wired together into a usable Runtime. @oram/cli's commands are expected to depend on this
 * builder, never to construct an OramRuntime and its dependencies by hand -- that keeps "which concrete
 * implementation backs which interface" a single, overridable decision instead of one repeated at every
 * call site.
 *
 * Fluent `with*()` overrides exist for testing (e.g. `oram inspect`'s own tests can swap in an in-memory
 * ArtifactStore) and for a future hosted ORAM (Section 11 of docs/ORAM_SPECIFICATION_v1.md's Non-goals --
 * this builder is exactly the seam a durable EventBus/ArtifactStore would be substituted through, without
 * OramRuntime itself ever needing to change).
 *
 * TODO(runtime): once oram.config.schema.json has a generated type, RuntimeBuilderOptions.config should be
 *   used to decide the ArtifactStore's `storage` mode ("home" vs "repository-local" -- see
 *   oram.config.schema.json's own `artifacts.storage` field) instead of always defaulting to
 *   repository-local (`<repositoryRoot>/.oram`) as this Phase 2 implementation does.
 * TODO(runtime): once @oram/plugins exists, this is the place Provider/Engine/Gate plugins would be
 *   registered into the ProviderRegistry (and future EngineRegistry/GateRegistry) before build() returns.
 */

import * as path from "node:path";
import { InMemoryEventBus, type EventBus } from "./EventBus";
import { FileSystemArtifactStore, type ArtifactStore } from "./ArtifactStore";
import { BufferedLogger, type Logger } from "./Logger";
import { InMemoryProviderRegistry, type ProviderRegistry } from "./ProviderRegistry";
import { DeterministicMemoryProvider } from "./DeterministicMemoryProvider";
import { OramRuntime, type Runtime, type PhaseEngineOverrides } from "./Runtime";
import type { EngineDescriptor } from "./EngineRunner";

export interface RuntimeBuilderOptions {
  /** Used only to compute default dependency locations (today: the default ArtifactStore's baseDir). This is NOT the same value as Runtime.start()'s own RuntimeOptions.repositoryPath, which remains the sole per-run authority -- see the open TODO on that decoupling below. */
  readonly repositoryRoot: string;
  readonly config?: unknown;
  /** Overrides the default `<repositoryRoot>/.oram` artifact storage location. */
  readonly artifactsBaseDir?: string;
}

/**
 * TODO(runtime): RuntimeBuilderOptions.repositoryRoot and Runtime.start()'s RuntimeOptions.repositoryPath
 *   are architecturally decoupled today -- the former only seeds defaults at composition time, the latter is
 *   authoritative at run time. In ordinary CLI usage both will hold the same value, but nothing enforces
 *   that. A future pass should decide whether to unify them or keep the decoupling (useful if one Runtime
 *   instance is ever asked to build a default ArtifactStore before it knows which repository a given `start()`
 *   call will target).
 */
export class RuntimeBuilder {
  private eventBusOverride: EventBus | null = null;
  private loggerOverride: Logger | null = null;
  private artifactStoreOverride: ArtifactStore | null = null;
  private providerRegistryOverride: ProviderRegistry | null = null;
  private engineOverrides: PhaseEngineOverrides = {};

  withEventBus(eventBus: EventBus): this {
    this.eventBusOverride = eventBus;
    return this;
  }

  withLogger(logger: Logger): this {
    this.loggerOverride = logger;
    return this;
  }

  withArtifactStore(artifactStore: ArtifactStore): this {
    this.artifactStoreOverride = artifactStore;
    return this;
  }

  withProviderRegistry(providerRegistry: ProviderRegistry): this {
    this.providerRegistryOverride = providerRegistry;
    return this;
  }

  /**
   * Substitutes a real EngineDescriptor for the Observe phase's placeholder (Phase 3's seam -- see
   * Runtime.ts's PhaseEngineOverrides and its module-level PHASE 3 STATUS note for why this exists as
   * dependency injection rather than a hard import). Callers wire in @oram/engines'
   * createLegacyRepositoryAnalyzerAdapter() (or any future real Observe engine) through this method --
   * RuntimeBuilder itself still never imports @oram/engines, preserving the System Layers dependency
   * direction (docs/ORAM_SPECIFICATION_v1.md Section 3).
   */
  withObserveEngine(engine: EngineDescriptor<unknown>): this {
    this.engineOverrides = { ...this.engineOverrides, observe: engine };
    return this;
  }

  /** Composes every dependency (an override if one was supplied via with*(), otherwise the v1 default) and returns a ready-to-use Runtime. */
  build(options: RuntimeBuilderOptions): Runtime {
    const eventBus = this.eventBusOverride ?? new InMemoryEventBus();
    const logger = this.loggerOverride ?? new BufferedLogger();
    const artifactStore =
      this.artifactStoreOverride ?? new FileSystemArtifactStore(options.artifactsBaseDir ?? path.join(options.repositoryRoot, ".oram"));
    const providerRegistry = this.providerRegistryOverride ?? new InMemoryProviderRegistry();
    if (!this.providerRegistryOverride) {
      providerRegistry.register(new DeterministicMemoryProvider());
    }

    return new OramRuntime({ eventBus, artifactStore, providerRegistry, logger }, this.engineOverrides);
  }

  /** Convenience for the common case: every default, no overrides. Equivalent to `new RuntimeBuilder().build(options)`. */
  static createDefault(options: RuntimeBuilderOptions): Runtime {
    return new RuntimeBuilder().build(options);
  }
}
