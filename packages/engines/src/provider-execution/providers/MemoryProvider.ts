/**
 * MemoryProvider -- deterministic, no AI calls. Every response is a canned, fixed message keyed by the
 * requested ExecutionStep's action (recovered from the prompt's own "Action: X" first line -- see
 * ../analysis/build-prompt.ts), wrapped in a placeholder unified diff. The same input PromptArtifact always
 * produces the same LLMResponse. `usage` is a deterministic character-count proxy, not real tokenization --
 * there is no real tokenizer to call, and inventing token counts that only LOOK real would be dishonest.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { LLMResponse, PromptArtifact } from "../analysis/types";
import type { Provider } from "./types";

const ACTION_LINE = /^Action: (\S+)/;

const CANNED_SUMMARY: Readonly<Record<string, string>> = {
  CREATE_BRANCH: "Created working branch",
  CREATE_FILE: "Created file",
  MODIFY_FILE: "Modified file",
  DELETE_FILE: "Deleted file",
  RUN_TESTS: "Added tests",
  RUN_LINTER: "Ran linter",
  RUN_FORMATTER: "Ran formatter",
  COMMIT: "Committed changes",
  OPEN_PULL_REQUEST: "Opened pull request",
};
const DEFAULT_SUMMARY = "Completed step";

export class MemoryProvider implements Provider {
  generate(prompt: PromptArtifact): LLMResponse {
    const action = prompt.userPrompt.match(ACTION_LINE)?.[1] ?? "";
    const summary = CANNED_SUMMARY[action] ?? DEFAULT_SUMMARY;
    const rawText =
      `${summary}.\n\n` +
      "```diff\n" +
      "--- a/PLACEHOLDER\n" +
      "+++ b/PLACEHOLDER\n" +
      "@@ -0,0 +1,1 @@\n" +
      `+// ${summary} (simulated -- MemoryProvider makes no real AI call).\n` +
      "```";

    const promptChars = prompt.systemPrompt.length + prompt.userPrompt.length;
    const completionChars = rawText.length;

    return {
      id: makeId("llm-response", prompt.id),
      promptId: prompt.id,
      provider: prompt.provider,
      model: prompt.model,
      rawText,
      usage: {
        promptTokens: promptChars,
        completionTokens: completionChars,
        totalTokens: promptChars + completionChars,
      },
      finishReason: "stop",
    };
  }
}
