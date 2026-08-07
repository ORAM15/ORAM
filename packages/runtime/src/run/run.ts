/**
 * Run — a lightweight, in-memory envelope for one Engineering Cycle's execution state.
 *
 * Distinct from Lifecycle (../Lifecycle.ts): Lifecycle owns the full CREATED -> ... -> COMPLETE/ABORTED phase
 * graph, with transition-legality checks and a per-phase history. Run does not duplicate any of that -- it
 * carries what Lifecycle has no place for: its immutable execution input (`context`, a RunContext -- see
 * ./run-context.ts -- which repository, which workflow), and a coarse start/finish/fail summary independent
 * of Lifecycle's phase granularity. start()/finish()/fail() are plain field setters with no transition rules
 * of their own; the phase graph's legality is still enforced exclusively by Lifecycle.
 *
 * `artifacts` is a plain in-memory collection of every Artifact<T> EngineRunner.run() has produced so far for
 * this run (see ../artifacts/artifact.ts) -- appended to via addArtifact(), exposed read-only. No persistence,
 * no serialization: this is the same in-process-only value EngineRunner.run() already returned and Runtime
 * previously discarded: Run now simply keeps hold of it for the run's own duration.
 *
 * NO PERSISTENCE. NO REPLAY. NO RESUME -- an in-process record only, same as Lifecycle today.
 */

import type { Artifact } from "../artifacts/artifact";
import type { RunContext } from "./run-context";

export type RunStatus = "PENDING" | "RUNNING" | "FINISHED" | "FAILED";

export class Run {
  readonly id: string;
  readonly context: RunContext;
  startedAt: string | null = null;
  finishedAt: string | null = null;
  status: RunStatus = "PENDING";

  private readonly _artifacts: Artifact<unknown>[] = [];

  constructor(id: string, context: RunContext) {
    this.id = id;
    this.context = context;
  }

  get artifacts(): ReadonlyArray<Artifact<unknown>> {
    return this._artifacts;
  }

  addArtifact(artifact: Artifact<unknown>): void {
    this._artifacts.push(artifact);
  }

  start(): void {
    this.startedAt = new Date().toISOString();
    this.status = "RUNNING";
  }

  finish(): void {
    this.finishedAt = new Date().toISOString();
    this.status = "FINISHED";
  }

  fail(): void {
    this.finishedAt = new Date().toISOString();
    this.status = "FAILED";
  }
}
