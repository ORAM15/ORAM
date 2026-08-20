import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionPlan, ExecutionStep } from "../execution-planning/analysis/types";
import { buildPromptArtifact } from "./analysis/build-prompt";
import { MemoryProvider } from "./providers/MemoryProvider";
import type { AsyncProvider } from "./providers/types";
import { AsyncProviderExecutionEngine, runAllAsync } from "./ProviderExecutionEngine";

function makePlan(): ExecutionPlan {
  const steps: ExecutionStep[] = [
    { id: "execution-step:async-0", order: 0, action: "CREATE_FILE", description: "create a file" },
    { id: "execution-step:async-1", order: 1, action: "RUN_TESTS", description: "run tests" },
  ];
  return {
    id: "execution-plan:async",
    requestId: "implementation-request:async",
    title: "Async provider test plan",
    priority: "Medium",
    steps,
    dependencyIds: [],
    order: 0,
  };
}

class FakeAsyncProvider implements AsyncProvider {
  readonly prompts: string[] = [];
  private readonly memory = new MemoryProvider();

  async generate(prompt: Parameters<AsyncProvider["generate"]>[0]) {
    this.prompts.push(prompt.id);
    await Promise.resolve();
    return this.memory.generate(prompt);
  }
}

class FailingAsyncProvider implements AsyncProvider {
  async generate(): Promise<never> {
    throw new Error("synthetic provider failure");
  }
}

test("AsyncProviderExecutionEngine: awaits each provider response and preserves artifact linkage", async () => {
  const provider = new FakeAsyncProvider();
  const engine = new AsyncProviderExecutionEngine(provider);
  const plan = makePlan();

  const result = await engine.run(plan);

  assert.equal(result.planId, plan.id);
  assert.equal(result.steps.length, plan.steps.length);
  assert.equal(provider.prompts.length, plan.steps.length);

  result.steps.forEach((stepResult, index) => {
    const step = plan.steps[index]!;
    assert.equal(stepResult.executionStepId, step.id);
    assert.equal(stepResult.prompt.executionStepId, step.id);
    assert.equal(stepResult.response.promptId, stepResult.prompt.id);
    assert.equal(stepResult.patch.responseId, stepResult.response.id);
    assert.equal(provider.prompts[index], stepResult.prompt.id);
  });
});

test("AsyncProviderExecutionEngine: provider failure propagates instead of fabricating a result", async () => {
  const engine = new AsyncProviderExecutionEngine(new FailingAsyncProvider());
  await assert.rejects(() => engine.run(makePlan()), /synthetic provider failure/);
});

test("runAllAsync: preserves plan order and handles an empty plan set", async () => {
  const provider = new FakeAsyncProvider();
  const engine = new AsyncProviderExecutionEngine(provider);
  const plan = makePlan();
  const planSet = { plans: [plan] };

  const results = await runAllAsync(planSet, engine);
  assert.deepEqual(results.map((result) => result.planId), [plan.id]);
  assert.deepEqual(await runAllAsync({ plans: [] }, engine), []);
});

test("AsyncProvider contract: Ollama-shaped asynchronous responses can be consumed without Ollama running", async () => {
  const provider: AsyncProvider = {
    async generate(prompt) {
      const response = new MemoryProvider().generate(buildPromptArtifact({
        id: "execution-step:contract",
        order: 0,
        action: "RUN_TESTS",
        description: "contract test",
      }));
      return { ...response, promptId: prompt.id, id: `async:${prompt.id}` };
    },
  };

  const prompt = buildPromptArtifact(makePlan().steps[0]!);
  const response = await provider.generate(prompt);
  assert.equal(response.promptId, prompt.id);
  assert.equal(response.provider, "memory");
});
