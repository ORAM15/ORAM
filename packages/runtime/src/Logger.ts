/**
 * Logger — the one place structured, per-run diagnostic output is produced.
 *
 * Generalizes today's ad hoc console.log/console.error calls scattered across every scripts/*.js engine
 * (each engine currently prints its own "Wrote <path>" lines directly, and the orchestrator's own
 * printProgress() formats stage progress independently) into one structured stream that carries a stage id
 * and severity, consumable identically by the CLI's live terminal output and the dashboard's Logs panel
 * (docs/ORAM_SPECIFICATION_v1.md Section 5.5; ORAM_V3_MIGRATION_PLAN.md Section 8).
 *
 * TODO(runtime): decide log persistence -- the spec implies logs are queryable per-run via
 *   `oram inspect`/`oram replay`, which likely means Logger should write through ArtifactStore rather than
 *   only buffering in memory as this placeholder does. Left undecided here on purpose.
 * TODO(runtime): decide correlation id strategy once concurrent runs are supported (see
 *   docs/ORAM_SPECIFICATION_v1.md Section 11, Non-goals -- not a v1 concern, but this interface should not
 *   preclude it later).
 * TODO(runtime): decide whether Logger entries are also published as Events (via EventBus) or remain a
 *   parallel channel -- leaning parallel, since not every log line is meaningful enough to be a Timeline
 *   event.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  /** null for runtime-level messages that are not scoped to any single Lifecycle phase/engine. */
  readonly stage: string | null;
  readonly message: string;
  readonly timestamp: string; // ISO-8601
  readonly data?: Record<string, unknown>;
}

/**
 * The public contract every Logger implementation must satisfy. Deliberately narrow: one method per level,
 * always scoped to a stage (or null), plus a way to read back everything logged so far.
 */
export interface Logger {
  debug(stage: string | null, message: string, data?: Record<string, unknown>): void;
  info(stage: string | null, message: string, data?: Record<string, unknown>): void;
  warn(stage: string | null, message: string, data?: Record<string, unknown>): void;
  error(stage: string | null, message: string, data?: Record<string, unknown>): void;

  /** Every entry logged so far this run, in order. Powers `oram inspect`'s Logs view. */
  entries(): ReadonlyArray<LogEntry>;
}

/**
 * Reference implementation: buffers entries in memory. Does not yet print to a terminal or persist via
 * ArtifactStore (see TODOs above) -- but buffering itself is pure bookkeeping, not business logic, so this
 * class is fully functional today and safe to use as-is by other skeleton code (e.g. CLI commands) that
 * needs something to log to during scaffolding.
 */
export class BufferedLogger implements Logger {
  private readonly buffer: LogEntry[] = [];

  private push(level: LogLevel, stage: string | null, message: string, data?: Record<string, unknown>): void {
    this.buffer.push({ level, stage, message, timestamp: new Date().toISOString(), data });
  }

  debug(stage: string | null, message: string, data?: Record<string, unknown>): void {
    this.push("debug", stage, message, data);
  }

  info(stage: string | null, message: string, data?: Record<string, unknown>): void {
    this.push("info", stage, message, data);
  }

  warn(stage: string | null, message: string, data?: Record<string, unknown>): void {
    this.push("warn", stage, message, data);
  }

  error(stage: string | null, message: string, data?: Record<string, unknown>): void {
    this.push("error", stage, message, data);
  }

  entries(): ReadonlyArray<LogEntry> {
    return this.buffer;
  }
}
