/**
 * Regression coverage for Execution Planning (Capability Sprint 7).
 *
 * Runs the full pipeline (buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning
 * -> buildEngineeringPlan -> buildMissionGraph -> buildImplementationRequests -> buildExecutionPlans)
 * against:
 *   - the concentrated-monorepo fixture (2 real requests from Sprint 6), proving: exactly one plan per
 *     request, in the request set's own order; each plan's 4-step CREATE_BRANCH/[title-templated]/
 *     RUN_TESTS/COMMIT shape; the linear dependency chain (plan 2 depends on exactly plan 1); the
 *     "Increase Test Coverage" title maps to the exact CREATE_FILE step this Sprint's own spec example shows
 *   - the existing monorepo fixture (1 request), proving a single-plan set has zero dependencies
 *   - the 4 fixtures that produce zero requests, proving zero plans is the honest result, not a crash
 *   - a hand-built ImplementationRequestSet with an unrecognized title, proving DEFAULT_STEP fires instead
 *     of guessing
 *   - identity determinism
 *   - a stored JSON snapshot of the full ExecutionPlanSet produced for concentrated-monorepo (timestamps
 *     normalized), the same technique already used for every prior stage
 *
 * Run with: node --import tsx --test packages/engines/src/execution-planning/execution-planning.test.ts
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
import type { ImplementationRequest, ImplementationRequestSet } from "../implementation-requests/analysis/types";
import { buildExecutionPlans } from "./analysis/build-execution-plans";
import type { ExecutionPlan, ExecutionPlanSet } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "plans-concentrated-monorepo.snap.json");

/** Same loader-independent walk-up used throughout this package's siblings. */
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

function plansFor(root: string): ExecutionPlanSet {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  return buildExecutionPlans(requestSet);
}

function assertWellFormedPlan(plan: ExecutionPlan): void {
  assert.equal(typeof plan.id, "string");
  assert.ok(plan.id.length > 0);
  assert.equal(typeof plan.requestId, "string");
  assert.ok(plan.requestId.length > 0);
  assert.ok(plan.title.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(plan.priority));
  assert.equal(typeof plan.order, "number");
  assert.ok(plan.order >= 0);
  assert.ok(Array.isArray(plan.dependencyIds));
  assert.equal(plan.steps.length, 4, "every plan in this MVP has exactly 4 steps");
  assert.deepEqual(
    plan.steps.map((s) => s.action),
    ["CREATE_BRANCH", plan.steps[1]!.action, "RUN_TESTS", "COMMIT"]
  );
  plan.steps.forEach((step, index) => {
    assert.equal(step.order, index);
    assert.ok(step.description.length > 0);
  });
}

test("concentrated-monorepo fixture: 2 plans form one linear dependency chain, matching this Sprint's own example shape", () => {
  const planSet = plansFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.equal(planSet.plans.length, 2);
  const [first, second] = planSet.plans as [ExecutionPlan, ExecutionPlan];

  assert.equal(first.title, "Improve Subsystem Documentation");
  assert.equal(first.order, 0);
  assert.deepEqual(first.dependencyIds, []);

  assert.equal(second.title, "Increase Test Coverage");
  assert.equal(second.order, 1);
  assert.deepEqual(second.dependencyIds, [first.id]);
  assert.deepEqual(
    second.steps.map((s) => s.action),
    ["CREATE_BRANCH", "CREATE_FILE", "RUN_TESTS", "COMMIT"]
  );
  assert.equal(second.steps[1]!.description, "Create missing automated tests covering the identified gap.");

  assert.equal(planSet.dependencies.length, 1);
  assert.equal(planSet.dependencies[0]!.planId, second.id);
  assert.equal(planSet.dependencies[0]!.dependsOnPlanId, first.id);
  assert.deepEqual(planSet.executionOrder, [first.id, second.id]);

  for (const plan of planSet.plans) assertWellFormedPlan(plan);
});

test("existing monorepo fixture: a single plan has no dependencies", () => {
  const planSet = plansFor(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));
  assert.equal(planSet.plans.length, 1);
  assert.deepEqual(planSet.plans[0]!.dependencyIds, []);
  assert.deepEqual(planSet.dependencies, []);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture: zero requests produces zero plans, never a fabricated one`, () => {
    const planSet = plansFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    assert.deepEqual(planSet.plans, []);
    assert.deepEqual(planSet.dependencies, []);
    assert.deepEqual(planSet.executionOrder, []);
  });
}

test("unrecognized request title: falls back to DEFAULT_STEP instead of guessing", () => {
  const makeRequest = (id: string, title: string): ImplementationRequest => ({
    id,
    missionId: `mission:${id}`,
    title,
    priority: "Medium",
    rationale: "synthetic",
    goal: "synthetic",
    expectedImpact: "synthetic",
    estimatedEffort: "Small",
    implementationTargets: [],
    acceptanceCriteria: [],
    constraints: [],
  });
  const requestSet: ImplementationRequestSet = {
    sourceProjectName: "synthetic-project",
    sourceTimestamp: "2026-01-01T00:00:00.000Z",
    requests: [makeRequest("implementation-request:unknown", "Some Future Mission Type")],
    timestamp: "2026-01-01T00:00:01.000Z",
  };

  const planSet = buildExecutionPlans(requestSet);

  assert.equal(planSet.plans.length, 1);
  assert.equal(planSet.plans[0]!.steps[1]!.action, "MODIFY_FILE");
  assert.equal(planSet.plans[0]!.steps[1]!.description, "Implement the changes described in this request's acceptance criteria.");
});

test("identity is deterministic: building the same plan set twice produces byte-identical ids", () => {
  const first = plansFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const second = plansFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.deepEqual(
    first.plans.map((p) => p.id).sort(),
    second.plans.map((p) => p.id).sort()
  );
  assert.deepEqual(
    first.dependencies.map((d) => d.id).sort(),
    second.dependencies.map((d) => d.id).sort()
  );
});

test("snapshot: concentrated-monorepo's full ExecutionPlanSet matches the stored snapshot", () => {
  const planSet = plansFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = { ...planSet, sourceTimestamp: "<normalized>", timestamp: "<normalized>" };
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const planSet = plansFor(repoRoot);

  assert.ok(typeof planSet.timestamp === "string" && Number.isFinite(Date.parse(planSet.timestamp)));
  for (const plan of planSet.plans) assertWellFormedPlan(plan);
});
