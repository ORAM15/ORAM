/**
 * Regression coverage for Implementation Requests (Capability Sprint 6).
 *
 * Runs the full pipeline (buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning
 * -> buildEngineeringPlan -> buildMissionGraph -> buildImplementationRequests) against:
 *   - the concentrated-monorepo fixture (2 real Missions from Sprint 2/4/5), proving: exactly one request
 *     per Mission, in the graph's executionOrder; the subsystem-extraction heuristic correctly finds
 *     "packages/shared"/"packages/utils" for the documentation Mission and correctly finds NONE for the
 *     repo-wide testing-gap Mission (proving it doesn't fabricate a target when none is textually present)
 *   - the existing monorepo fixture (1 Mission), proving a single-Mission graph produces a single request
 *   - the 4 fixtures that produce zero Missions, proving zero requests is the honest result, not a crash
 *   - identity determinism
 *   - a stored JSON snapshot of the full ImplementationRequestSet produced for concentrated-monorepo
 *     (timestamps normalized), the same technique already used for engineering-planning/engineering-missions
 *
 * Run with: node --import tsx --test packages/engines/src/implementation-requests/implementation-requests.test.ts
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
import { buildImplementationRequests } from "./analysis/build-implementation-requests";
import type { ImplementationRequest, ImplementationRequestSet } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "requests-concentrated-monorepo.snap.json");

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

function requestsFor(root: string): ImplementationRequestSet {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  return buildImplementationRequests(graph);
}

function assertWellFormedRequest(request: ImplementationRequest): void {
  assert.equal(typeof request.id, "string");
  assert.ok(request.id.length > 0);
  assert.equal(typeof request.missionId, "string");
  assert.ok(request.missionId.length > 0);
  assert.ok(request.title.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(request.priority));
  assert.ok(request.rationale.length > 0);
  assert.ok(request.goal.length > 0);
  assert.ok(request.expectedImpact.length > 0);
  assert.ok(["Small", "Medium", "Large"].includes(request.estimatedEffort));
  assert.ok(Array.isArray(request.implementationTargets));
  for (const target of request.implementationTargets) {
    assert.ok(target.subsystem.length > 0);
    assert.deepEqual(target.files, []);
  }
  assert.ok(Array.isArray(request.acceptanceCriteria));
  assert.ok(request.acceptanceCriteria.length > 0, "every request must have at least one acceptance criterion");
  for (const criterion of request.acceptanceCriteria) assert.ok(criterion.description.length > 0);
  assert.ok(Array.isArray(request.constraints));
  assert.ok(request.constraints.length >= 1, "every request must carry at least the universal constraint");
}

test("concentrated-monorepo fixture: exactly one request per Mission, in executionOrder", () => {
  const requestSet = requestsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.equal(requestSet.requests.length, 2);
  const [first, second] = requestSet.requests as [ImplementationRequest, ImplementationRequest];

  assert.equal(first.missionId, "mission:improve-subsystem-documentation");
  assert.deepEqual(
    first.implementationTargets.map((t) => t.subsystem),
    ["packages/shared", "packages/utils"]
  );

  assert.equal(second.missionId, "mission:increase-test-coverage");
  assert.deepEqual(second.implementationTargets, [], "a repo-wide Finding with no subsystem path must not fabricate a target");
  assert.equal(second.priority, "High");

  for (const request of requestSet.requests) assertWellFormedRequest(request);
});

test("existing monorepo fixture: a single Mission produces a single request", () => {
  const requestSet = requestsFor(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));
  assert.equal(requestSet.requests.length, 1);
  assertWellFormedRequest(requestSet.requests[0]!);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture: zero Missions produces zero requests, never a fabricated one`, () => {
    const requestSet = requestsFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    assert.deepEqual(requestSet.requests, []);
  });
}

test("identity is deterministic: building the same request set twice produces byte-identical ids", () => {
  const first = requestsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const second = requestsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.deepEqual(
    first.requests.map((r) => r.id).sort(),
    second.requests.map((r) => r.id).sort()
  );
});

test("snapshot: concentrated-monorepo's full ImplementationRequestSet matches the stored snapshot", () => {
  const requestSet = requestsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = { ...requestSet, sourceTimestamp: "<normalized>", timestamp: "<normalized>" };
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const requestSet = requestsFor(repoRoot);

  assert.ok(typeof requestSet.timestamp === "string" && Number.isFinite(Date.parse(requestSet.timestamp)));
  for (const request of requestSet.requests) assertWellFormedRequest(request);
});
