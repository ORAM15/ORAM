/**
 * Regression coverage for the Recommendation Engine (Capability Sprint 11).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - engine: each of the 6 known ValidationIssue titles maps to its own fixed template, plus an honest
 *     fallback for an unrecognized title; `priority` is carried 1:1 from the source issue's own severity
 *   - multiple reports: buildRecommendationSet() flattens every report's issues, in order, across a batch
 *   - zero reports (a zero-patch fixture -> zero recommendations, never a fabricated one)
 *   - a stored JSON snapshot of the full RecommendationSet for concentrated-monorepo
 *   - determinism (running the same ValidationResult twice produces byte-identical ids)
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/recommendation/recommendation.test.ts
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
import type { ValidationIssue, ValidationResult, ValidationSeverity } from "../validation/analysis/types";
import { buildRecommendation, buildRecommendationSet } from "./analysis/build-recommendations";
import { RecommendationEngine } from "./RecommendationEngine";
import type { RecommendationSet } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "recommendations-concentrated-monorepo.snap.json");

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

function validationResultFor(root: string): ValidationResult {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  return validateAll(patches);
}

function makeIssue(title: string, severity: ValidationSeverity = "WARNING", patchId = "patch-artifact:synthetic"): ValidationIssue {
  return { id: `validation-issue:synthetic-${title}`, severity, title, description: "synthetic", patchId };
}

test("engine: each known ValidationIssue title maps to its own fixed recommendation template", () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    ["Empty patch", "Provide a real implementation", "CORRECTNESS"],
    ["Placeholder diff detected", "Replace placeholder content", "CORRECTNESS"],
    ["Diff too large", "Split into smaller patches", "ARCHITECTURE"],
    ["Missing file headers", "Generate valid diff headers", "CORRECTNESS"],
    ["Invalid unified diff header", "Fix mismatched diff headers", "CORRECTNESS"],
    ["Duplicate hunks", "Consolidate hunks", "CORRECTNESS"],
  ];

  for (const [issueTitle, recommendationTitle, category] of cases) {
    const issue = makeIssue(issueTitle);
    const recommendation = buildRecommendation(issue);
    assert.equal(recommendation.title, recommendationTitle, issueTitle);
    assert.equal(recommendation.category, category, issueTitle);
    assert.equal(recommendation.validationIssueId, issue.id);
    assert.ok(recommendation.confidence > 0 && recommendation.confidence <= 1);
  }
});

test("engine: an unrecognized issue title falls back to a generic recommendation instead of guessing", () => {
  const issue = makeIssue("Some Future Validation Rule");
  const recommendation = buildRecommendation(issue);

  assert.equal(recommendation.title, "Review flagged issue");
  assert.equal(recommendation.category, "GENERAL");
  assert.equal(recommendation.confidence, 0.5);
});

test("engine: a recommendation's priority is carried 1:1 from its source issue's own severity", () => {
  for (const severity of ["INFO", "WARNING", "ERROR"] as const) {
    const recommendation = buildRecommendation(makeIssue("Duplicate hunks", severity));
    assert.equal(recommendation.priority, severity);
  }
});

test("RecommendationEngine.generate() and buildRecommendationSet() agree", () => {
  const result: ValidationResult = {
    reports: [{ id: "r1", patchId: "p1", passed: false, score: 60, issues: [makeIssue("Empty patch", "ERROR", "p1")] }],
  };
  const engine = new RecommendationEngine();

  assert.deepEqual(engine.generate(result), buildRecommendationSet(result));
});

test("multiple reports: buildRecommendationSet() flattens every report's issues, in order", () => {
  const result: ValidationResult = {
    reports: [
      { id: "r1", patchId: "p1", passed: true, score: 85, issues: [makeIssue("Placeholder diff detected", "WARNING", "p1")] },
      { id: "r2", patchId: "p2", passed: false, score: 20, issues: [makeIssue("Empty patch", "ERROR", "p2"), makeIssue("Duplicate hunks", "WARNING", "p2")] },
      { id: "r3", patchId: "p3", passed: true, score: 100, issues: [] },
    ],
  };

  const set = buildRecommendationSet(result);

  assert.equal(set.recommendations.length, 3);
  assert.deepEqual(
    set.recommendations.map((r) => r.validationIssueId),
    result.reports.flatMap((r) => r.issues.map((i) => i.id))
  );
});

test("concentrated-monorepo fixture: buildRecommendationSet() produces one recommendation per real ValidationIssue", () => {
  const validationResult = validationResultFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const set = buildRecommendationSet(validationResult);
  const expectedIssueCount = validationResult.reports.reduce((total, report) => total + report.issues.length, 0);

  assert.equal(set.recommendations.length, expectedIssueCount);
  assert.ok(set.recommendations.length > 0);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture (zero reports): buildRecommendationSet() produces zero recommendations, never a fabricated one`, () => {
    const validationResult = validationResultFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    const set = buildRecommendationSet(validationResult);
    assert.deepEqual(set.recommendations, []);
  });
}

test("identity is deterministic: running the same ValidationResult twice produces byte-identical recommendation ids", () => {
  const validationResult = validationResultFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const first = buildRecommendationSet(validationResult);
  const second = buildRecommendationSet(validationResult);

  assert.deepEqual(first, second);
});

test("snapshot: concentrated-monorepo's full RecommendationSet matches the stored snapshot", () => {
  const validationResult = validationResultFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual: RecommendationSet = buildRecommendationSet(validationResult);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const validationResult = validationResultFor(repoRoot);
  const set = buildRecommendationSet(validationResult);

  for (const recommendation of set.recommendations) {
    assert.ok(recommendation.title.length > 0);
    assert.ok(recommendation.description.length > 0);
    assert.ok(["INFO", "WARNING", "ERROR"].includes(recommendation.priority));
  }
});
