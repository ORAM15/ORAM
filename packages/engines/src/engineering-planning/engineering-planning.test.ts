/**
 * Regression coverage for Engineering Planning (Capability Sprint 2).
 *
 * Runs the full pipeline (buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning
 * -> buildEngineeringPlan) against:
 *   - the concentrated-monorepo fixture (engineering-reasoning's own fixture), which genuinely triggers both
 *     real mapping rules (opaque-subsystems -> Improve Subsystem Documentation, testing-gap -> Increase Test
 *     Coverage) alongside 3 unmapped Findings that correctly produce no Mission
 *   - the existing monorepo fixture, which triggers only the testing-gap mapping
 *   - the 4 fixtures that produce zero Findings, proving zero Missions is the honest result, not a crash
 *   - a hand-built EngineeringReasoning exercising the "circular-dependencies" mapping directly, since
 *     Engineering Reasoning does not emit that Finding kind yet (see ./analysis/rules.ts's own disclosed
 *     CONCRETE LIMITATION) -- this proves the mapping rule itself is correct even though no real pipeline
 *     run can trigger it today
 *   - a stored JSON snapshot of the full EngineeringPlan produced for concentrated-monorepo (timestamps
 *     normalized), the same snapshot technique this session already uses for the CLI's console report
 *
 * Run with: node --import tsx --test packages/engines/src/engineering-planning/engineering-planning.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import type { EngineeringReasoning, Finding } from "../engineering-reasoning/analysis/types";
import { buildEngineeringPlan } from "./analysis/build-plan";
import type { EngineeringPlan, Mission } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "plan-concentrated-monorepo.snap.json");

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

function planFor(root: string): EngineeringPlan {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  return buildEngineeringPlan(reasoning);
}

function kinds(missions: ReadonlyArray<Mission>): Set<string> {
  return new Set(missions.map((m) => m.kind));
}

function assertWellFormedMission(mission: Mission): void {
  assert.equal(typeof mission.id, "string");
  assert.ok(mission.id.length > 0);
  assert.equal(typeof mission.kind, "string");
  assert.ok(mission.kind.length > 0);
  assert.ok(mission.title.length > 0);
  assert.ok(mission.description.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(mission.priority));
  assert.ok(mission.rationale.length > 0);
  assert.ok(["Small", "Medium", "Large"].includes(mission.estimatedEffort));
  assert.ok(mission.expectedImpact.length > 0);
  assert.ok(Array.isArray(mission.tasks));
  assert.ok(mission.tasks.length > 0, "every Mission must have at least one task");
  assert.equal(mission.tasks.length, mission.sourceFindingIds.length);
  for (const task of mission.tasks) {
    assert.equal(typeof task.id, "string");
    assert.ok(task.id.length > 0);
    assert.ok(task.title.length > 0);
    assert.ok(task.description.length > 0);
    assert.ok(mission.sourceFindingIds.includes(task.sourceFindingId));
  }
}

function normalizeSnapshot(plan: EngineeringPlan): unknown {
  return { ...plan, sourceTimestamp: "<normalized>", timestamp: "<normalized>" };
}

test("concentrated-monorepo fixture: both real mapping rules fire, the third stays honestly silent", () => {
  const plan = planFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.equal(plan.missions.length, 2);
  assert.deepEqual(kinds(plan.missions), new Set(["improve-subsystem-documentation", "increase-test-coverage"]));

  const docsMission = plan.missions.find((m) => m.kind === "improve-subsystem-documentation")!;
  assert.equal(docsMission.title, "Improve Subsystem Documentation");
  assert.equal(docsMission.tasks.length, 1);
  assert.ok(docsMission.description.includes("1 finding"));

  const testingMission = plan.missions.find((m) => m.kind === "increase-test-coverage")!;
  assert.equal(testingMission.title, "Increase Test Coverage");
  assert.equal(testingMission.priority, "High"); // untested-api-surface's Finding severity is High
  assert.equal(testingMission.tasks.length, 1);
  assert.equal(testingMission.tasks[0]!.description.includes("Express"), true);

  for (const mission of plan.missions) assertWellFormedMission(mission);
});

test("existing monorepo fixture: only the testing-gap mapping fires", () => {
  const plan = planFor(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));

  assert.equal(plan.missions.length, 1);
  assert.equal(plan.missions[0]!.kind, "increase-test-coverage");
  assertWellFormedMission(plan.missions[0]!);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture: zero Findings produces zero Missions, never a fabricated one`, () => {
    const plan = planFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    assert.deepEqual(plan.missions, []);
  });
}

test("circular-dependencies mapping: fires correctly against a hand-built Finding (Engineering Reasoning does not emit this kind yet)", () => {
  const syntheticFinding: Finding = {
    id: "circular-dependencies:packages-a-packages-b",
    kind: "circular-dependencies",
    category: "architectural-smell",
    severity: "Medium",
    confidence: "Medium",
    summary: "packages/a and packages/b depend on each other, forming a circular dependency.",
    evidence: ["packages/a imports packages/b", "packages/b imports packages/a"],
    sourceFiles: ["packages/a/src/index.ts", "packages/b/src/index.ts"],
    sourceIds: ["subsystem:packages-a", "subsystem:packages-b"],
  };
  const reasoning: EngineeringReasoning = {
    sourceProjectName: "synthetic-project",
    sourceTimestamp: "2026-01-01T00:00:00.000Z",
    findings: [syntheticFinding],
    timestamp: "2026-01-01T00:00:01.000Z",
  };

  const plan = buildEngineeringPlan(reasoning);

  assert.equal(plan.missions.length, 1);
  const mission = plan.missions[0]!;
  assert.equal(mission.kind, "refactor-circular-dependencies");
  assert.equal(mission.title, "Refactor Circular Dependencies");
  assert.equal(mission.tasks.length, 1);
  assert.equal(mission.tasks[0]!.sourceFindingId, syntheticFinding.id);
  assert.equal(plan.sourceProjectName, "synthetic-project");
  assertWellFormedMission(mission);
});

test("identity is deterministic: planning the same fixture twice produces byte-identical Mission and MissionTask ids", () => {
  const first = planFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const second = planFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.deepEqual(
    first.missions.map((m) => m.id).sort(),
    second.missions.map((m) => m.id).sort()
  );
  assert.deepEqual(
    first.missions.flatMap((m) => m.tasks.map((t) => t.id)).sort(),
    second.missions.flatMap((m) => m.tasks.map((t) => t.id)).sort()
  );
});

test("snapshot: concentrated-monorepo's full EngineeringPlan matches the stored snapshot", () => {
  const plan = planFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = normalizeSnapshot(plan);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const plan = planFor(repoRoot);

  assert.ok(typeof plan.timestamp === "string" && Number.isFinite(Date.parse(plan.timestamp)));
  for (const mission of plan.missions) assertWellFormedMission(mission);
});
