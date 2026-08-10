/**
 * EngineRunner — runs exactly one Engine, owning everything around the call itself: timing, logging,
 * artifact writing, event publishing, and error isolation.
 *
 * "Engine only computes. Runtime calls EngineRunner. EngineRunner calls Engine." (Phase 2 Task 6). This file
 * is the one place that boundary is enforced: an EngineDescriptor's run() receives a RuntimeContext and
 * returns a plain value; it never touches the ArtifactStore, EventBus, or Logger directly. Every side
 * effect around that plain value is this class's responsibility, generalizing what every scripts/*.js
 * engine today does for itself inline (each one calls its own writeOutputs() and its own console.log lines)
 * into one shared, reusable sequence.
 *
 * TODO(engines): EngineDescriptor is a MINIMAL placeholder shape, duplicated here (rather than imported from
 *   @oram/engines) for the same reason Provider is duplicated in ProviderRegistry.ts -- @oram/engines is
 *   still scaffolded as README-only (Phase 3 extracts real engines into it). Once it exists for real, this
 *   contract should move there and this file should import it instead of declaring its own copy.
 * TODO(engines): no retry/timeout policy exists yet at this layer -- today's System A engines are pure
 *   synchronous fs calls with no failure mode to retry; this will matter once a real Engine can fail
 *   transiently (e.g. a future remote-repository-backed Observe phase).
 */

import type { OramEvent } from "@oram/events";
import type { RuntimeContext } from "./RuntimeContext";
import type { ArtifactRef } from "./ArtifactStore";
import { RunArtifacts } from "./RunArtifacts";
import { type Artifact, createArtifact } from "./artifacts/artifact";

/** PRELIMINARY shape -- see the TODO(engines) note above. */
export interface EngineDescriptor<TOutput = unknown> {
  /** Used as ArtifactRef.stage and as the Logger's `stage` scope for every message this run produces. */
  readonly stage: string;
  /** Used as ArtifactRef.name for this engine's one output artifact. */
  readonly artifactName: string;
  /**
   * The engine's own pure computation. Receives RuntimeContext for read-only inputs (config, repositoryRoot)
   * only -- never to write an artifact or publish an event itself; that remains EngineRunner's job.
   *
   * `artifacts` (Capability Sprint 17 -- see RunArtifacts.ts) is a read-only view of THIS run's already
   * persisted artifacts, so a downstream engine can consume upstream output instead of recomputing it.
   * Optional and additive: every pre-Sprint-17 engine ignores it and keeps its exact previous behavior;
   * engines that declare upstream dependencies read them through it. Always supplied by EngineRunner.run();
   * only ever absent when an engine is invoked directly outside the Runtime (e.g. a unit test calling
   * descriptor.run(context) by hand).
   */
  run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<TOutput> | TOutput;
  /** Builds the typed OramEvent (@oram/events) to publish once this engine's output has been persisted. */
  buildEvent(runId: string, output: TOutput, ref: ArtifactRef): OramEvent;
}

export class EngineRunner {
  constructor(private readonly context: RuntimeContext) {}

  /**
   * Runs one engine end to end, always in this order: log start -> invoke -> persist output as an Artifact
   * -> publish the corresponding Event -> log completion. On failure, logs and rethrows -- EngineRunner
   * never decides whether a failure should abort the run; that remains the caller's (Runtime's) decision,
   * generalizing invokeProvider()'s existing isolation guarantee in scripts/implementation-executor.js
   * (a broken component can never silently corrupt state, but its consequence is always decided one layer up).
   *
   * The return value is now Artifact<TOutput> (./artifacts/artifact.ts), not the raw TOutput -- callers that
   * previously used the return value directly (e.g. field access on the engine's own output shape) must now
   * read `.payload`. Everything else in this method is unchanged: `output` (the engine's raw return value) is
   * still exactly what gets persisted via artifactStore.write() and passed into engine.buildEvent() -- the
   * Artifact wrapper is built only for the value handed back to this method's own caller.
   */
  async run<TOutput>(runId: string, engine: EngineDescriptor<TOutput>): Promise<Artifact<TOutput>> {
    const startedAt = Date.now();
    this.context.logger.info(engine.stage, `Starting ${engine.stage}...`);

    let output: TOutput;
    try {
      // Sprint 17: every engine invocation now receives a run-scoped, read-only view of this run's already
      // persisted artifacts (see RunArtifacts.ts) -- the handoff that lets a downstream engine consume
      // upstream output instead of recomputing it. Purely additive: engines that ignore the second argument
      // behave exactly as before.
      output = await engine.run(this.context, new RunArtifacts(this.context.artifactStore, runId));
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      this.context.logger.error(engine.stage, `Failed after ${durationMs}ms: ${message}`);
      throw error;
    }

    const ref: ArtifactRef = { runId, stage: engine.stage, name: engine.artifactName };
    await this.context.artifactStore.write(ref, output);
    this.context.eventBus.publish(engine.buildEvent(runId, output, ref));

    const durationMs = Date.now() - startedAt;
    this.context.logger.info(engine.stage, `Completed ${engine.stage} in ${durationMs}ms.`);

    return createArtifact(runId, engine.artifactName, output);
  }
}
