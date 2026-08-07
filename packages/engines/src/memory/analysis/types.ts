/**
 * RunSnapshot / RunHistory / RepositoryHistory / MemoryStatistics — Capability Sprint 13 (Engineering
 * Memory & Run History).
 *
 * Reflection (../../reflection/) reasons over one run's Validation + Recommendation output -- Engineering
 * Memory is the stage after it: a deterministic historical RECORD of every run, never a re-reasoning over
 * them. Think "git log," not "AI memory": no embeddings, no vector search, no similarity scoring, no model of
 * any kind. `buildRunSnapshot()` (./build-run-snapshot.ts) is a pure function of already-computed pipeline
 * output; `MemoryStore` (../MemoryStore.ts) is a plain, pure, in-memory collection with no database and no
 * filesystem persistence -- exactly as this Sprint's own spec requires.
 *
 * `RunSnapshotInputs` bundles "metadata from previous stages already available in the pipeline" (the
 * Sprint's own phrase) -- every field is a value some earlier stage already computed; this package invents no
 * new facts about a repository, it only records facts other stages already produced.
 */

import type { RepositoryAnalysis } from "../../repository-analyzer/analysis/types";
import type { EngineeringKnowledge } from "../../engineering-knowledge/analysis/types";
import type { EngineeringReasoning } from "../../engineering-reasoning/analysis/types";
import type { EngineeringPlan } from "../../engineering-planning/analysis/types";
import type { MissionGraph } from "../../engineering-missions/analysis/types";
import type { ImplementationRequestSet } from "../../implementation-requests/analysis/types";
import type { ExecutionPlanSet } from "../../execution-planning/analysis/types";
import type { ValidationResult } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import type { ReflectionReport } from "../../reflection/analysis/types";

/** Everything buildRunSnapshot() needs -- one bundle per already-computed pipeline run, nothing re-derived. */
export interface RunSnapshotInputs {
  /** The absolute repository path this run analyzed -- the source of `repositoryId` (see ./build-run-snapshot.ts), the same canonical "which repository" value `@oram/runtime`'s own RuntimeContext.repositoryRoot plays elsewhere in this codebase. */
  readonly repositoryRoot: string;
  readonly analysis: RepositoryAnalysis;
  readonly knowledge: EngineeringKnowledge;
  readonly reasoning: EngineeringReasoning;
  readonly plan: EngineeringPlan;
  readonly graph: MissionGraph;
  readonly requestSet: ImplementationRequestSet;
  readonly planSet: ExecutionPlanSet;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly reflectionReport: ReflectionReport;
}

export interface RunSnapshot {
  /** Deterministic: the same repositoryRoot always yields the same repositoryId (see ./build-run-snapshot.ts). */
  readonly repositoryId: string;
  /** Unique per run (timestamp-derived -- see ./build-run-snapshot.ts's own note on why this one field can't be a pure function of input data alone). */
  readonly runId: string;
  readonly timestamp: string;
  readonly analysisSummary: string;
  readonly knowledgeSummary: string;
  readonly reasoningSummary: string;
  readonly planningSummary: string;
  readonly missionCount: number;
  readonly requestCount: number;
  readonly executionPlanCount: number;
  /** 0-100. Average of every ValidationReport.score in this run's ValidationResult; 100 when there were zero reports to validate (nothing failed -- the same "empty is clean" convention validation/reflection already established). */
  readonly validationScore: number;
  readonly recommendationCount: number;
  readonly reflectionSummary: string;
  readonly retryRecommended: boolean;
  readonly overallConfidence: number;
}

/** The full run history this MemoryStore currently holds -- either every repository's runs, or one repository's, depending on how it was requested (see MemoryStore.history()). */
export interface RunHistory {
  readonly snapshots: ReadonlyArray<RunSnapshot>;
}

/** Always scoped to exactly one repository -- the return shape of MemoryStore.historyByRepository(), distinct from RunHistory (which may span every repository the store has ever recorded). */
export interface RepositoryHistory {
  readonly repositoryId: string;
  readonly snapshots: ReadonlyArray<RunSnapshot>;
}

/** Aggregate statistics over a set of RunSnapshots. `bestScore`/`worstScore` are `null` for an empty set -- never a fabricated 0 or 100, since neither would honestly mean "no data yet." */
export interface MemoryStatistics {
  readonly totalRuns: number;
  readonly averageValidationScore: number;
  readonly averageRecommendationCount: number;
  readonly averageMissionCount: number;
  readonly averageExecutionPlanCount: number;
  /** 0-1: the fraction of runs with retryRecommended === true. */
  readonly averageRetryRate: number;
  readonly bestScore: number | null;
  readonly worstScore: number | null;
}
