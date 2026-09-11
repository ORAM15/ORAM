import type { LLMResponse, PromptArtifact } from "../analysis/types";

/**
 * AsyncProvider is the additive execution seam for providers that require asynchronous I/O.
 * It intentionally mirrors the existing Provider contract while leaving the synchronous Provider API
 * unchanged until Runtime composition can adopt the async boundary safely.
 */
export interface AsyncProvider {
  generate(prompt: PromptArtifact): Promise<LLMResponse>;
}
