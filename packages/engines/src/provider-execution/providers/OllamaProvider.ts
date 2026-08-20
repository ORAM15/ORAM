/**
 * OllamaProvider — Capability Sprint 21 foundation.
 *
 * This adapter is deliberately transport-only: it talks to Ollama's local
 * Anthropic-compatible /v1/messages endpoint and normalizes the response into
 * ORAM's existing LLMResponse shape. It does not edit files, run commands, or
 * apply patches. The existing synchronous Provider contract remains unchanged
 * until the runtime can safely adopt an asynchronous provider boundary.
 *
 * Thinking is explicitly disabled because the Sprint 21 local validation
 * established that Qwen3.5 can return a clean Anthropic text/tool response when
 * thinking is disabled through this endpoint.
 */

import type { LLMResponse, PromptArtifact } from "../analysis/types";
import type { AsyncProvider } from "./types";

export interface OllamaProviderOptions {
  readonly model: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

type AnthropicMessageResponse = {
  readonly id?: string;
  readonly model?: string;
  readonly content?: ReadonlyArray<{
    readonly type?: string;
    readonly text?: string;
  }>;
  readonly stop_reason?: string | null;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
};

export class OllamaProvider implements AsyncProvider {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    if (!options.model.trim()) throw new Error("OllamaProvider requires a model.");

    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    this.apiKey = options.apiKey ?? "ollama";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(prompt: PromptArtifact): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8192,
          thinking: { type: "disabled" },
          system: prompt.systemPrompt,
          messages: [{ role: "user", content: prompt.userPrompt }],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as AnthropicMessageResponse & { readonly error?: unknown };
      if (!response.ok) {
        throw new Error(`Ollama provider request failed (${response.status}): ${JSON.stringify(payload.error ?? payload)}`);
      }

      const text = (payload.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text!)
        .join("\n");

      if (!text) {
        throw new Error("Ollama provider returned no text content.");
      }

      const promptTokens = payload.usage?.input_tokens;
      const completionTokens = payload.usage?.output_tokens;

      return {
        id: payload.id ?? `ollama:${prompt.id}`,
        promptId: prompt.id,
        provider: "ollama",
        model: payload.model ?? this.model,
        rawText: text,
        usage:
          typeof promptTokens === "number" && typeof completionTokens === "number"
            ? {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              }
            : null,
        finishReason: payload.stop_reason === "max_tokens" ? "length" : "stop",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
