/**
 * Real LLM provider stubs -- exactly like implementation-executor's RealAdapter: the SAME NotImplementedYetError
 * type is reused here (imported read-only from implementation-executor, never modified) rather than a
 * near-duplicate error class being invented, so any code in this codebase can check
 * `error instanceof NotImplementedYetError` for "this is a deliberate not-yet-real stub," regardless of
 * which package threw it. Every method throws, unconditionally, so none of these can call a real API by
 * accident. None is ever ProviderExecutionEngine's default; that is always MemoryProvider.
 */

import { NotImplementedYetError } from "../../implementation-executor/adapters/RealAdapters";
import type { LLMResponse, PromptArtifact } from "../analysis/types";
import type { Provider } from "./types";

export class ClaudeProvider implements Provider {
  generate(_prompt: PromptArtifact): LLMResponse {
    throw new NotImplementedYetError("ClaudeProvider.generate");
  }
}

export class GeminiProvider implements Provider {
  generate(_prompt: PromptArtifact): LLMResponse {
    throw new NotImplementedYetError("GeminiProvider.generate");
  }
}

export class OpenAIProvider implements Provider {
  generate(_prompt: PromptArtifact): LLMResponse {
    throw new NotImplementedYetError("OpenAIProvider.generate");
  }
}
