/**
 * PromptArtifact / LLMResponse / PatchArtifact — Capability Sprint 9 (LLM Provider Layer).
 *
 * The Implementation Executor (../../implementation-executor/) simulates execution via MemoryAdapter --
 * nothing it does is real. This package is the layer BEFORE any real change could ever happen: it turns an
 * ExecutionStep into a PromptArtifact, asks a Provider to generate() an LLMResponse, and wraps that response
 * as a PatchArtifact. Deterministic under the default MemoryProvider; no AI calls happen anywhere in this
 * package. Nothing here modifies git, the filesystem, or runs a shell command; nothing here applies a patch
 * -- Validation and Application are both explicitly future-sprint work.
 *
 * PatchArtifact is ONLY a container: `unifiedDiff` is whatever the Provider returned, wrapped verbatim,
 * never parsed or validated -- see ../analysis/build-patch.ts's own note on why `language`/`summary` are
 * never inferred by inspecting that text either.
 */

export interface PromptArtifact {
  readonly id: string;
  /** id of the ExecutionStep (see execution-planning/analysis/types.ts) this prompt was built from. */
  readonly executionStepId: string;
  readonly provider: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export type FinishReason = "stop" | "length" | "error";

/** Deterministic character-count proxy under MemoryProvider, not a real tokenizer -- see MemoryProvider's own note. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface LLMResponse {
  readonly id: string;
  readonly promptId: string;
  readonly provider: string;
  readonly model: string;
  readonly rawText: string;
  readonly usage: TokenUsage | null;
  readonly finishReason: FinishReason;
}

export interface PatchArtifact {
  readonly id: string;
  readonly responseId: string;
  readonly language: string;
  readonly unifiedDiff: string;
  readonly summary: string;
}

export interface ProviderExecutionStepResult {
  readonly executionStepId: string;
  readonly prompt: PromptArtifact;
  readonly response: LLMResponse;
  readonly patch: PatchArtifact;
}

export interface ProviderExecutionResult {
  /** id of the ExecutionPlan (see execution-planning/analysis/types.ts) this result was derived from. */
  readonly planId: string;
  readonly steps: ReadonlyArray<ProviderExecutionStepResult>;
  readonly startedAt: string;
  readonly finishedAt: string;
}
