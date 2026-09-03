/**
 * RuntimeBuilder — the Composition Root for the ORAM Runtime.
 *
 * The one place every default Core Runtime dependency (EventBus, ArtifactStore, Logger, ProviderRegistry)
 * is chosen and wired together into a usable Runtime. @oram/cli's commands are expected to depend on this
 * builder, never to construct an OramRuntime and its dependencies by hand -- that keeps "which concrete
 * implementation backs which interface" a single, overridable decision instead of one repeated at every
 * call site.
 *
 * Fluent `with*()` overrides exist for testing and future hosted ORAM deployments. Provider selection is
 * resolved here at the composition boundary, while the selected Provider remains behind the registry
 * contract. RuntimeBuilder never imports a concrete external AI provider.
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
import { DEFAULT_PROVIDER_ID, type ProviderSelectionConfig, selectProvider } from "./ProviderSelection";
import { OramRuntime, type Runtime, type PhaseEngineOverrides } from "./Runtime";
import type { EngineDescriptor } from "./EngineRunner";

export interface RuntimeBuilderOptions {
  /** Used only to compute default dependency locations (today: the default ArtifactStore's baseDir). */
  readonly repositoryRoot: string;
  readonly config?: unknown;
  /** Overrides the default `<repositoryRoot>/.oram` artifact storage location. */
  readonly artifactsBaseDir?: string;
  /** Selects a provider already registered in the Runtime ProviderRegistry. Defaults to deterministic `memory`. */
  readonly providerSelection?: ProviderSelectionConfig;
}

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
   * Substitutes a real EngineDescriptor for the Observe phase's placeholder. RuntimeBuilder itself still
   * never imports @oram/engines, preserving the System Layers dependency direction.
   */
  withObserveEngine(engine: EngineDescriptor<unknown>): this {
    this.engineOverrides = { ...this.engineOverrides, observe: engine };
    return this;
  }

  /**
   * Composes every dependency and validates the configured provider selection before returning a Runtime.
   * The default registry receives only the deterministic `memory` provider; caller-supplied registries remain
   * authoritative and are never mutated by the builder.
   */
  build(options: RuntimeBuilderOptions): Runtime {
    const eventBus = this.eventBusOverride ?? new InMemoryEventBus();
    const logger = this.loggerOverride ?? new BufferedLogger();
    const artifactStore =
      this.artifactStoreOverride ?? new FileSystemArtifactStore(options.artifactsBaseDir ?? path.join(options.repositoryRoot, ".oram"));
    const providerRegistry = this.providerRegistryOverride ?? new InMemoryProviderRegistry();
    if (!this.providerRegistryOverride) {
      providerRegistry.register(new DeterministicMemoryProvider());
    }

    // Resolve at composition time so an invalid/unknown provider fails before a Runtime is handed to callers.
    // The selected provider remains owned by the registry; this step intentionally performs no execution.
    selectProvider(providerRegistry, options.providerSelection ?? { providerId: DEFAULT_PROVIDER_ID });

    return new OramRuntime({ eventBus, artifactStore, providerRegistry, logger }, this.engineOverrides);
  }

  /** Convenience for the common case: every default, no overrides. Equivalent to `new RuntimeBuilder().build(options)`. */
  static createDefault(options: RuntimeBuilderOptions): Runtime {
    return new RuntimeBuilder().build(options);
  }
}
