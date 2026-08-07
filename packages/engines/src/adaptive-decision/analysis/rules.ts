/**
 * Deterministic policies over DecisionInputs. Evaluated in a FIXED order (most severe first); the first one
 * whose condition matches wins -- exactly the "sequential rule table, first match wins" technique
 * validation/recommendation/reflection all already use. Every condition below is a plain check against
 * already-computed upstream facts (a ReflectionFinding's own title, a ValidationIssue's own severity, a
 * RunSnapshot's own retryRecommended) -- no rule here re-parses a patch, re-walks a repository, or calls
 * anything resembling AI.
 *
 * `computeValidationScore()` is Decision's own aggregate over the raw ValidationResult -- deliberately
 * independent from Reflection's own `overallScore` (a different deduction table, for a different purpose):
 * Reflection's score answers "how healthy was this validation batch as a set of findings"; Decision's score
 * answers "what fraction of full marks did the underlying patches themselves earn," the same technique
 * memory/analysis/build-run-snapshot.ts already uses for RunSnapshot.validationScore (duplicated here rather
 * than imported, since importing from `memory` would be an unusual, unnecessary cross-package coupling for
 * one three-line average).
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ValidationResult } from "../../validation/analysis/types";
import type { ReflectionFinding } from "../../reflection/analysis/types";
import type { DecisionInputs, DecisionType, RiskLevel } from "./types";

/** Below this aggregate validation score (and with nothing more severe already matched), Decision recommends a retry. Not a rounder-looking 100: an occasional WARNING-only patch (e.g. MemoryProvider's own placeholder diffs) should not by itself force CONTINUE to mean "flawless." */
export const RETRY_VALIDATION_SCORE_THRESHOLD = 90;

export interface DecisionOutcome {
  /** Stable per policy KIND, not per occurrence -- an EngineeringDecision is one artifact per run, so each policy fires at most once per decision; see ./build-decision.ts's own note mirroring reflection/analysis/rules.ts's identical reasoning for ReflectionFinding.id. */
  readonly kind: string;
  readonly decisionType: DecisionType;
  readonly reason: string;
  readonly confidence: number;
  readonly riskLevel: RiskLevel;
  readonly nextAction: string;
  readonly evidenceIds: ReadonlyArray<string>;
}

/** 100 minus the average per-report deduction, i.e. the mean of every ValidationReport.score in the batch; 100 when there were zero reports (nothing failed -- the same "empty is clean" convention validation/reflection/memory already established). */
export function computeValidationScore(validationResult: ValidationResult): number {
  if (validationResult.reports.length === 0) return 100;
  const total = validationResult.reports.reduce((sum, report) => sum + report.score, 0);
  return Math.round(total / validationResult.reports.length);
}

function findFinding(findings: ReadonlyArray<ReflectionFinding>, title: string): ReflectionFinding | undefined {
  return findings.find((finding) => finding.title === title);
}

function errorIssueIds(validationResult: ValidationResult): string[] {
  return validationResult.reports.flatMap((report) => report.issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.id));
}

/** Fires only when BOTH the previous recorded run AND this run recommend a retry -- a genuine repeated failure, not a single bad run. The most severe policy: further automated attempts are unlikely to succeed on their own. */
export function checkRepeatedFailure(inputs: DecisionInputs): DecisionOutcome | null {
  if (!inputs.previousRun || !inputs.previousRun.retryRecommended || !inputs.reflectionReport.retryRecommended) return null;
  return {
    kind: "stop-repeated-failure",
    decisionType: "STOP",
    reason: "Both this run and the previously recorded run recommended a retry; repeated automated attempts are unlikely to succeed.",
    confidence: 0.95,
    riskLevel: "HIGH",
    nextAction: "Stop automated execution; manual intervention is required before trying again.",
    evidenceIds: [inputs.previousRun.runId, ...inputs.reflectionReport.findings.map((finding) => finding.id)],
  };
}

