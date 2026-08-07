/**
 * Regression coverage for the LLM Provider Layer (Capability Sprint 9).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - MemoryProvider: deterministic canned responses keyed by action, an unrecognized action falling back
 *     honestly rather than guessing, and that every response is well-formed
 *   - ProviderExecutionEngine: builds one PromptArtifact/LLMResponse/PatchArtifact triple per step, in order,
 *     with correct id linkage (prompt.executionStepId, response.promptId, patch.responseId)
 *   - zero plans (a zero-request fixture -> zero ProviderExecutionResults, never a fabricated one)
 *   - multiple plans (the concentrated-monorepo fixture -> one result per plan, matching its own tasks)
 *   - a stored JSON snapshot of the full ProviderExecutionResult[] for concentrated-monorepo
 *   - a smoke test against this actual repository
 *   - identity determinism (running the same plan set twice produces byte-identical ids)
 * Also verifies (implied by "each must throw NotImplementedYetError exactly like RealAdapter", even though
 * not separately listed under "Testing requirements"): ClaudeProvider/GeminiProvider/OpenAIProvider all
 * throw, unconditionally, and ProviderExecutionEngine does not swallow that throw when one is injected.
 *
 * Run with: node --import tsx --test packages/engines/src/provider-execution/provider-execution.test.ts
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
import type { ExecutionPlanSet } from "../execution-planning/analysis/types";
import { NotImplementedYetError } from "../implementation-executor/adapters/RealAdapters";
import type { ExecutionAction, ExecutionPlan, ExecutionStep } from "../execution-planning/analysis/types";
import { buildPromptArtifact } from "./analysis/build-prompt";
import { MemoryProvider } from "./providers/MemoryProvider";
import { ClaudeProvider, GeminiProvider, OpenAIProvider } from "./providers/RemoteProviders";
import { ProviderExecutionEngine, runAll } from "./ProviderExecutionEngine";
import type { ProviderExecutionResult } from "./analysis/types";

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

function makeStep(action: ExecutionAction, order = 0, description = `synthetic ${action} step`): ExecutionStep {
  return { id: `execution-step:synthetic-${order}-${action}`, order, action, description };
}

function makePlan(steps: ExecutionStep[]): ExecutionPlan {
  return {
    id: "execution-plan:synthetic",
    requestId: "implementation-request:synthetic",
    title: "Synthetic",
    priority: "Medium",
    steps,
    dependencyIds: [],
    order: 0,
  };
}

function normalizeResult(result: ProviderExecutionResult): unknown {
  return { ...result, startedAt: "<normalized>", finishedAt: "<normalized>" };
}

test("MemoryProvider: known actions produce their canned summary, deterministically", () => {
  const provider = new MemoryProvider();
  const prompt = buildPromptArtifact(makeStep("RUN_TESTS"));
  const first = provider.generate(prompt);
  const second = provider.generate(prompt);

  assert.equal(first.rawText, second.rawText);
  assert.ok(first.rawText.startsWith("Added tests."));
  assert.equal(first.provider, "memory");
  assert.equal(first.model, "memory-v1");
  assert.equal(first.promptId, prompt.id);
  assert.equal(first.finishReason, "stop");
  assert.ok(first.usage);
  assert.ok(first.usage!.totalTokens > 0);
});

test("MemoryProvider: an unrecognized action falls back to a generic summary instead of guessing", () => {
  // A hand-built step with an action outside today's known ExecutionAction union -- can't happen from a real
  // upstream ExecutionPlan today, but MemoryProvider's fallback still needs to be verified defensively.
  const futureStep = { id: "execution-step:synthetic-future", order: 0, action: "SOME_FUTURE_ACTION", description: "synthetic" } as unknown as ExecutionStep;
  const provider = new MemoryProvider();
  const prompt = buildPromptArtifact(futureStep);
  const response = provider.generate(prompt);
  assert.ok(response.rawText.startsWith("Completed step."));
});

test("RemoteProviders: Claude/Gemini/OpenAI all throw NotImplementedYetError, unconditionally", () => {
  const prompt = buildPromptArtifact(makeStep("CREATE_FILE"));
  assert.throws(() => new ClaudeProvider().generate(prompt), NotImplementedYetError);
  assert.throws(() => new GeminiProvider().generate(prompt), NotImplementedYetError);
  assert.throws(() => new OpenAIProvider().generate(prompt), NotImplementedYetError);
});

test("ProviderExecutionEngine: propagates a RemoteProvider's throw rather than swallowing it", () => {
  const engine = new ProviderExecutionEngine(new ClaudeProvider());
  const plan = makePlan([makeStep("CREATE_FILE")]);
  assert.throws(() => engine.run(plan), NotImplementedYetError);
});

test("ProviderExecutionEngine: builds one correctly-linked prompt/response/patch triple per step, in order", () => {
  const engine = new ProviderExecutionEngine(); // default MemoryProvider
  const plan = makePlan([makeStep("CREATE_BRANCH", 0), makeStep("CREATE_FILE", 1), makeStep("RUN_TESTS", 2), makeStep("COMMIT", 3)]);

  const result = engine.run(plan);

  assert.equal(result.planId, plan.id);
  assert.equal(result.steps.length, 4);
  result.steps.forEach((stepResult, index) => {
    const step = plan.steps[index]!;
    assert.equal(stepResult.executionStepId, step.id);
    assert.equal(stepResult.prompt.executionStepId, step.id);
    assert.equal(stepResult.response.promptId, stepResult.prompt.id);
    assert.equal(stepResult.patch.responseId, stepResult.response.id);
    assert.ok(stepResult.prompt.userPrompt.includes(`Action: ${step.action}`));
  });
});

test("concentrated-monorepo fixture (multiple plans): runAll() produces one result per plan, matching each plan's own steps", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const results = runAll(planSet);

  assert.equal(results.length, 2);
  results.forEach((result, index) => {
    const plan = planSet.plans[index]!;
    assert.equal(result.planId, plan.id);
    assert.equal(result.steps.length, plan.steps.length);
  });
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture (zero plans): runAll() produces zero results, never a fabricated one`, () => {
    const planSet = planSetFor(path.join(REPO_ANALYZER_FIXTURES, fixture));
    const results = runAll(planSet);
    assert.deepEqual(results, []);
  });
}

test("identity is deterministic: running the same plan set twice produces byte-identical prompt/response/patch ids", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const first = runAll(planSet);
  const second = runAll(planSet);

  const ids = (results: ProviderExecutionResult[]) => results.flatMap((r) => r.steps.flatMap((s) => [s.prompt.id, s.response.id, s.patch.id]));
  assert.deepEqual(ids(first).sort(), ids(second).sort());
});

test("snapshot: concentrated-monorepo's full ProviderExecutionResult[] matches the stored snapshot", () => {
  const planSet = planSetFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const results = runAll(planSet);
  const actual = results.map(normalizeResult);
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const planSet = planSetFor(repoRoot);
  const results = runAll(planSet);

  for (const result of results) {
    assert.ok(typeof result.startedAt === "string" && Number.isFinite(Date.parse(result.startedAt)));
    for (const stepResult of result.steps) {
      assert.ok(stepResult.response.rawText.length > 0);
      assert.equal(stepResult.patch.unifiedDiff, stepResult.response.rawText);
    }
  }
});
