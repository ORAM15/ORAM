/**
 * MemoryStore -- a pure, in-memory collection of RunSnapshots. NOT a database, NOT a filesystem-backed
 * artifact store, NOT AI memory of any kind: just an ordered array a caller appends to and queries,
 * comparable to `git log` for ORAM's own engineering intelligence rather than to anything resembling a
 * knowledge base. Every query method accepts an optional `repositoryId` filter so ONE store can hold several
 * repositories' histories at once (see the "Multiple repositories" test scenario in memory.test.ts) while
 * still answering "just this repository's history" cheaply.
 *
 * CONCRETE LIMITATION -- consistent with every other stage's own disclosed gap: nothing here persists across
 * process invocations. A CLI command constructs a fresh MemoryStore, records exactly the run it just
 * computed, and renders from that single-entry store -- `oram history <path>` therefore always shows exactly
 * one run today, honestly. Multi-run history is real and fully exercised by this package's own test suite
 * (which saves several snapshots into one long-lived store directly), but nothing in @oram/runtime or the
 * CLI wires a MemoryStore to outlive one process yet -- that requires the ArtifactStore integration disclosed
 * as missing in every prior stage's own EngineDescriptor factory comment, not a new gap introduced here.
 */

import type { MemoryStatistics, RepositoryHistory, RunHistory, RunSnapshot } from "./analysis/types";

function average(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Deterministic tie-break: the snapshot with the largest ISO-8601 timestamp string wins (later run); ties keep the first one encountered, i.e. call order, never random. */
function mostRecent(snapshots: ReadonlyArray<RunSnapshot>): RunSnapshot | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((latest, candidate) => (candidate.timestamp > latest.timestamp ? candidate : latest));
}

export class MemoryStore {
  private readonly snapshots: RunSnapshot[] = [];

  /** Appends one RunSnapshot. Never mutates or replaces a prior snapshot -- history is append-only, exactly like the "git log" comparison this package's own header comment makes. */
  save(snapshot: RunSnapshot): void {
    this.snapshots.push(snapshot);
  }

  private matching(repositoryId?: string): RunSnapshot[] {
    return repositoryId === undefined ? [...this.snapshots] : this.snapshots.filter((snapshot) => snapshot.repositoryId === repositoryId);
  }

  /** The most recently timestamped snapshot, optionally scoped to one repository. Null when nothing matches -- never a fabricated snapshot. */
  latest(repositoryId?: string): RunSnapshot | null {
    return mostRecent(this.matching(repositoryId));
  }

  /** Every matching snapshot, oldest first, optionally scoped to one repository. */
  history(repositoryId?: string): RunHistory {
    const ordered = this.matching(repositoryId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return { snapshots: ordered };
  }

  /** Always scoped to exactly one repository -- see ./analysis/types.ts's own note on why this is a distinct type/method from history(). */
  historyByRepository(repositoryId: string): RepositoryHistory {
    return { repositoryId, snapshots: this.history(repositoryId).snapshots };
  }

  /** Best (highest validationScore) matching snapshot; ties broken by most recent timestamp. Null for an empty match set. */
  bestRun(repositoryId?: string): RunSnapshot | null {
    const matches = this.matching(repositoryId);
    if (matches.length === 0) return null;
    return matches.reduce((best, candidate) =>
      candidate.validationScore > best.validationScore || (candidate.validationScore === best.validationScore && candidate.timestamp > best.timestamp)
        ? candidate
        : best
    );
  }

  /** Worst (lowest validationScore) matching snapshot; ties broken by most recent timestamp. Null for an empty match set. */
  worstRun(repositoryId?: string): RunSnapshot | null {
    const matches = this.matching(repositoryId);
    if (matches.length === 0) return null;
    return matches.reduce((worst, candidate) =>
      candidate.validationScore < worst.validationScore || (candidate.validationScore === worst.validationScore && candidate.timestamp > worst.timestamp)
        ? candidate
        : worst
    );
  }

  /** 0-100, rounded. 0 for an empty match set -- unlike statistics().bestScore/worstScore (which use null), this method's own contract is a plain number, so an explicit "no data" 0 is the honest choice here, documented rather than silently returned. */
  averageScore(repositoryId?: string): number {
    const matches = this.matching(repositoryId);
    if (matches.length === 0) return 0;
    return Math.round(average(matches.map((snapshot) => snapshot.validationScore)));
  }

  statistics(repositoryId?: string): MemoryStatistics {
    const matches = this.matching(repositoryId);
    const totalRuns = matches.length;
    if (totalRuns === 0) {
      return {
        totalRuns: 0,
        averageValidationScore: 0,
        averageRecommendationCount: 0,
        averageMissionCount: 0,
        averageExecutionPlanCount: 0,
        averageRetryRate: 0,
        bestScore: null,
        worstScore: null,
      };
    }

    const scores = matches.map((snapshot) => snapshot.validationScore);
    return {
      totalRuns,
      averageValidationScore: Math.round(average(scores)),
      averageRecommendationCount: average(matches.map((snapshot) => snapshot.recommendationCount)),
      averageMissionCount: average(matches.map((snapshot) => snapshot.missionCount)),
      averageExecutionPlanCount: average(matches.map((snapshot) => snapshot.executionPlanCount)),
      averageRetryRate: matches.filter((snapshot) => snapshot.retryRecommended).length / totalRuns,
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
    };
  }
}
