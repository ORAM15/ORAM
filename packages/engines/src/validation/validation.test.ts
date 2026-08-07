/**
 * Regression coverage for the Validation Engine (Capability Sprint 10).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - a valid patch (well-formed diff, no rule fires -> passed=true, score=100, issues=[])
 *   - a placeholder patch (MemoryProvider's own real simulated output -> WARNING only, still passes)
 *   - a malformed diff (mismatched "---"/"+++" header counts -> ERROR, fails)
 *   - an empty patch (ERROR, fails)
 *   - multiple patches (validateAll() batch behavior)
 *   - a stored JSON snapshot of the full ValidationResult for concentrated-monorepo's patches
 *   - identity determinism (running the same patches twice produces byte-identical ids and reports)
 *   - a smoke test against this actual repository
 * Also covers the two remaining rule examples from the spec not otherwise exercised above (diff too large,
 * duplicate hunks) and the missing-file-headers/invalid-header distinction directly at the rules level.
 *
 * Run with: node --import tsx --test packages/engines/src/validation/validation.test.ts
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
import { buildPromptArtifact } from "../provider-execution/analysis/build-prompt";
import { buildPatchArtifact } from "../provider-execution/analysis/build-patch";
import { MemoryProvider } from "../provider-execution/providers/MemoryProvider";
import type { ExecutionAction, ExecutionPlanSet, ExecutionStep } from "../execution-planning/analysis/types";
import type { PatchArtifact } from "../provider-execution/analysis/types";
import { evaluatePatch } from "./analysis/rules";
import { buildValidationReport } from "./analysis/build-validation-report";
import { ValidationEngine, validateAll } from "./ValidationEngine";
import type { ValidationResult } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "results-concentrated-monorepo.snap.json");

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

function planSetFor(root: string): ExecutionPlanSet {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  return buildExecutionPlans(requestSet);
}

function patchesFor(root: string): PatchArtifact[] {
  const planSet = planSetFor(root);
  const results = runProviderExecutionAll(planSet);
  return results.flatMap((result) => result.steps.map((step) => step.patch));
}

function makeStep(action: ExecutionAction, order = 0, description = `synthetic ${action} step`): ExecutionStep {
  return { id: `execution-step:synthetic-${order}-${action}`, order, action, description };
}

/** Builds a real PatchArtifact from a real MemoryProvider response, then overrides `unifiedDiff` for the test's own scenario -- keeps `id`/`responseId` genuine while letting each test control exactly the diff text under review. */
function patchWithDiff(unifiedDiff: string): PatchArtifact {
  const prompt = buildPromptArtifact(makeStep("MODIFY_FILE"));
  const response = new MemoryProvider().generate(prompt);
  const patch = buildPatchArtifact(response);
  return { ...patch, unifiedDiff };
}

function normalizeResult(result: ValidationResult): unknown {
  return result;
}

test("valid patch: a well-formed diff with no placeholder marker passes with a perfect score", () => {
  const patch = patchWithDiff("--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,1 +1,1 @@\n-const x = 1;\n+const x = 2;\n");
  const report = buildValidationReport(patch);

  assert.equal(report.patchId, patch.id);
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.deepEqual(report.issues, []);
});

test("placeholder patch: MemoryProvider's own real simulated output is flagged WARNING but still passes", () => {
  const prompt = buildPromptArtifact(makeStep("CREATE_FILE"));
  const response = new MemoryProvider().generate(prompt);
  const patch = buildPatchArtifact(response);

  const report = buildValidationReport(patch);

  assert.equal(report.passed, true);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0]!.severity, "WARNING");
  assert.equal(report.issues[0]!.title, "Placeholder diff detected");
  assert.equal(report.score, 85);
});

test("malformed diff: mismatched '---'/'+++' header counts is an ERROR and fails the report", () => {
  const patch = patchWithDiff("--- a/src/foo.ts\n--- a/src/bar.ts\n+++ b/src/foo.ts\n@@ -1,1 +1,1 @@\n+x\n");
  const report = buildValidationReport(patch);

  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.title === "Invalid unified diff header" && issue.severity === "ERROR"));
});

test("empty patch: an empty unifiedDiff is an ERROR and fails the report", () => {
  const patch = patchWithDiff("   \n  ");
  const report = buildValidationReport(patch);

  assert.equal(report.passed, false);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0]!.title, "Empty patch");
  assert.equal(report.score, 60);
});

test("rules: missing file headers (no '---'/'+++' at all) is a distinct ERROR from a mismatched-count invalid header", () => {
  const patch = patchWithDiff("@@ -1,1 +1,1 @@\n-a\n+b\n");
  const issues = evaluatePatch(patch);

  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.title, "Missing file headers");
});

test("rules: diff too large is flagged as a WARNING", () => {
  const hugeDiff = "--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n" + "+x".repeat(20000);
  const patch = patchWithDiff(hugeDiff);
  const issues = evaluatePatch(patch);

  assert.ok(issues.some((issue) => issue.title === "Diff too large" && issue.severity === "WARNING"));
});

test("rules: a repeated identical hunk header is flagged as duplicate hunks", () => {
  const diff = "--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -1,1 +1,1 @@\n-c\n+d\n";
  const patch = patchWithDiff(diff);
  const issues = evaluatePatch(patch);

  assert.ok(issues.some((issue) => issue.title === "Duplicate hunks" && issue.severity === "WARNING"));
});

test("ValidationEngine.validate() and validateAll() agree for a single patch", () => {
  const patch = patchWithDiff("--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n-a\n+b\n");
  const engine = new ValidationEngine();

  const direct = engine.validate(patch);
  const batched = validateAll([patch], engine);

  assert.deepEqual(batched.reports, [direct]);
});

test("multiple patches: validateAll() produces one report per patch, in order", () => {
  const patches = [
    patchWithDiff("--- a/a\n+++ b/a\n@@ -1,1 +1,1 @@\n-a\n+b\n"),
    patchWithDiff(""),
    patchWithDiff("--- a/c\n@@ -1,1 +1,1 @@\n-a\n+b\n"),
  ];

  const result = validateAll(patches);

  assert.equal(result.reports.length, 3);
  result.reports.forEach((report, index) => assert.equal(report.patchId, patches[index]!.id));
  assert.equal(result.reports[0]!.passed, true);
  assert.equal(result.reports[1]!.passed, false);
  assert.equal(result.reports[2]!.passed, false);
});

test("concentrated-monorepo fixture: validateAll() produces one report per real PatchArtifact", () => {
  const patches = patchesFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const result = validateAll(patches);

  assert.equal(result.reports.length, patches.length);
  assert.ok(result.reports.length > 0);
  result.reports.forEach((report) => assert.ok(report.issues.every((issue) => issue.patchId === report.patchId)));
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture (zero patches): validateAll() produces zero reports, never a fabricated one`, () => {
    const patches = patchesFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    const result = validateAll(patches);
    assert.deepEqual(result.reports, []);
  });
}

test("identity is deterministic: validating the same patches twice produces byte-identical report/issue ids", () => {
  const patches = patchesFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const first = validateAll(patches);
  const second = validateAll(patches);

  assert.deepEqual(first, second);
});

test("snapshot: concentrated-monorepo's full ValidationResult matches the stored snapshot", () => {
  const patches = patchesFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = normalizeResult(validateAll(patches));
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const patches = patchesFor(repoRoot);
  const result = validateAll(patches);

  for (const report of result.reports) {
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.equal(report.passed, !report.issues.some((issue) => issue.severity === "ERROR"));
  }
});
