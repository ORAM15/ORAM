import type { LLMResponse, PromptArtifact } from "../analysis/types";

export interface Provider {
  generate(prompt: PromptArtifact): LLMResponse;
}

/**
 * AsyncProvider is the additive transport boundary for real providers.
 *
 * The existing synchronous Provider contract intentionally remains unchanged so
 * MemoryProvider and deterministic callers do not need to become asynchronous.
 * Real network-backed providers such as Ollama can implement this contract
 * without blocking the ProviderExecutionEngine's async path.
 */
export interface AsyncProvider {
  generate(prompt: PromptArtifact): Promise<LLMResponse>;
}
