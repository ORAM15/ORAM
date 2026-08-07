/**
 * Regression coverage for Engineering Missions (Capability Sprint 5).
 *
 * Runs the full pipeline (buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning
 * -> buildEngineeringPlan -> buildMissionGraph) against:
 *   - the concentrated-monorepo fixture (2 real Missions from Sprint 2/4), proving the linear-chain
 *     dependency rule: Mission 0 has no dependencies and is first in executionOrder; Mission 1 depends on
 *     exactly Mission 0
 *   - the existing monorepo fixture (1 Mission), proving a single-Mission graph has zero dependencies
 *   - the 4 fixtures that produce zero Missions, proving an empty graph is the honest result, not a crash
 *   - a hand-built EngineeringPlan with 4 Missions, proving the chain generalizes past 2 nodes
 *   - a stored JSON snapshot of the full MissionGraph produced for concentrated-monorepo (timestamps
 *     normalized), the same snapshot technique already used for engineering-planning and the CLI reports
 *
 * Run with: node --import tsx --test packages/engines/src/engineering-missions/engineering-missions.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import type { EngineeringPlan, Mission as PlanMission } from "../engineering-planning/analysis/types";
import { buildMissionGraph } from "./analysis/build-mission-graph";
import type { MissionGraph, Mission } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "missions-concentrated-monorepo.snap.json");

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

function graphFor(root: string): MissionGraph {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  return buildMissionGraph(plan);
}

function assertWellFormedMission(mission: Mission): void {
  assert.equal(typeof mission.id, "string");
  assert.ok(mission.id.length > 0);
  assert.ok(mission.title.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(mission.priority));
  assert.ok(["Small", "Medium", "Large"].includes(mission.estimatedEffort));
  assert.ok(Array.isArray(mission.tasks));
  assert.ok(Array.isArray(mission.dependencyIds));
  assert.equal(typeof mission.order, "number");
  assert.ok(mission.order >= 0);
}

function normalizeSnapshot(graph: MissionGraph): unknown {
  return { ...graph, sourceTimestamp: "<normalized>", timestamp: "<normalized>" };
}

test("concentrated-monorepo fixture: 2 Missions form one linear dependency chain", () => {
  const graph = graphFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.equal(graph.missions.length, 2);
  const [first, second] = graph.missions as [Mission, Mission];

  assert.equal(first.kind, "improve-subsystem-documentation");
  assert.equal(first.order, 0);
  assert.deepEqual(first.dependencyIds, []);

  assert.equal(second.kind, "increase-test-coverage");
  assert.equal(second.order, 1);
  assert.deepEqual(second.dependencyIds, [first.id]);

  assert.equal(graph.dependencies.length, 1);
  assert.equal(graph.dependencies[0]!.missionId, second.id);
  assert.equal(graph.dependencies[0]!.dependsOnMissionId, first.id);

  assert.deepEqual(graph.executionOrder, [first.id, second.id]);

  for (const mission of graph.missions) assertWellFormedMission(mission);
});

test("existing monorepo fixture: a single Mission has no dependencies and is alone in executionOrder", () => {
  const graph = graphFor(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));

  assert.equal(graph.missions.length, 1);
  assert.deepEqual(graph.missions[0]!.dependencyIds, []);
  assert.equal(graph.missions[0]!.order, 0);
  assert.deepEqual(graph.dependencies, []);
  assert.deepEqual(graph.executionOrder, [graph.missions[0]!.id]);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture: zero Missions produces an empty MissionGraph, never a fabricated node`, () => {
    const graph = graphFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    assert.deepEqual(graph.missions, []);
    assert.deepEqual(graph.dependencies, []);
    assert.deepEqual(graph.executionOrder, []);
  });
}

test("hand-built 4-Mission plan: the linear chain generalizes past 2 nodes", () => {
  const makePlanMission = (kind: string, id: string): PlanMission => ({
    id,
    kind,
    title: kind,
    description: "synthetic",
    priority: "Medium",
    rationale: "synthetic",
    estimatedEffort: "Small",
    expectedImpact: "synthetic",
    tasks: [],
    sourceFindingIds: [],
  });
  const plan: EngineeringPlan = {
    sourceProjectName: "synthetic-project",
    sourceTimestamp: "2026-01-01T00:00:00.000Z",
    missions: [
      makePlanMission("a", "mission:a"),
      makePlanMission("b", "mission:b"),
      makePlanMission("c", "mission:c"),
      makePlanMission("d", "mission:d"),
    ],
    timestamp: "2026-01-01T00:00:01.000Z",
  };

  const graph = buildMissionGraph(plan);

  assert.equal(graph.missions.length, 4);
  assert.deepEqual(
    graph.missions.map((m) => m.dependencyIds),
    [[], ["mission:a"], ["mission:b"], ["mission:c"]]
  );
  assert.deepEqual(
    graph.missions.map((m) => m.order),
    [0, 1, 2, 3]
  );
  assert.equal(graph.dependencies.length, 3);
  assert.deepEqual(graph.executionOrder, ["mission:a", "mission:b", "mission:c", "mission:d"]);
});

test("identity is deterministic: building the same graph twice produces byte-identical Mission and MissionDependency ids", () => {
  const first = graphFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const second = graphFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.deepEqual(
    first.missions.map((m) => m.id).sort(),
    second.missions.map((m) => m.id).sort()
  );
  assert.deepEqual(
    first.dependencies.map((d) => d.id).sort(),
    second.dependencies.map((d) => d.id).sort()
  );
});

test("snapshot: concentrated-monorepo's full MissionGraph matches the stored snapshot", () => {
  const graph = graphFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = normalizeSnapshot(graph);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const graph = graphFor(repoRoot);

  assert.ok(typeof graph.timestamp === "string" && Number.isFinite(Date.parse(graph.timestamp)));
  for (const mission of graph.missions) assertWellFormedMission(mission);
});
