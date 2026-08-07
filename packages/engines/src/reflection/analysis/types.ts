/**
 * ReflectionFinding / ReflectionReport — Capability Sprint 12 (Reflection Engine).
 *
 * Recommendation (../../recommendation/) turns each ValidationIssue into one actionable Recommendation --
 * this package reasons over the WHOLE batch (both the ValidationResult and the RecommendationSet together)
 * and produces one meta-level ReflectionReport: is this batch healthy, is a retry warranted, how confident
 * should a caller be in it. Exactly like Engineering Reasoning (../../engineering-reasoning/) reasons over
 * Engineering Knowledge via fixed deterministic rules, never re-deriving anything upstream -- this package
 * NEVER executes code, edits files, calls AI, invokes git, or invokes a Provider. It only reasons over data
 * @oram/engines has already produced (see ./rules.ts).
 *
 * `ReflectionSeverity` deliberately mirrors `ValidationSeverity`'s shape ("INFO"|"WARNING"|"ERROR") rather
 * than reusing it directly -- the same collision-avoidance reasoning validation's own header comment gives
 * for not reusing engineering-reasoning's `Severity`.
 */

export type ReflectionSeverity = "INFO" | "WARNING" | "ERROR";

export type ReflectionCategory = "QUALITY" | "CORRECTNESS" | "STYLE" | "ARCHITECTURE" | "GENERAL";

export interface ReflectionFinding {
  /** Stable per finding KIND, not per occurrence -- unlike ValidationIssue/Recommendation, a ReflectionReport is one artifact for a whole batch, so each of the fixed rule kinds in ./rules.ts can fire at most once per report; see ./rules.ts's own note. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: ReflectionCategory;
  readonly severity: ReflectionSeverity;
}

export interface ReflectionReport {
  readonly findings: ReadonlyArray<ReflectionFinding>;
  /** A short, deterministic, template-built natural-language summary of this report -- see ./build-reflection.ts. */
  readonly summary: string;
  /** true iff Validation contains an ERROR-severity issue, or `overallScore` is below RETRY_SCORE_THRESHOLD (see ./build-reflection.ts). */
  readonly retryRecommended: boolean;
  /** 0-100. 100 minus a fixed deduction per finding by severity, clamped -- see ./build-reflection.ts. */
  readonly overallScore: number;
  /** 0-1. A fixed, deterministic value keyed by the worst finding severity present -- see ./build-reflection.ts. Never computed from anything probabilistic. */
  readonly confidence: number;
}
