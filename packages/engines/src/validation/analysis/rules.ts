/**
 * Deterministic, structural PatchArtifact checks -- no AST, no compilation, no execution. Every rule looks
 * only at `unifiedDiff` as plain text (line prefixes, marker substrings, repeated header lines); none of them
 * attempt to actually parse hunks into a real diff model. Each rule returns at most one ValidationIssue (or
 * null); `evaluatePatch()` runs all of them, in a fixed order, and returns whatever fired.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { PatchArtifact } from "../../provider-execution/analysis/types";
import type { ValidationIssue, ValidationSeverity } from "./types";

/** Lightweight structural threshold, not a real diff-size/complexity analyzer. */
export const MAX_DIFF_LENGTH = 20000;

/** The literal marker MemoryProvider's own simulated diffs contain (see provider-execution/providers/MemoryProvider.ts) -- detecting it is a plain substring check, not text understanding. */
const PLACEHOLDER_MARKER = "PLACEHOLDER";

const OLD_HEADER_LINE = /^--- /m;
const NEW_HEADER_LINE = /^\+\+\+ /m;
const OLD_HEADER_LINES_G = /^--- .*$/gm;
const NEW_HEADER_LINES_G = /^\+\+\+ .*$/gm;
const HUNK_HEADER_LINES_G = /^@@ .*@@.*$/gm;

function issue(kind: string, patchId: string, severity: ValidationSeverity, title: string, description: string): ValidationIssue {
  return { id: makeId("validation-issue", `${patchId}:${kind}`), severity, title, description, patchId };
}

function checkEmptyPatch(patch: PatchArtifact): ValidationIssue | null {
  if (patch.unifiedDiff.trim().length > 0) return null;
  return issue("empty-patch", patch.id, "ERROR", "Empty patch", "This patch's unifiedDiff is empty; there is no change to review.");
}

function checkPlaceholderDiff(patch: PatchArtifact): ValidationIssue | null {
  if (!patch.unifiedDiff.includes(PLACEHOLDER_MARKER)) return null;
  return issue(
    "placeholder-diff",
    patch.id,
    "WARNING",
    "Placeholder diff detected",
    `This patch's diff contains the literal marker "${PLACEHOLDER_MARKER}", indicating simulated or template content rather than a real change.`
  );
}

function checkDiffTooLarge(patch: PatchArtifact): ValidationIssue | null {
  if (patch.unifiedDiff.length <= MAX_DIFF_LENGTH) return null;
  return issue(
    "diff-too-large",
    patch.id,
    "WARNING",
    "Diff too large",
    `This patch's diff is ${patch.unifiedDiff.length} characters, exceeding the ${MAX_DIFF_LENGTH}-character structural review threshold.`
  );
}

/** Fires only when there is NEITHER a "--- " NOR a "+++ " line at all -- a mismatched pairing is ./checkInvalidHeader's concern instead. */
function checkMissingFileHeaders(patch: PatchArtifact): ValidationIssue | null {
  if (patch.unifiedDiff.trim().length === 0) return null;
  if (OLD_HEADER_LINE.test(patch.unifiedDiff) || NEW_HEADER_LINE.test(patch.unifiedDiff)) return null;
  return issue(
    "missing-file-headers",
    patch.id,
    "ERROR",
    "Missing file headers",
    'This patch\'s diff has no "--- " or "+++ " file header line at all.'
  );
}

/** Fires when both header kinds are present but their counts don't match -- a lightweight pairing check, not full parsing. */
function checkInvalidHeader(patch: PatchArtifact): ValidationIssue | null {
  if (patch.unifiedDiff.trim().length === 0) return null;
  const oldCount = patch.unifiedDiff.match(OLD_HEADER_LINES_G)?.length ?? 0;
  const newCount = patch.unifiedDiff.match(NEW_HEADER_LINES_G)?.length ?? 0;
  if (oldCount === 0 && newCount === 0) return null; // ./checkMissingFileHeaders already covers this case
  if (oldCount === newCount) return null;
  return issue(
    "invalid-unified-diff-header",
    patch.id,
    "ERROR",
    "Invalid unified diff header",
    `This patch's diff has a mismatched header count: ${oldCount} "---" line(s) vs ${newCount} "+++" line(s).`
  );
}

function checkDuplicateHunks(patch: PatchArtifact): ValidationIssue | null {
  const hunkLines = patch.unifiedDiff.match(HUNK_HEADER_LINES_G) ?? [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const line of hunkLines) {
    if (seen.has(line)) duplicates.add(line);
    seen.add(line);
  }
  if (duplicates.size === 0) return null;
  return issue(
    "duplicate-hunks",
    patch.id,
    "WARNING",
    "Duplicate hunks",
    `This patch repeats the identical hunk header ${[...duplicates].map((line) => `"${line}"`).join(", ")} more than once.`
  );
}

const RULES: ReadonlyArray<(patch: PatchArtifact) => ValidationIssue | null> = [
  checkEmptyPatch,
  checkPlaceholderDiff,
  checkDiffTooLarge,
  checkMissingFileHeaders,
  checkInvalidHeader,
  checkDuplicateHunks,
];

export function evaluatePatch(patch: PatchArtifact): ValidationIssue[] {
  return RULES.map((rule) => rule(patch)).filter((result): result is ValidationIssue => result !== null);
}
