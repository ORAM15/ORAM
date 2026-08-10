/**
 * RunArtifacts — Capability Sprint 17 (Runtime Artifact Handoff). A read-only view of ONE run's artifacts,
 * handed by EngineRunner to the engine it is invoking, so a downstream engine can consume artifacts already
 * produced by earlier stages of the SAME pipeline run instead of recomputing the entire pipeline.
 *
 * This is the prerequisite every engine wrapper since Sprint 9 has disclosed as "CONCRETE LIMITATION #1":
 * `EngineDescriptor.run(context)` received no `runId`, so no engine could address any prior stage's
 * persisted artifact for its own run. RunArtifacts closes exactly that gap and nothing more -- it is a thin,
 * run-scoped binding over the EXISTING ArtifactStore (never a second, competing storage abstraction):
 * `require()`/`has()`/`missing()` all delegate to `store.read()`/`store.exists()` with this run's own runId
 * filled in. Same-run isolation therefore comes for free from ArtifactStore's own addressing (ArtifactRef
 * includes runId): an artifact written under run A can never satisfy a lookup from run B's RunArtifacts,
 * because the two lookups are different keys.
 *
 * Deliberately read-only: engines still never write artifacts or publish events themselves -- persisting the
 * engine's own output remains EngineRunner's job, unchanged (EngineRunner.ts's "Engine only computes"
 * boundary). RuntimeContext itself deliberately does NOT carry this (or runId) -- per RuntimeContext.ts's own
 * long-standing TODO, one RuntimeContext may in principle serve multiple runs in a process, so the run-scoped
 * view travels as EngineRunner.run()'s own per-invocation argument instead.
 */

import type { ArtifactStore } from "./ArtifactStore";

/**
 * Addresses one upstream artifact WITHIN the current run -- ArtifactRef minus the runId (RunArtifacts itself
 * supplies that). This is the shape an engine uses to declare its upstream dependencies explicitly (see e.g.
 * @oram/engines' DECISION_UPSTREAM_ARTIFACTS) -- dependencies stay a visible, inspectable list, never "every
 * engine implicitly depends on every previous stage."
 */
export interface ArtifactDependency {
  readonly stage: string;
  readonly name: string;
}

export class RunArtifacts {
  constructor(
    private readonly store: ArtifactStore,
    /** The run every lookup is scoped to -- filled into each ArtifactRef so callers can never accidentally cross runs. */
    public readonly runId: string
  ) {}

  /** True if `stage`/`name` was persisted for THIS run. */
  async has(stage: string, name: string): Promise<boolean> {
    return this.store.exists({ runId: this.runId, stage, name });
  }

  /**
   * Reads one required upstream artifact for THIS run. Missing artifacts reject with ArtifactStore.read()'s
   * own clear, deterministic error (naming runId, stage, and name) -- never a silent recompute, never a
   * fabricated value. Callers with an optional dependency should check has() first, mirroring the store's
   * own documented convention.
   */
  async require<T = unknown>(stage: string, name: string): Promise<T> {
    return this.store.read<T>({ runId: this.runId, stage, name });
  }

  /** Which of `dependencies` are NOT yet persisted for this run, in the given order. Empty means all are available. */
  async missing(dependencies: ReadonlyArray<ArtifactDependency>): Promise<ArtifactDependency[]> {
    const absent: ArtifactDependency[] = [];
    for (const dependency of dependencies) {
      if (!(await this.has(dependency.stage, dependency.name))) absent.push(dependency);
    }
    return absent;
  }
}
