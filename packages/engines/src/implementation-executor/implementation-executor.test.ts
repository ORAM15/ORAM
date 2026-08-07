/**
 * Regression coverage for the Implementation Executor (Capability Sprint 8).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - MemoryAdapter: every one of the 9 actions reports SUCCESS, deterministically, with no side effects
 *   - RealAdapter: every one of the 9 actions throws NotImplementedYetError, unconditionally
 *   - Executor: dispatches all 9 actions correctly; aggregates a full plan's steps into one ExecutionResult
 *   - Failure handling: a step that fails stops execution -- every remaining step is SKIPPED, the overall
 *     result is FAILED, and `failure` names the first (only) step that actually failed
 *   - Zero-step execution: an ExecutionPlan with no steps produces a SUCCESS result with an informational log
 *   - the full pipeline (through executeAll()) against the concentrated-monorepo fixture, the existing
 *     monorepo fixture, the 4 zero-plan fixtures, identity determinism, a stored JSON snapshot, and a smoke
 *     test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/implementation-executor/implementation-executor.test.ts
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
import type { ExecutionAction, ExecutionPlan, ExecutionPlanSet } from "../execution-planning/analysis/types";
import { MemoryCommandAdapter, MemoryFileAdapter, MemoryGitAdapter } from "./adapters/MemoryAdapters";
import { NotImplementedYetError, RealCommandAdapter, RealFileAdapter, RealGitAdapter } from "./adapters/RealAdapters";
import type { AdapterResult, ExecutorAdapters, GitAdapter } from "./adapters/types";
import { ImplementationExecutor, executeAll } from "./ImplementationExecutor";
import type { ExecutionResult } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "results-concentrated-monorepo.snap.json");

const ALL_ACTIONS: ReadonlyArray<ExecutionAction> = [
  "CREATE_BRANCH",
  "CREATE_FILE",
  "MODIFY_FILE",
  "DELETE_FILE",
  "RUN_TESTS",
  "RUN_LINTER",
  "RUN_FORMATTER",
  "COMMIT",
  "OPEN_PULL_REQUEST",
];

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

function makeStep(action: ExecutionAction, order = 0): ExecutionPlan["steps"][number] {
  return { id: `execution-step:synthetic-${order}-${action}`, order, action, description: `synthetic ${action} step` };
}

function makePlan(steps: ExecutionPlan["steps"]): ExecutionPlan {
  return { id: "execution-plan:synthetic", requestId: "implementation-request:synthetic", title: "Synthetic Plan", priority: "Medium", steps, dependencyIds: [], order: 0 };
}

function normalizeResult(result: ExecutionResult): unknown {
  return {
    ...result,
    startedAt: "<normalized>",
    finishedAt: "<normalized>",
    steps: result.steps.map((step) => ({ ...step, startedAt: "<normalized>", finishedAt: "<normalized>" })),
    logs: result.logs.map((log) => ({ ...log, timestamp: "<normalized>" })),
  };
}

test("MemoryAdapter: all 9 actions report SUCCESS with an honest 'nothing real happened' message", () => {
  const git = new MemoryGitAdapter();
  const file = new MemoryFileAdapter();
  const command = new MemoryCommandAdapter();

  const results: AdapterResult[] = [
    git.createBranch(makeStep("CREATE_BRANCH")),
    git.commit(makeStep("COMMIT")),
    git.openPullRequest(makeStep("OPEN_PULL_REQUEST")),
    file.createFile(makeStep("CREATE_FILE")),
    file.modifyFile(makeStep("MODIFY_FILE")),
    file.deleteFile(makeStep("DELETE_FILE")),
    command.runTests(makeStep("RUN_TESTS")),
    command.runLinter(makeStep("RUN_LINTER")),
    command.runFormatter(makeStep("RUN_FORMATTER")),
  ];

  for (const result of results) {
    assert.equal(result.outcome, "SUCCESS");
    assert.ok(result.message.includes("no git, filesystem, or shell command was actually run"));
  }
});

test("RealAdapter: all 9 actions throw NotImplementedYetError, unconditionally", () => {
  const git = new RealGitAdapter();
  const file = new RealFileAdapter();
  const command = new RealCommandAdapter();

  assert.throws(() => git.createBranch(makeStep("CREATE_BRANCH")), NotImplementedYetError);
  assert.throws(() => git.commit(makeStep("COMMIT")), NotImplementedYetError);
  assert.throws(() => git.openPullRequest(makeStep("OPEN_PULL_REQUEST")), NotImplementedYetError);
  assert.throws(() => file.createFile(makeStep("CREATE_FILE")), NotImplementedYetError);
  assert.throws(() => file.modifyFile(makeStep("MODIFY_FILE")), NotImplementedYetError);
  assert.throws(() => file.deleteFile(makeStep("DELETE_FILE")), NotImplementedYetError);
  assert.throws(() => command.runTests(makeStep("RUN_TESTS")), NotImplementedYetError);
  assert.throws(() => command.runLinter(makeStep("RUN_LINTER")), NotImplementedYetError);
  assert.throws(() => command.runFormatter(makeStep("RUN_FORMATTER")), NotImplementedYetError);
});

test("Executor: dispatches all 9 actions to the correct adapter method, in order", () => {
  const plan = makePlan(ALL_ACTIONS.map((action, index) => makeStep(action, index)));
  const executor = new ImplementationExecutor(); // default MemoryAdapter

  const result = executor.execute(plan);

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.failure, null);
  assert.equal(result.steps.length, 9);
  assert.deepEqual(
    result.steps.map((s) => s.action),
    ALL_ACTIONS
  );
  for (const step of result.steps) assert.equal(step.status, "SUCCESS");
});

test("Failure handling: a failing step stops execution -- every remaining step is SKIPPED, overall status is FAILED", () => {
  const failingGit: GitAdapter = {
    createBranch: () => ({ outcome: "FAILED", message: "simulated failure: could not create branch" }),
    commit: () => ({ outcome: "SUCCESS", message: "unreachable" }),
    openPullRequest: () => ({ outcome: "SUCCESS", message: "unreachable" }),
  };
  const adapters: ExecutorAdapters = { git: failingGit, file: new MemoryFileAdapter(), command: new MemoryCommandAdapter() };
  const executor = new ImplementationExecutor(adapters);

  const plan = makePlan([makeStep("CREATE_BRANCH", 0), makeStep("CREATE_FILE", 1), makeStep("RUN_TESTS", 2), makeStep("COMMIT", 3)]);
  const result = executor.execute(plan);

  assert.equal(result.status, "FAILED");
  assert.ok(result.failure);
  assert.equal(result.failure!.stepId, plan.steps[0]!.id);
  assert.equal(result.failure!.action, "CREATE_BRANCH");
  assert.equal(result.failure!.reason, "simulated failure: could not create branch");

  assert.equal(result.steps[0]!.status, "FAILED");
  assert.equal(result.steps[1]!.status, "SKIPPED");
  assert.equal(result.steps[2]!.status, "SKIPPED");
  assert.equal(result.steps[3]!.status, "SKIPPED");
  for (const step of result.steps.slice(1)) assert.ok(step.message.includes("Skipped because"));
});

test("Failure handling: an adapter that throws is caught and treated as a FAILED step, not an uncaught exception", () => {
  const throwingGit: GitAdapter = {
    createBranch: () => {
      throw new Error("boom");
    },
    commit: () => ({ outcome: "SUCCESS", message: "unreachable" }),
    openPullRequest: () => ({ outcome: "SUCCESS", message: "unreachable" }),
  };
  const adapters: ExecutorAdapters = { git: throwingGit, file: new MemoryFileAdapter(), command: new MemoryCommandAdapter() };
  const executor = new ImplementationExecutor(adapters);

  const plan = makePlan([makeStep("CREATE_BRANCH")]);
  const result = executor.execute(plan);

  assert.equal(result.status, "FAILED");
  assert.equal(result.steps[0]!.status, "FAILED");
  assert.equal(result.steps[0]!.message, "boom");
});

test("Zero-step execution: an ExecutionPlan with no steps produces a SUCCESS result with one informational log", () => {
  const executor = new ImplementationExecutor();
  const plan = makePlan([]);

  const result = executor.execute(plan);

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.failure, null);
  assert.deepEqual(result.steps, []);
  assert.equal(result.logs.length, 1);
  assert.equal(result.logs[0]!.level, "INFO");
  assert.equal(result.logs[0]!.message, "No execution steps to run.");
  assert.equal(result.logs[0]!.stepId, null);
});

test("concentrated-monorepo fixture: executeAll() produces one SUCCESS result per plan", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const results = executeAll(planSet);

  assert.equal(results.length, 2);
  for (const result of results) {
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.failure, null);
    assert.equal(result.steps.length, 4);
    for (const step of result.steps) assert.equal(step.status, "SUCCESS");
  }
});

test("existing monorepo fixture: executeAll() produces one result for the single plan", () => {
  const planSet = planSetFor(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));
  const results = executeAll(planSet);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.status, "SUCCESS");
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture: zero plans produces zero results, never a fabricated one`, () => {
    const planSet = planSetFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    const results = executeAll(planSet);
    assert.deepEqual(results, []);
  });
}

test("identity is deterministic: executing the same plan set twice produces byte-identical step and log ids", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const first = executeAll(planSet);
  const second = executeAll(planSet);

  assert.deepEqual(
    first.flatMap((r) => r.steps.map((s) => s.stepId)).sort(),
    second.flatMap((r) => r.steps.map((s) => s.stepId)).sort()
  );
  assert.deepEqual(
    first.flatMap((r) => r.logs.map((l) => l.id)).sort(),
    second.flatMap((r) => r.logs.map((l) => l.id)).sort()
  );
});

test("snapshot: concentrated-monorepo's full ExecutionResult[] matches the stored snapshot", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const results = executeAll(planSet);
  const actual = results.map(normalizeResult);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const planSet = planSetFor(repoRoot);
  const results = executeAll(planSet);

  for (const result of results) {
    assert.ok(["SUCCESS", "FAILED"].includes(result.status));
    assert.ok(typeof result.startedAt === "string" && Number.isFinite(Date.parse(result.startedAt)));
  }
});
