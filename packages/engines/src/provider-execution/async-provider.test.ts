import { test } from "node:test";
import assert from "node:assert/strict";
import type { LLMResponse, PromptArtifact } from "./analysis/types";
import type { ExecutionAction, ExecutionPlan, ExecutionStep } from "../execution-planning/analysis/types";
import { buildPromptArtifact } from "./analysis/build-prompt";
import { ProviderExecutionEngine, runAllAsync } from "./ProviderExecutionEngine";
import type { AsyncProvider } from "./providers/async-types";

function makeStep(action: ExecutionAction, order = 0): ExecutionStep {
  return { id: `execution-step:async-${order}-${action}`, order, action, description: `synthetic ${action} step` };
}

function makePlan(id: string, steps: ExecutionStep[]): ExecutionPlan {
  return {
    id,
    requestId: `implementation-request:${id}`,
    title: "Async synthetic plan",
    priority: "Medium",
    steps,
    dependencyIds: [],
    order: 0,
  };
}

function responseFor(prompt: PromptArtifact): LLMResponse {
  return {
    id: `async-response:${prompt.id}`,
    promptId: prompt.id,
    provider: prompt.provider,
    model: prompt.model,
    rawText: "async provider response",
    usage: null,
    finishReason: "stop",
  };
}

test("ProviderExecutionEngine.runAsync: awaits the provider and preserves prompt/response/patch linkage", async () => {
  const calls: string[] = [];
  const provider: AsyncProvider = {
    async generate(prompt) {
      calls.push(prompt.id);
      await Promise.resolve();
      return responseFor(prompt);
    },
  };

  const plan = makePlan("execution-plan:async-single", [makeStep("CREATE_FILE")]);
  const result = await new ProviderExecutionEngine().runAsync(plan, provider);

  assert.equal(result.planId, plan.id);
  assert.equal(result.steps.length, 1);
  assert.deepEqual(calls, [result.steps[0]!.prompt.id]);
  assert.equal(result.steps[0]!.response.promptId, result.steps[0]!.prompt.id);
  assert.equal(result.steps[0]!.patch.responseId, result.steps[0]!.response.id);
});

test("runAllAsync: executes plans sequentially through the explicit async provider", async () => {
  const events: string[] = [];
  const provider: AsyncProvider = {
    async generate(prompt) {
      events.push(`start:${prompt.id}`);
      await Promise.resolve();
      events.push(`finish:${prompt.id}`);
      return responseFor(prompt);
    },
  };

  const first = makePlan("execution-plan:async-first", [makeStep("CREATE_FILE", 0), makeStep("RUN_TESTS", 1)]);
  const second = makePlan("execution-plan:async-second", [makeStep("COMMIT", 0)]);
  const results = await runAllAsync({ plans: [first, second] }, provider);

  assert.deepEqual(results.map((result) => result.planId), [first.id, second.id]);
  assert.equal(events.length, 6);
  assert.equal(events[1], `finish:${first.steps[0]!.id}`);
  assert.equal(events[2], `start:${first.steps[1]!.id}`);
  assert.equal(events[3], `finish:${first.steps[1]!.id}`);
  assert.equal(events[4], `start:${second.steps[0]!.id}`);
});

test("async execution propagates provider failures without converting them into success", async () => {
  const provider: AsyncProvider = {
    async generate(_prompt) {
      throw new Error("provider unavailable");
    },
  };

  const plan = makePlan("execution-plan:async-failure", [makeStep("CREATE_FILE")]);
  await assert.rejects(() => new ProviderExecutionEngine().runAsync(plan, provider), /provider unavailable/);
});

test("AsyncProvider is compatible with the existing prompt artifact contract", async () => {
  const provider: AsyncProvider = {
    async generate(prompt) {
      assert.equal(typeof prompt.id, "string");
      return responseFor(prompt);
    },
  };

  const prompt = buildPromptArtifact(makeStep("RUN_TESTS"));
  const response = await provider.generate(prompt);
  assert.equal(response.promptId, prompt.id);
});
