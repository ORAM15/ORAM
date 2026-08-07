/**
 * ArtifactStore — durable, run-scoped storage for every JSON/Markdown artifact ORAM produces.
 *
 * Generalizes the write side of every scripts/*.js engine's own writeOutputs() (each of which today writes
 * directly into the TARGET repository's working tree, e.g. repository-intelligence/repository-analysis.json,
 * requiring 14 separate .gitignore entries) into one shared abstraction that instead writes under a
 * run-scoped location outside the target repo (docs/ORAM_SPECIFICATION_v1.md Section 8;
 * ORAM_V3_MIGRATION_PLAN.md Section 5.4). This is what makes `oram replay` meaningful even after the target
 * repository's own working tree has since changed.
 *
 * PHASE 2 STATUS: FileSystemArtifactStore is implemented against the local filesystem, using the layout
 *   `<baseDir>/runs/<run-id>/artifacts/<stage>/<name>.json` (oram.config.schema.json's `artifacts.storage:
 *   "repository-local"` mode; RuntimeBuilder.ts wires <baseDir> to `<repositoryRoot>/.oram` by default --
 *   see the "home" vs "repository-local" choice still open there). list()'s "in write order" guarantee
 *   (promised by the interface below) is backed by a small per-run index file (`_index.json`, appended to
 *   on every write()) rather than a directory listing, since a directory listing has no guaranteed order --
 *   see the write-order TODO further down.
 *
 * TODO(runtime): the index-file append in write() is a read-modify-write with no lock -- unsafe under two
 *   concurrent writes to the SAME run (matches this repository's own established, already-accepted gap: no
 *   run in this codebase's history has ever had concurrency protection -- see Runtime.ts's own sync-vs-async
 *   TODO). Acceptable for a single Runtime process driving one run at a time (docs/ORAM_SPECIFICATION_v1.md
 *   Section 11, Non-goals); revisit only if engine invocation is ever parallelized within one run.
 * TODO(runtime): define real artifact typing once @oram/artifacts exists -- `unknown` below is a deliberate
 *   placeholder, not a final type.
 * TODO(runtime): decide read-back envelope: raw JSON, or wrapped with the writing stage's own metadata
 *   (stage name, timestamp, schema version) for forward-compatible replay of older runs (see
 *   docs/ORAM_SPECIFICATION_v1.md Section 8's "schema-versioned" requirement) -- today, read() returns the
 *   engine's raw output exactly as written, with no envelope.
 * TODO(runtime): decide how the Markdown half of an artifact pair (today: always written alongside its JSON
 *   by every engine) is represented here -- a second write() call with a `format: "markdown"` ArtifactRef,
 *   or a derived, on-demand render? Not exercised by Phase 2 (its placeholder engines only ever write JSON).
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";

/** Addresses exactly one Artifact. `name` excludes any file extension -- the store owns that convention. */
export interface ArtifactRef {
  readonly runId: string;
  readonly stage: string;
  readonly name: string; // e.g. "repository-analysis"
}

export interface ArtifactStore {
  /** Persists one artifact. Artifacts are immutable once written (docs/ORAM_SPECIFICATION_v1.md Section 8) -- overwriting an existing ref is expected to be a programmer error, not a supported update path. */
  write(ref: ArtifactRef, data: unknown): Promise<void>;

  /** Reads back a previously written artifact. Rejects if not found -- callers must check existence first when an artifact is optional (mirroring today's readJsonSafe()-style "missing is not an error" pattern used throughout scripts/*.js for optional inputs). */
  read<T = unknown>(ref: ArtifactRef): Promise<T>;

  /** True if an artifact exists at `ref`, without reading it. */
  exists(ref: ArtifactRef): Promise<boolean>;

  /** Lists every artifact stored for a given run, in write order. Powers `oram inspect`/`oram replay`. */
  list(runId: string): Promise<ArtifactRef[]>;
}

/**
 * Reference implementation (Phase 2) targeting the local filesystem -- the default transport for a v1,
 * single-user ORAM install (docs/ORAM_SPECIFICATION_v1.md Section 11, Non-goals: no hosted/multi-tenant
 * ORAM yet). See the TODOs above this class for what remains intentionally undecided.
 */
export class FileSystemArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  private artifactPath(ref: ArtifactRef): string {
    return path.join(this.baseDir, "runs", ref.runId, "artifacts", ref.stage, `${ref.name}.json`);
  }

  private indexPath(runId: string): string {
    return path.join(this.baseDir, "runs", runId, "artifacts", "_index.json");
  }

  async write(ref: ArtifactRef, data: unknown): Promise<void> {
    const filePath = this.artifactPath(ref);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await this.appendToIndex(ref);
  }

  async read<T = unknown>(ref: ArtifactRef): Promise<T> {
    const filePath = this.artifactPath(ref);
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isNotFound(error)) {
        throw new Error(
          `Artifact not found: runId="${ref.runId}" stage="${ref.stage}" name="${ref.name}" (expected at ${filePath}). Callers must check exists() first for optional artifacts.`
        );
      }
      throw error;
    }
  }

  async exists(ref: ArtifactRef): Promise<boolean> {
    try {
      await fsp.access(this.artifactPath(ref));
      return true;
    } catch {
      return false;
    }
  }

  /** Reads back the per-run index file written incrementally by write() -- see the class-level PHASE 2 STATUS note on why this is not a directory listing. */
  async list(runId: string): Promise<ArtifactRef[]> {
    try {
      const raw = await fsp.readFile(this.indexPath(runId), "utf8");
      return JSON.parse(raw) as ArtifactRef[];
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  private async appendToIndex(ref: ArtifactRef): Promise<void> {
    const file = this.indexPath(ref.runId);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    let entries: ArtifactRef[] = [];
    try {
      entries = JSON.parse(await fsp.readFile(file, "utf8")) as ArtifactRef[];
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    entries.push(ref);
    await fsp.writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
