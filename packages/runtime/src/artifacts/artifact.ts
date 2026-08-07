/**
 * Artifact<T> — a thin, uniform metadata envelope EngineRunner puts around every engine's raw output before
 * handing it back to its caller.
 *
 * NOT the same thing as ArtifactStore's own "artifact" (../ArtifactStore.ts): ArtifactStore addresses and
 * persists the RAW payload exactly as it always has -- EngineRunner.run() still calls
 * `artifactStore.write(ref, output)` with the unwrapped value, so the on-disk JSON shape is completely
 * unchanged by this file. Artifact<T> exists only around the in-memory value EngineRunner.run() *returns*;
 * it is a partial, deliberately narrow step toward ArtifactStore.ts's own long-standing "decide read-back
 * envelope" TODO for that one seam, without touching persistence, serialization, or read() itself.
 *
 * Deliberately a plain interface -- no methods, no inheritance, no validation (see this PR's own explicit
 * Do-Not list).
 */
export interface Artifact<T> {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly createdAt: string;
  readonly payload: T;
}

/**
 * Deterministic, timestamp-derived id -- the same convention Runtime.ts's generateRunId() already uses in
 * this package (no shared counter/lock needed for a single Runtime process driving one run at a time).
 * Scoped by runId+type so two artifacts written within the same run in the same millisecond still can't
 * collide.
 */
function generateArtifactId(runId: string, type: string): string {
  return `ARTIFACT-${runId}-${type}-${Date.now()}`;
}

/** Wraps one engine's raw output as an Artifact<T>. `type` is the engine's existing artifactName -- no new vocabulary introduced. */
export function createArtifact<T>(runId: string, type: string, payload: T): Artifact<T> {
  return {
    id: generateArtifactId(runId, type),
    type,
    version: 1,
    createdAt: new Date().toISOString(),
    payload,
  };
}
