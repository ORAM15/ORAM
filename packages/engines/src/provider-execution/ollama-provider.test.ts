import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaProvider } from "./providers/OllamaProvider";
import type { PromptArtifact } from "./analysis/types";

const prompt: PromptArtifact = {
  id: "prompt:ollama-test",
  executionStepId: "step:ollama-test",
  provider: "ollama",
  model: "qwen3.5:4b",
  systemPrompt: "You are a test provider.",
  userPrompt: "Return a short implementation summary.",
};

test("OllamaProvider: normalizes an Anthropic text response into LLMResponse", async () => {
  const provider = new OllamaProvider({
    model: "qwen3.5:4b",
    fetchImpl: async (input, init) => {
      assert.equal(input, "http://localhost:11434/v1/messages");
      assert.equal(init?.method, "POST");

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "qwen3.5:4b");
      assert.deepEqual(body.thinking, { type: "disabled" });
      assert.equal(body.messages[0].content, prompt.userPrompt);

      return new Response(
        JSON.stringify({
          id: "msg_test",
          model: "qwen3.5:4b",
          content: [{ type: "text", text: "Implementation summary." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 12, output_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await provider.generate(prompt);

  assert.deepEqual(result, {
    id: "msg_test",
    promptId: prompt.id,
    provider: "ollama",
    model: "qwen3.5:4b",
    rawText: "Implementation summary.",
    usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 },
    finishReason: "stop",
  });
});

test("OllamaProvider: fails closed on a non-2xx response", async () => {
  const provider = new OllamaProvider({
    model: "qwen3.5:4b",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "model unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(() => provider.generate(prompt), /Ollama provider request failed \(500\)/);
});

test("OllamaProvider: fails closed when the response contains no text content", async () => {
  const provider = new OllamaProvider({
    model: "qwen3.5:4b",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          id: "msg_empty",
          model: "qwen3.5:4b",
          content: [{ type: "tool_use", input: {} }],
          stop_reason: "tool_use",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  await assert.rejects(() => provider.generate(prompt), /returned no text content/);
});

test("OllamaProvider: aborts a hanging request when the timeout expires", async () => {
  let observedSignal: AbortSignal | undefined;

  const provider = new OllamaProvider({
    model: "qwen3.5:4b",
    timeoutMs: 5,
    fetchImpl: async (_input, init) => {
      observedSignal = init?.signal as AbortSignal | undefined;
      await new Promise<void>((resolve) => {
        if (observedSignal?.aborted) return resolve();
        observedSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new DOMException("The operation was aborted.", "AbortError");
    },
  });

  await assert.rejects(() => provider.generate(prompt), /aborted/i);
  assert.equal(observedSignal?.aborted, true);
});
