/**
 * @oram/runtime public entry point. Re-exports every type/class from this package's five modules -- see
 * docs/ORAM_SPECIFICATION_v1.md Section 5 and this package's own README.md for the responsibility this
 * package as a whole owns. Consumers should always import from "@oram/runtime", never reach into individual
 * files directly, so this barrel remains the one place the package's public surface is defined.
 */

export type { Runtime, RuntimeDependencies, RuntimeOptions, RunHandle, PhaseEngineOverrides, PipelineEngines, PipelineRunResult, PipelineRunStatus } from "./Runtime";
export { OramRuntime } from "./Runtime";

export type { Lifecycle, LifecyclePhase, LifecyclePhaseRecord, LifecycleState } from "./Lifecycle";
export { LIFECYCLE_PHASES, LIFECYCLE_TRANSITIONS, RunLifecycle } from "./Lifecycle";

export type { EventBus, EventHandler, Unsubscribe } from "./EventBus";
export { InMemoryEventBus } from "./EventBus";

export type { ArtifactStore, ArtifactRef } from "./ArtifactStore";
export { FileSystemArtifactStore } from "./ArtifactStore";

export type { ProviderRegistry, Provider, ProviderResult, ProviderCapabilities } from "./ProviderRegistry";
export { InMemoryProviderRegistry } from "./ProviderRegistry";

export type { Logger, LogLevel, LogEntry } from "./Logger";
export { BufferedLogger } from "./Logger";

export type { RuntimeContext, CreateRuntimeContextParams } from "./RuntimeContext";
export { createRuntimeContext } from "./RuntimeContext";

export type { EngineDescriptor } from "./EngineRunner";
export { EngineRunner } from "./EngineRunner";

export type { ArtifactDependency } from "./RunArtifacts";
export { RunArtifacts } from "./RunArtifacts";

export type { Artifact } from "./artifacts/artifact";

export type { RuntimeBuilderOptions } from "./RuntimeBuilder";
export { RuntimeBuilder } from "./RuntimeBuilder";
