/**
 * Regression coverage for Engineering Memory & Run History (Capability Sprint 13).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - empty history (MemoryStore with zero saves)
 *   - one run
 *   - many runs (single repository)
 *   - multiple repositories
 *   - statistics (explicit, hand-computed averages)
 *   - a stored JSON snapshot of buildRunSnapshot()'s output for concentrated-monorepo
 *   - deterministic ids (repositoryId stable per repository AND machine-independent -- derived from the
 *     repository root's basename, never its absolute path, so Windows/Linux/macOS checkouts of the same
 *     repository agree; runId unique per snapshot)
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/memory/memory.test.ts
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
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import { buildRunSnapshot, makeRepositoryId } from "./analysis/build-run-snapshot";
import type { RunSnapshot, RunSnapshotInputs } from "./analysis/types";
import { MemoryStore } from "./MemoryStore";
import { MemoryEngine } from "./MemoryEngine";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "run-snapshot-concentrated-monorepo.snap.json");

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

function snapshotInputsFor(root: string): RunSnapshotInputs {
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
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  return { repositoryRoot: root, analysis, knowledge, reasoning, plan, graph, requestSet, planSet, validationResult, recommendationSet, reflectionReport };
}

function makeSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    repositoryId: "repository:synthetic",
    runId: `run:synthetic-${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    analysisSummary: "synthetic-project -- 1 file(s) scanned.",
    knowledgeSummary: "0 subsystem(s), 0 relationship(s) identified.",
    reasoningSummary: "0 finding(s) identified.",
    planningSummary: "0 mission(s) planned.",
    missionCount: 0,
    requestCount: 0,
    executionPlanCount: 0,
    validationScore: 100,
    recommendationCount: 0,
    reflectionSummary: "All 0 validated patch(es) passed without any issues.",
    retryRecommended: false,
    overallConfidence: 1,
    ...overrides,
  };
}

function normalizeSnapshot(snapshot: RunSnapshot): unknown {
  return { ...snapshot, runId: "<normalized>", timestamp: "<normalized>" };
}

// ---------------------------------------------------------------------------------------------------------
// buildRunSnapshot()
// ---------------------------------------------------------------------------------------------------------

test("buildRunSnapshot: fields are carried through from already-computed pipeline output, not re-derived", () => {
  const inputs = snapshotInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const snapshot = buildRunSnapshot(inputs);

  assert.equal(snapshot.missionCount, inputs.graph.missions.length);
  assert.equal(snapshot.requestCount, inputs.requestSet.requests.length);
  assert.equal(snapshot.executionPlanCount, inputs.planSet.plans.length);
  assert.equal(snapshot.recommendationCount, inputs.recommendationSet.recommendations.length);
  assert.equal(snapshot.reflectionSummary, inputs.reflectionReport.summary);
  assert.equal(snapshot.retryRecommended, inputs.reflectionReport.retryRecommended);
  assert.equal(snapshot.overallConfidence, inputs.reflectionReport.confidence);
  assert.ok(snapshot.analysisSummary.includes(inputs.analysis.projectName));
});

test("deterministic ids: the same repositoryRoot always produces the same repositoryId", () => {
  const inputs = snapshotInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const first = buildRunSnapshot(inputs);
  const second = buildRunSnapshot(inputs);

  assert.equal(first.repositoryId, second.repositoryId);
  assert.notEqual(first.repositoryId, buildRunSnapshot(snapshotInputsFor(path.join(REPO_ANALYZER_FIXTURES, "minimal"))).repositoryId);
});

test("deterministic ids: repositoryId is machine-independent -- basename-derived, never the absolute path", () => {
  // The regression this guards: an absolute-path-derived id baked each machine's directory layout into the
  // stored snapshot (repository:d-brdr-... on one machine vs repository:home-runner-... on CI).
  const inputs = snapshotInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  assert.equal(buildRunSnapshot(inputs).repositoryId, "repository:concentrated-monorepo");
});

test("makeRepositoryId: Windows-style and POSIX-style paths to the same repository produce the same id", () => {
  const fromWindows = makeRepositoryId("D:\\work\\ORAM");
  const fromLinuxCi = makeRepositoryId("/home/runner/work/ORAM/ORAM");
  const fromMacos = makeRepositoryId("/Users/dev/ORAM");

  assert.equal(fromWindows, "repository:oram");
  assert.equal(fromLinuxCi, fromWindows);
  assert.equal(fromMacos, fromWindows);
});

test("deterministic ids: runId is unique per snapshot, never repeated", () => {
  const inputs = snapshotInputsFor(path.join(REPO_ANALYZER_FIXTURES, "minimal"));
  const ids = new Set(Array.from({ length: 20 }, () => buildRunSnapshot(inputs).runId));
  assert.equal(ids.size, 20);
});

// ---------------------------------------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------------------------------------

test("empty history: a fresh MemoryStore reports zero runs, never fabricated data", () => {
  const store = new MemoryStore();

  assert.equal(store.latest(), null);
  assert.deepEqual(store.history(), { snapshots: [] });
  assert.equal(store.bestRun(), null);
  assert.equal(store.worstRun(), null);
  assert.equal(store.averageScore(), 0);

  const stats = store.statistics();
  assert.equal(stats.totalRuns, 0);
  assert.equal(stats.bestScore, null);
  assert.equal(stats.worstScore, null);
  assert.equal(stats.averageValidationScore, 0);
});

test("one run: latest/history/statistics/bestRun/worstRun all reflect the single saved snapshot", () => {
  const store = new MemoryStore();
  const snapshot = makeSnapshot({ validationScore: 82 });
  store.save(snapshot);

  assert.deepEqual(store.latest(), snapshot);
  assert.deepEqual(store.history().snapshots, [snapshot]);
  assert.deepEqual(store.bestRun(), snapshot);
  assert.deepEqual(store.worstRun(), snapshot);
  assert.equal(store.averageScore(), 82);

  const stats = store.statistics();
  assert.equal(stats.totalRuns, 1);
  assert.equal(stats.bestScore, 82);
  assert.equal(stats.worstScore, 82);
  assert.equal(stats.averageRetryRate, 0);
});

test("many runs (single repository): bestRun/worstRun/averageScore/history reflect every saved snapshot", () => {
  const store = new MemoryStore();
  const runs = [
    makeSnapshot({ runId: "run:1", timestamp: "2026-01-01T00:00:00.000Z", validationScore: 60, retryRecommended: true }),
    makeSnapshot({ runId: "run:2", timestamp: "2026-01-02T00:00:00.000Z", validationScore: 90, retryRecommended: false }),
    makeSnapshot({ runId: "run:3", timestamp: "2026-01-03T00:00:00.000Z", validationScore: 75, retryRecommended: false }),
  ];
  runs.forEach((run) => store.save(run));

  assert.deepEqual(store.latest(), runs[2]);
  assert.deepEqual(
    store.history().snapshots.map((s) => s.runId),
    ["run:1", "run:2", "run:3"]
  );
  assert.deepEqual(store.bestRun(), runs[1]);
  assert.deepEqual(store.worstRun(), runs[0]);
  assert.equal(store.averageScore(), 75); // (60 + 90 + 75) / 3 = 75

  const stats = store.statistics();
  assert.equal(stats.totalRuns, 3);
  assert.equal(stats.bestScore, 90);
  assert.equal(stats.worstScore, 60);
  assert.ok(Math.abs(stats.averageRetryRate - 1 / 3) < 1e-9);
});

test("multiple repositories: repositoryId-scoped queries never leak another repository's runs", () => {
  const store = new MemoryStore();
  const repoA1 = makeSnapshot({ repositoryId: "repository:a", runId: "a-1", timestamp: "2026-01-01T00:00:00.000Z", validationScore: 100 });
  const repoA2 = makeSnapshot({ repositoryId: "repository:a", runId: "a-2", timestamp: "2026-01-02T00:00:00.000Z", validationScore: 50 });
  const repoB1 = makeSnapshot({ repositoryId: "repository:b", runId: "b-1", timestamp: "2026-01-01T12:00:00.000Z", validationScore: 20 });
  [repoA1, repoA2, repoB1].forEach((run) => store.save(run));

  assert.deepEqual(store.latest("repository:a"), repoA2);
  assert.deepEqual(store.latest("repository:b"), repoB1);
  assert.deepEqual(
    store.history("repository:a").snapshots.map((s) => s.runId),
    ["a-1", "a-2"]
  );
  assert.equal(store.averageScore("repository:a"), 75);
  assert.equal(store.averageScore("repository:b"), 20);
  assert.deepEqual(store.historyByRepository("repository:b"), { repositoryId: "repository:b", snapshots: [repoB1] });

  // Unscoped queries span every repository the store has ever recorded.
  assert.equal(store.history().snapshots.length, 3);
  assert.equal(store.statistics().totalRuns, 3);
});

test("statistics: averages are computed correctly across mixed data", () => {
  const store = new MemoryStore();
  store.save(makeSnapshot({ runId: "1", validationScore: 100, recommendationCount: 2, missionCount: 1, executionPlanCount: 1 }));
  store.save(makeSnapshot({ runId: "2", validationScore: 50, recommendationCount: 4, missionCount: 3, executionPlanCount: 3 }));

  const stats = store.statistics();
  assert.equal(stats.averageValidationScore, 75);
  assert.equal(stats.averageRecommendationCount, 3);
  assert.equal(stats.averageMissionCount, 2);
  assert.equal(stats.averageExecutionPlanCount, 2);
});

// ---------------------------------------------------------------------------------------------------------
// MemoryEngine
// ---------------------------------------------------------------------------------------------------------

test("MemoryEngine.record() builds a RunSnapshot and saves it into its own MemoryStore", () => {
  const engine = new MemoryEngine();
  const inputs = snapshotInputsFor(path.join(REPO_ANALYZER_FIXTURES, "minimal"));

  const snapshot = engine.record(inputs);

  assert.deepEqual(engine.memoryStore.latest(), snapshot);
  assert.equal(engine.memoryStore.history().snapshots.length, 1);
});

// ---------------------------------------------------------------------------------------------------------
// Snapshot + smoke test
// ---------------------------------------------------------------------------------------------------------

test("snapshot: concentrated-monorepo's RunSnapshot matches the stored snapshot", () => {
  const inputs = snapshotInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual = normalizeSnapshot(buildRunSnapshot(inputs));
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const inputs = snapshotInputsFor(repoRoot);
  const snapshot = buildRunSnapshot(inputs);

  assert.ok(snapshot.repositoryId.length > 0);
  assert.ok(snapshot.runId.length > 0);
  assert.ok(Number.isFinite(Date.parse(snapshot.timestamp)));
  assert.ok(snapshot.validationScore >= 0 && snapshot.validationScore <= 100);
});
