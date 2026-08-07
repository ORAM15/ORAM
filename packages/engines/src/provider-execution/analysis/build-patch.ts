/**
 * buildPatchArtifact() — wraps an LLMResponse as a PatchArtifact. A container ONLY: `unifiedDiff` is
 * `response.rawText`, verbatim, never parsed for hunks/file paths/anything else. `language` and `summary`
 * are therefore never inferred by inspecting that text either -- doing so would itself be a form of parsing
 * this Sprint explicitly excludes. `language` is always "unknown"; `summary` is a fixed, mechanical label
 * naming the response it came from, not a description of what the (unexamined) diff actually contains. A
 * future Validation sprint is the right place to actually parse and classify a patch's content.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { LLMResponse, PatchArtifact } from "./types";

export function buildPatchArtifact(response: LLMResponse): PatchArtifact {
  return {
    id: makeId("patch-artifact", response.id),
    responseId: response.id,
    language: "unknown",
    unifiedDiff: response.rawText,
    summary: `Unvalidated patch captured from ${response.provider}/${response.model} response ${response.id}.`,
  };
}
