/**
 * Deterministic rules that reason over a ValidationResult + RecommendationSet batch and produce
 * ReflectionFindings. `computeStats()` reduces both inputs into a small, fixed set of counts ONCE; every rule
 * below is a pure function of those counts -- no rule re-walks `result.reports`/`recommendationSet.recommendations`
 * itself, and no rule is a probability or a guess: every threshold is a fixed, named constant.
 *
 * A finding's `id` is keyed only by its fixed rule "kind" (e.g. "critical-validation-failures"), not by any
 * per-run value -- unlike ValidationIssue/Recommendation ids, which must disambiguate many issues across many
 * patches, a ReflectionReport is ONE artifact for a whole batch, so each rule fires at most once per report
 * and its kind alone is already a stable, unique identity.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ValidationResult } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import type { ReflectionCategory, ReflectionFinding, ReflectionSeverity } from "./types";

/** Above this many total ValidationIssues, a batch is considered unusually large -- see checkLargeIssueVolume. */
export const LARGE_ISSUE_COUNT_THRESHOLD = 10;
/** At or above this many ERROR-severity issues, confidence is considered further reduced -- see checkConfidenceReducedByErrors. */
export const MANY_ERRORS_THRESHOLD = 3;
/** At or above this many Recommendations, the batch is considered to have "multiple" -- see checkMultipleRecommendations. */
export const MULTIPLE_RECOMMENDATIONS_THRESHOLD = 2;

export interface ValidationStats {
  readonly patchCount: number;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly recommendationCount: number;
}

/** Reduces a whole ValidationResult + RecommendationSet into the fixed counts every rule below reasons over. */
export function computeStats(result: ValidationResult, recommendationSet: RecommendationSet): ValidationStats {
  const issues = result.reports.flatMap((report) => report.issues);
  return {
    patchCount: result.reports.length,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === "ERROR").length,
    warningCount: issues.filter((issue) => issue.severity === "WARNING").length,
    infoCount: issues.filter((issue) => issue.severity === "INFO").length,
    recommendationCount: recommendationSet.recommendations.length,
  };
}

function finding(kind: string, title: string, description: string, category: ReflectionCategory, severity: ReflectionSeverity): ReflectionFinding {
  return { id: makeId("reflection-finding", kind), title, description, category, severity };
}

/** Fires only when there is no ValidationIssue at all. */
export function checkValidationClean(stats: ValidationStats): ReflectionFinding | null {
  if (stats.issueCount > 0) return null;
  return finding(
    "validation-clean",
    "Validation clean",
    `All ${stats.patchCount} validated patch(es) passed without any issues.`,
    "QUALITY",
    "INFO"
  );
}

/** Fires whenever at least one ERROR-severity ValidationIssue exists. */
export function checkCriticalValidationFailures(stats: ValidationStats): ReflectionFinding | null {
  if (stats.errorCount === 0) return null;
  return finding(
    "critical-validation-failures",
    "Critical validation failures",
    `${stats.errorCount} ERROR-severity validation issue(s) were found across ${stats.patchCount} patch(es); these must be resolved before this patch set can be trusted.`,
    "CORRECTNESS",
    "ERROR"
  );
}

/** Fires only when there are WARNING-severity issues and no ERROR-severity issue (an ERROR already implies the batch is not merely "minor"). */
export function checkMinorQualityIssues(stats: ValidationStats): ReflectionFinding | null {
  if (stats.errorCount > 0 || stats.warningCount === 0) return null;
  return finding(
    "minor-quality-issues-remain",
    "Minor quality issues remain",
    `${stats.warningCount} WARNING-severity issue(s) remain even though no ERROR-severity issue was found.`,
    "QUALITY",
    "WARNING"
  );
}

/** Fires when the total issue count exceeds LARGE_ISSUE_COUNT_THRESHOLD, regardless of severity mix. */
export function checkLargeIssueVolume(stats: ValidationStats): ReflectionFinding | null {
  if (stats.issueCount <= LARGE_ISSUE_COUNT_THRESHOLD) return null;
  return finding(
    "large-number-of-validation-issues",
    "Large number of validation issues",
    `${stats.issueCount} validation issue(s) were found across ${stats.patchCount} patch(es), exceeding the expected threshold of ${LARGE_ISSUE_COUNT_THRESHOLD} for a healthy pipeline run.`,
    "QUALITY",
    "WARNING"
  );
}

/** Fires when the RecommendationSet carries MULTIPLE_RECOMMENDATIONS_THRESHOLD or more recommendations. */
export function checkMultipleRecommendations(stats: ValidationStats): ReflectionFinding | null {
  if (stats.recommendationCount < MULTIPLE_RECOMMENDATIONS_THRESHOLD) return null;
  return finding(
    "multiple-recommendations-exist",
    "Multiple recommendations exist",
    `${stats.recommendationCount} recommendation(s) were generated from this validation batch.`,
    "GENERAL",
    "INFO"
  );
}

/** Fires when ERROR-severity issues reach MANY_ERRORS_THRESHOLD -- a stronger signal than checkCriticalValidationFailures's mere "at least one". */
export function checkConfidenceReducedByErrors(stats: ValidationStats): ReflectionFinding | null {
  if (stats.errorCount < MANY_ERRORS_THRESHOLD) return null;
  return finding(
    "confidence-reduced-due-to-many-errors",
    "Confidence reduced due to many errors",
    `${stats.errorCount} ERROR-severity issues were found, reducing confidence in this validation batch's overall health.`,
    "CORRECTNESS",
    "ERROR"
  );
}

const RULES: ReadonlyArray<(stats: ValidationStats) => ReflectionFinding | null> = [
  checkValidationClean,
  checkCriticalValidationFailures,
  checkMinorQualityIssues,
  checkLargeIssueVolume,
  checkMultipleRecommendations,
  checkConfidenceReducedByErrors,
];

/** Runs every rule, in a fixed order, against one batch's stats and returns whatever fired. */
export function evaluateFindings(stats: ValidationStats): ReflectionFinding[] {
  return RULES.map((rule) => rule(stats)).filter((result): result is ReflectionFinding => result !== null);
}