/** Fires when Reflection's own "Confidence reduced due to many errors" finding is present (3+ ERROR-severity ValidationIssues) -- too severe and widespread for a Provider swap alone to fix. */
export function checkManyErrors(inputs: DecisionInputs): DecisionOutcome | null {
  const finding = findFinding(inputs.reflectionReport.findings, "Confidence reduced due to many errors");
  if (!finding) return null;
  return {
    kind: "escalate-many-errors",
    decisionType: "ESCALATE_TO_HUMAN",
    reason: "Multiple ERROR-severity validation issues were found; this exceeds what an automated retry alone should resolve.",
    confidence: 0.9,
    riskLevel: "HIGH",
    nextAction: "Escalate to a human reviewer before proceeding.",
    evidenceIds: [finding.id, ...errorIssueIds(inputs.validationResult)],
  };
}

/** Fires when Reflection's own "Critical validation failures" finding is present (at least one ERROR-severity ValidationIssue) but checkManyErrors did not already claim it -- an isolated, structurally broken patch is a Provider-output problem, not (yet) a human-escalation-worthy one. */
export function checkCriticalFailure(inputs: DecisionInputs): DecisionOutcome | null {
  const finding = findFinding(inputs.reflectionReport.findings, "Critical validation failures");
  if (!finding) return null;
  return {
    kind: "change-provider-broken-output",
    decisionType: "CHANGE_PROVIDER",
    reason: "A validation ERROR indicates the current Provider produced structurally broken output (an empty, headerless, or malformed diff).",
    confidence: 0.8,
    riskLevel: "MEDIUM",
    nextAction: "Switch to a different Provider before retrying this Mission.",
    evidenceIds: [finding.id, ...errorIssueIds(inputs.validationResult)],
  };
}

/** Fires when Reflection's own "Large number of validation issues" finding is present -- too much volume for one batch to stay reviewable, independent of severity. */
export function checkLargeVolume(inputs: DecisionInputs): DecisionOutcome | null {
  const finding = findFinding(inputs.reflectionReport.findings, "Large number of validation issues");
  if (!finding) return null;
  return {
    kind: "split-mission-large-volume",
    decisionType: "SPLIT_MISSION",
    reason: "Validation issue volume is large relative to a single batch; splitting the Mission should improve traceability.",
    confidence: 0.75,
    riskLevel: "MEDIUM",
    nextAction: "Split this Mission into smaller, independently reviewable units.",
    evidenceIds: [finding.id],
  };
}

/** Fires when Decision's own validation score aggregate is below RETRY_VALIDATION_SCORE_THRESHOLD, and nothing more severe already matched. */
export function checkLowValidationScore(inputs: DecisionInputs): DecisionOutcome | null {
  const score = computeValidationScore(inputs.validationResult);
  if (score >= RETRY_VALIDATION_SCORE_THRESHOLD) return null;
  return {
    kind: "retry-low-validation-score",
    decisionType: "RETRY",
    reason: `Validation score ${score}/100 is below the ${RETRY_VALIDATION_SCORE_THRESHOLD} threshold expected before continuing.`,
    confidence: 0.7,
    riskLevel: "MEDIUM",
    nextAction: "Retry execution, addressing the outstanding recommendations first.",
    evidenceIds: inputs.recommendationSet.recommendations.map((recommendation) => recommendation.id),
  };
}

/** The default outcome when no policy above matched -- nothing blocking, no evidence to cite. */
export function checkContinue(): DecisionOutcome {
  return {
    kind: "continue-clean",
    decisionType: "CONTINUE",
    reason: "Validation acceptable and no blocking findings.",
    confidence: 0.9,
    riskLevel: "LOW",
    nextAction: "Execute implementation.",
    evidenceIds: [],
  };
}

const RULES: ReadonlyArray<(inputs: DecisionInputs) => DecisionOutcome | null> = [
  checkRepeatedFailure,
  checkManyErrors,
  checkCriticalFailure,
  checkLargeVolume,
  checkLowValidationScore,
];

/** Runs every policy, in a fixed order, and returns whatever fired first -- checkContinue() otherwise. */
export function evaluateDecision(inputs: DecisionInputs): DecisionOutcome {
  for (const rule of RULES) {
    const outcome = rule(inputs);
    if (outcome) return outcome;
  }
  return checkContinue();
}

/** Namespaces a policy kind into a stable id -- see DecisionOutcome.kind's own comment. */
export function policyId(kind: string): string {
  return makeId("policy", kind);
}
