/**
 * buildPromptArtifact() — turns one ExecutionStep into a PromptArtifact. Pure and deterministic: the same
 * step always produces the same prompt text. The user prompt's first line is a fixed, self-controlled
 * "Action: X" format that MemoryProvider (../providers/MemoryProvider.ts) reads back -- not free-text this
 * package scrapes from prose it doesn't control, a format it defines and owns itself.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ExecutionStep } from "../../execution-planning/analysis/types";
import type { PromptArtifact } from "./types";

const SYSTEM_PROMPT =
  "You are an automated software engineering assistant executing one predefined step. Respond with a short " +
  "summary of the change followed by a unified diff. Do not ask questions; do not perform actions outside this step.";

function buildUserPrompt(step: ExecutionStep): string {
  return `Action: ${step.action}\nDescription: ${step.description}\n\nProduce the minimal change needed to complete this step.`;
}

export function buildPromptArtifact(step: ExecutionStep, provider = "memory", model = "memory-v1"): PromptArtifact {
  return {
    id: makeId("prompt-artifact", step.id),
    executionStepId: step.id,
    provider,
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(step),
  };
}
