/**
 * Deterministic ValidationIssue.title -> Recommendation template lookup. Keyed by the exact, known title
 * strings validation/analysis/rules.ts produces today (a small, fully known, fixed set of 6 -- the same
 * "dispatch by upstream title text" technique execution-planning's own rules.ts uses for
 * ImplementationRequest.title, for the same reason: no more specific stable key is available). An unrecognized
 * title (a future validation rule this package doesn't know about yet) falls back to DEFAULT_TEMPLATE rather
 * than guessing.
 */

import type { RecommendationCategory } from "./types";

export interface RecommendationTemplate {
  readonly title: string;
  readonly description: string;
  readonly category: RecommendationCategory;
  readonly confidence: number;
}

const TITLE_TEMPLATE: Readonly<Record<string, RecommendationTemplate>> = {
  "Empty patch": {
    title: "Provide a real implementation",
    description: "This patch contains no change; provide a real implementation instead of an empty diff.",
    category: "CORRECTNESS",
    confidence: 0.95,
  },
  "Placeholder diff detected": {
    title: "Replace placeholder content",
    description: "Replace placeholder content with a complete implementation before execution.",
    category: "CORRECTNESS",
    confidence: 0.9,
  },
  "Diff too large": {
    title: "Split into smaller patches",
    description: "Split the implementation into multiple smaller patches.",
    category: "ARCHITECTURE",
    confidence: 0.8,
  },
  "Missing file headers": {
    title: "Generate valid diff headers",
    description: "Generate a valid unified diff with file headers.",
    category: "CORRECTNESS",
    confidence: 0.9,
  },
  "Invalid unified diff header": {
    title: "Fix mismatched diff headers",
    description: 'Regenerate the diff so each "---" file header has a matching "+++" header.',
    category: "CORRECTNESS",
    confidence: 0.85,
  },
  "Duplicate hunks": {
    title: "Consolidate hunks",
    description: "Consolidate overlapping hunks.",
    category: "CORRECTNESS",
    confidence: 0.85,
  },
};

/** Honest fallback for any ValidationIssue.title this package doesn't recognize -- never a guess at what the issue meant. */
const DEFAULT_TEMPLATE: RecommendationTemplate = {
  title: "Review flagged issue",
  description: "Review and address the flagged validation issue.",
  category: "GENERAL",
  confidence: 0.5,
};

export function templateFor(issueTitle: string): RecommendationTemplate {
  return TITLE_TEMPLATE[issueTitle] ?? DEFAULT_TEMPLATE;
}
