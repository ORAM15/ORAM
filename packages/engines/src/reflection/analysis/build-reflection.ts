/**
 * buildReflectionReport() — the whole-batch entry point: reduces a ValidationResult + RecommendationSet into
 * stats (./rules.ts's computeStats()), evaluates every rule (evaluateFindings()), then scores, rates
 * confidence in, and decides a retry recommendation for the resulting findings. Every step here is a fixed,
 * deterministic function -- no AI, no probability, no filesystem.
 */

import type { ValidationResult } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import { computeStats, evaluateFindings, type ValidationStats } from "./rules";
import type { ReflectionFinding, ReflectionReport, ReflectionSeverity } from "./types";

/** Fixed points subtracted from a starting score of 100 per finding, by severity. */
const SEVERITY_DEDUCTION: Readonly<Record<ReflectionSeverity, number>> = {
  ERROR: 25,
  WARNING: 10,
  INFO: 2,
};

/**
 * retryRecommended is TRUE when overallScore drops below this, even if no ERROR-severity ValidationIssue
 * exists on its own. Set to 80 rather than a rounder-looking 70: with today's 6 rules, the maximum deduction
 * reachable WITHOUT any ERROR-severity issue is 22 (checkMinorQualityIssues -10 + checkLargeIssueVolume -10 +
 * checkMultipleRecommendations -2, the only three WARNING/INFO-yielding rules), i.e. a floor of 78 -- a
 * threshold of 70 would make this half of the OR condition unreachable in practice (retryRecommended would
 * always already be TRUE via the ERROR-issue branch first). 80 keeps this branch a real, reachable safety net
 * for "many small concerns, no single fatal one," exactly as intended.
 */
export const RETRY_SCORE_THRESHOLD = 80;

/** 100 minus a fixed per-finding deduction by severity, clamped to [0, 100]. */
export function computeOverallScore(findings: ReadonlyArray<ReflectionFinding>): number {
  const deduction = findings.reduce((total, findingItem) => total + SEVERITY_DEDUCTION[findingItem.severity], 0);
  return Math.max(0, Math.min(100, 100 - deduction));
}

/** A fixed, deterministic value keyed by the worst finding severity present: no findings -> 1.0, only INFO -> 0.95, any WARNING -> 0.85, any ERROR -> 0.70. */
export function computeConfidence(findings: ReadonlyArray<ReflectionFinding>): number {
  if (findings.length === 0) return 1.0;
  if (findings.some((findingItem) => findingItem.severity === "ERROR")) return 0.7;
  if (findings.some((findingItem) => findingItem.severity === "WARNING")) return 0.85;
  return 0.95;
}

/** A short, deterministic, template-built natural-language summary -- always built from `stats` directly (never just `findings.length`), so it stays accurate even in the rare case where issues exist but no rule happened to fire (e.g. only a few INFO-severity issues, below every threshold). */
export function buildSummary(findings: ReadonlyArray<ReflectionFinding>, stats: ValidationStats): string {
  if (stats.issueCount === 0) {
    return `All ${stats.patchCount} validated patch(es) passed without any issues.`;
  }
  const parts: string[] = [];
  if (stats.errorCount > 0) parts.push(`${stats.errorCount} critical issue(s)`);
  if (stats.warningCount > 0) parts.push(`${stats.warningCount} warning-level issue(s)`);
  if (stats.infoCount > 0) parts.push(`${stats.infoCount} informational issue(s)`);
  if (stats.recommendationCount > 0) parts.push(`${stats.recommendationCount} recommendation(s)`);
  return `${findings.length} reflection finding(s) raised from ${parts.join(", ")} across ${stats.patchCount} validated patch(es).`;
}

/**
 * Reasons over a whole ValidationResult + RecommendationSet batch and produces one ReflectionReport.
 * retryRecommended is TRUE only when Validation contains an ERROR-severity issue OR overallScore is below
 * RETRY_SCORE_THRESHOLD -- exactly the rule the Sprint's own spec states, never anything broader.
 */
export function buildReflectionReport(result: ValidationResult, recommendationSet: RecommendationSet): ReflectionReport {
  const stats = computeStats(result, recommendationSet);
  const findings = evaluateFindings(stats);
  const overallScore = computeOverallScore(findings);
  const confidence = computeConfidence(findings);
  const retryRecommended = stats.errorCount > 0 || overallScore < RETRY_SCORE_THRESHOLD;

  return {
    findings,
    summary: buildSummary(findings, stats),
    retryRecommended,
    overallScore,
    confidence,
  };
}
