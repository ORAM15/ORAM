import type { LLMResponse, PromptArtifact } from "../analysis/types";

export interface Provider {
  generate(prompt: PromptArtifact): LLMResponse;
}
