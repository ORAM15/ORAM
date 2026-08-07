/**
 * Regression coverage for the Reflection Engine (Capability Sprint 12).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - unit tests for each of the 6 deterministic rules (validation clean, critical validation failures,
 *     minor quality issues remain, large number of validation issues, multiple recommendations exist,
 *     confidence reduced due to many errors)
 *   - scoring (fixed deduction per severity, clamped 0-100) and confidence (fixed tiers) helpers
 *   - retryRecommended (ERROR present OR overallScore below threshold, never anything broader)
 *   - deterministic ids (same finding kind -> same id, every run)
 *   - a stored JSON snapshot of the full ReflectionReport for concentrated-monorepo
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/reflection/reflection.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "../execution-planning/analysis/build-execution-plans";
import { runAll as runProviderExecutionAll } from "../provider-execution/ProviderExecutionEngine";
import { validateAll } from "../validation/ValidationEngine";
import type { ValidationIssue, ValidationReport, ValidationResult, ValidationSeverity } from "../validation/analysis/types";
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import type { RecommendationSet } from "../recommendation/analysis/types";
import {
  computeStats,
  checkValidationClean,
  checkCriticalValidationFailures,
  checkMinorQualityIssues,
  checkLargeIssueVolume,
  checkMultipleRecommendations,
  checkConfidenceReducedByErrors,
  LARGE_ISSUE_COUNT_THRESHOLD,
  MANY_ERRORS_THRESHOLD,
  MULTIPLE_RECOMMENDATIONS_THRESHOLD,
} from "./analysis/rules";
import { buildReflectionReport, computeOverallScore, computeConfidence, RETRY_SCORE_THRESHOLD } from "./analysis/build-reflection";
import { ReflectionEngine } from "./ReflectionEngine";
import type { ReflectionFinding, ReflectionReport } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "reflection-concentrated-monorepo.snap.json");

function findRepositoryRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, "scripts", "repository-intelligence.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find a repository root containing scripts/repository-intelligence.js above ${startDir}.`);
}

function pipelineInputsFor(root: string): { validationResult: ValidationResult; recommendationSet: RecommendationSet } {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  return { validationResult, recommendationSet };
}

function makeIssue(severity: ValidationSeverity, title = "Synthetic issue", patchId = "patch-artifact:synthetic"): ValidationIssue {
  return { id: `validation-issue:synthetic-${severity}-${Math.random()}`, severity, title, description: "synthetic", patchId };
}

function makeReport(issues: ValidationIssue[], patchId = "patch-artifact:synthetic"): ValidationReport {
  return { id: `validation-report:${patchId}`, patchId, passed: !issues.some((i) => i.severity === "ERROR"), score: 100, issues };
}

function emptyRecommendations(): RecommendationSet {
  return { recommendations: [] };
}

function makeRecommendations(count: number): RecommendationSet {
  return {
    recommendations: Array.from({ length: count }, (_, index) => ({
      id: `recommendation:synthetic-${index}`,
      validationIssueId: `validation-issue:synthetic-${index}`,
      title: "Synthetic recommendation",
      description: "synthetic",
      priority: "WARNING" as const,
      category: "GENERAL" as const,
      confidence: 0.5,
    })),
  };
}

test("rule: checkValidationClean fires only when there are zero ValidationIssues", () => {
  assert.ok(checkValidationClean(computeStats({ reports: [] }, emptyRecommendations())));
  assert.ok(checkValidationClean(computeStats({ reports: [makeReport([])] }, emptyRecommendations())));
  assert.equal(checkValidationClean(computeStats({ reports: [makeReport([makeIssue("INFO")])] }, emptyRecommendations())), null);
});

test("rule: checkCriticalValidationFailures fires only when at least one ERROR issue exists", () => {
  const stats = computeStats({ reports: [makeReport([makeIssue("ERROR")])] }, emptyRecommendations());
  const findingResult = checkCriticalValidationFailures(stats);
  assert.ok(findingResult);
  assert.equal(findingResult!.severity, "ERROR");
  assert.equal(findingResult!.category, "CORRECTNESS");
  assert.equal(checkCriticalValidationFailures(computeStats({ reports: [makeReport([makeIssue("WARNING")])] }, emptyRecommendations())), null);
});

test("rule: checkMinorQualityIssues fires only when WARNING issues exist and no ERROR issue does", () => {
  const withWarningOnly = computeStats({ reports: [makeReport([makeIssue("WARNING")])] }, emptyRecommendations());
  assert.ok(checkMinorQualityIssues(withWarningOnly));

  const withErrorAndWarning = computeStats({ reports: [makeReport([makeIssue("ERROR"), makeIssue("WARNING")])] }, emptyRecommendations());
  assert.equal(checkMinorQualityIssues(withErrorAndWarning), null);
});

test("rule: checkLargeIssueVolume fires only above LARGE_ISSUE_COUNT_THRESHOLD, regardless of severity", () => {
  const atThreshold = computeStats(
    { reports: [makeReport(Array.from({ length: LARGE_ISSUE_COUNT_THRESHOLD }, () => makeIssue("INFO")))] },
    emptyRecommendations()
  );
  assert.equal(checkLargeIssueVolume(atThreshold), null);

  const overThreshold = computeStats(
    { reports: [makeReport(Array.from({ length: LARGE_ISSUE_COUNT_THRESHOLD + 1 }, () => makeIssue("INFO")))] },
    emptyRecommendations()
  );
  assert.ok(checkLargeIssueVolume(overThreshold));
});

test("rule: checkMultipleRecommendations fires only at or above MULTIPLE_RECOMMENDATIONS_THRESHOLD", () => {
  const oneReport = makeReport([makeIssue("WARNING")]);
  const zeroRecs = computeStats({ reports: [oneReport] }, emptyRecommendations());
  assert.equal(checkMultipleRecommendations(zeroRecs), null);

  const belowThreshold = computeStats({ reports: [oneReport] }, makeRecommendations(MULTIPLE_RECOMMENDATIONS_THRESHOLD - 1));
  assert.equal(checkMultipleRecommendations(belowThreshold), null);

  const atThreshold = computeStats({ reports: [oneReport] }, makeRecommendations(MULTIPLE_RECOMMENDATIONS_THRESHOLD));
  const findingResult = checkMultipleRecommendations(atThreshold);
  assert.ok(findingResult);
  assert.equal(findingResult!.severity, "INFO");
  assert.equal(findingResult!.category, "GENERAL");
});

test("rule: checkConfidenceReducedByErrors fires only at or above MANY_ERRORS_THRESHOLD", () => {
  const belowThreshold = computeStats(
    { reports: [makeReport(Array.from({ length: MANY_ERRORS_THRESHOLD - 1 }, () => makeIssue("ERROR")))] },
    emptyRecommendations()
  );
  assert.equal(checkConfidenceReducedByErrors(belowThreshold), null);

  const atThreshold = computeStats(
    { reports: [makeReport(Array.from({ length: MANY_ERRORS_THRESHOLD }, () => makeIssue("ERROR")))] },
    emptyRecommendations()
  );
  assert.ok(checkConfidenceReducedByErrors(atThreshold));
});

test("scoring: computeOverallScore subtracts fixed deductions by severity and clamps at 0", () => {
  const findings: ReflectionFinding[] = [
    { id: "1", title: "t", description: "d", category: "GENERAL", severity: "ERROR" },
    { id: "2", title: "t", description: "d", category: "GENERAL", severity: "ERROR" },
    { id: "3", title: "t", description: "d", category: "GENERAL", severity: "ERROR" },
    { id: "4", title: "t", description: "d", category: "GENERAL", severity: "ERROR" },
    { id: "5", title: "t", description: "d", category: "GENERAL", severity: "ERROR" },
  ];
  assert.equal(computeOverallScore([]), 100);
  assert.equal(computeOverallScore([findings[0]!]), 75);
  assert.equal(computeOverallScore(findings), 0); // 5 * 25 = 125, clamped to 0
});

test("confidence: fixed tiers keyed by the worst finding severity present", () => {
  const info: ReflectionFinding = { id: "1", title: "t", description: "d", category: "GENERAL", severity: "INFO" };
  const warning: ReflectionFinding = { id: "2", title: "t", description: "d", category: "GENERAL", severity: "WARNING" };
  const error: ReflectionFinding = { id: "3", title: "t", description: "d", category: "GENERAL", severity: "ERROR" };

  assert.equal(computeConfidence([]), 1.0);
  assert.equal(computeConfidence([info]), 0.95);
  assert.equal(computeConfidence([info, warning]), 0.85);
  assert.equal(computeConfidence([info, warning, error]), 0.7);
});

test("retryRecommended: true when Validation contains an ERROR issue, even if overallScore stays high", () => {
  const result: ValidationResult = { reports: [makeReport([makeIssue("ERROR")])] };
  const report = buildReflectionReport(result, emptyRecommendations());

  assert.equal(report.retryRecommended, true);
});

test("retryRecommended: true when overallScore drops below RETRY_SCORE_THRESHOLD even with no ERROR issue (many warnings + large volume + multiple recommendations, no single fatal issue)", () => {
  const manyWarnings = Array.from({ length: LARGE_ISSUE_COUNT_THRESHOLD + 1 }, () => makeIssue("WARNING"));
  const result: ValidationResult = { reports: [makeReport(manyWarnings)] };
  const report = buildReflectionReport(result, makeRecommendations(MULTIPLE_RECOMMENDATIONS_THRESHOLD));

  assert.equal(report.findings.length, 3); // minor quality issues, large issue volume, multiple recommendations
  assert.equal(report.overallScore, 78); // 100 - 10 - 10 - 2
  assert.ok(report.overallScore < RETRY_SCORE_THRESHOLD);
  assert.equal(report.retryRecommended, true);
});

test("retryRecommended: false for a clean batch (a lone 'Validation clean' INFO finding costs -2, per the fixed scoring table, so overallScore is 98 rather than 100 -- the scoring formula deducts for every finding, positive or not, exactly as specified)", () => {
  const report = buildReflectionReport({ reports: [] }, emptyRecommendations());
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]!.title, "Validation clean");
  assert.equal(report.overallScore, 98);
  assert.equal(report.confidence, 0.95);
  assert.equal(report.retryRecommended, false);
});

test("identity is deterministic: the same finding kind always produces the same id", () => {
  const result: ValidationResult = { reports: [makeReport([makeIssue("ERROR")])] };
  const first = buildReflectionReport(result, emptyRecommendations());
  const second = buildReflectionReport(result, emptyRecommendations());

  assert.deepEqual(
    first.findings.map((f) => f.id),
    second.findings.map((f) => f.id)
  );
});

test("ReflectionEngine.generate() and buildReflectionReport() agree", () => {
  const result: ValidationResult = { reports: [makeReport([makeIssue("WARNING")])] };
  const engine = new ReflectionEngine();

  assert.deepEqual(engine.generate(result, emptyRecommendations()), buildReflectionReport(result, emptyRecommendations()));
});

test("concentrated-monorepo fixture: buildReflectionReport() reasons over the real pipeline's output", () => {
  const { validationResult, recommendationSet } = pipelineInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const report = buildReflectionReport(validationResult, recommendationSet);

  assert.ok(report.findings.length > 0);
  assert.ok(report.overallScore >= 0 && report.overallScore <= 100);
  assert.ok(report.confidence >= 0 && report.confidence <= 1);
  assert.equal(typeof report.summary, "string");
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture (zero patches): buildReflectionReport() reports a clean batch`, () => {
    const { validationResult, recommendationSet } = pipelineInputsFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    const report = buildReflectionReport(validationResult, recommendationSet);

    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.title, "Validation clean");
    assert.equal(report.overallScore, 98);
    assert.equal(report.confidence, 0.95);
    assert.equal(report.retryRecommended, false);
  });
}

test("snapshot: concentrated-monorepo's full ReflectionReport matches the stored snapshot", () => {
  const { validationResult, recommendationSet } = pipelineInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual: ReflectionReport = buildReflectionReport(validationResult, recommendationSet);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const { validationResult, recommendationSet } = pipelineInputsFor(repoRoot);
  const report = buildReflectionReport(validationResult, recommendationSet);

  assert.ok(report.overallScore >= 0 && report.overallScore <= 100);
  assert.ok(["boolean"].includes(typeof report.retryRecommended));
  for (const findingItem of report.findings) {
    assert.ok(findingItem.title.length > 0);
    assert.ok(findingItem.description.length > 0);
  }
});
