/**
 * Recommendation / RecommendationSet — Capability Sprint 11 (Recommendation Engine).
 *
 * Validation (../../validation/) evaluates PatchArtifacts into ValidationReports carrying ValidationIssues --
 * this package's ONLY job is to translate each ValidationIssue into one actionable, human-readable
 * Recommendation. Pure and deterministic: no AI, no filesystem, no re-evaluation of the patch itself (see
 * ./rules.ts, which maps purely off `ValidationIssue.title`, never `unifiedDiff` again).
 *
 * `RecommendationSeverity` deliberately mirrors validation's own `ValidationSeverity` shape ("INFO"|"WARNING"|
 * "ERROR") rather than reusing it directly (the same collision-avoidance reasoning validation's own header
 * comment gives for not reusing engineering-reasoning's `Severity`) -- it is also, not coincidentally, exactly
 * the value carried over 1:1 from the source ValidationIssue into `Recommendation.priority` (see
 * ./build-recommendations.ts): a Recommendation's priority IS the severity of the issue it addresses, never a
 * separately invented ranking.
 */

export type RecommendationSeverity = "INFO" | "WARNING" | "ERROR";

export type RecommendationCategory =
  | "TESTING"
  | "ARCHITECTURE"
  | "STYLE"
  | "DOCUMENTATION"
  | "SECURITY"
  | "PERFORMANCE"
  | "CORRECTNESS"
  | "GENERAL";

export interface Recommendation {
  readonly id: string;
  /** id of the ValidationIssue (see validation/analysis/types.ts) this recommendation addresses. */
  readonly validationIssueId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: RecommendationSeverity;
  readonly category: RecommendationCategory;
  /** 0-1. Fixed per rule template (see ./rules.ts) -- never computed from anything probabilistic; there is no model behind this number. */
  readonly confidence: number;
}

export interface RecommendationSet {
  readonly recommendations: ReadonlyArray<Recommendation>;
}
