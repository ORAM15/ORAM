/**
 * EngineeringReasoning — Capability Sprint 1, Phase 3 (Engineering Reasoning MVP).
 *
 * Engineering Knowledge (../../engineering-knowledge/) answers "what does it mean?" -- Engineering Reasoning
 * analyzes that Engineering Knowledge (never RepositoryAnalysis directly, and never re-walks the filesystem)
 * to produce Findings: architectural smells, anti-patterns, testing/CI gaps, scalability/security concerns,
 * and maintainability issues. Deterministic, no LLM. Every Finding traces back to specific EngineeringKnowledge
 * items via `sourceIds` -- the same identity-preservation discipline established for RepositoryAnalysis and
 * EngineeringKnowledge (see repository-analyzer/analysis/identity.ts).
 *
 * MVP SCOPE: exactly 5 rules (see ./rules.ts), chosen to genuinely reason over EngineeringKnowledge's
 * higher-level structure (subsystems + dependencyRelationships), not to repeat what EngineeringKnowledge's
 * own single-fact rules (architecturalRisks/technicalDebtAreas/missingEngineeringPractices) already say.
 * No planning, no prioritization, no ranking between Findings -- that is explicitly out of scope (a later
 * Planning phase's job, per the roadmap).
 */

import type { Confidence } from "../../repository-analyzer/analysis/types";

export type FindingCategory =
  | "architectural-smell"
  | "anti-pattern"
  | "testing-gap"
  | "cicd-gap"
  | "scalability-concern"
  | "security-concern"
  | "maintainability-issue";

export type Severity = "Low" | "Medium" | "High";

export interface Finding {
  readonly id: string;
  /** Which rule produced this Finding (e.g. "subsystem-concentration") -- stable across runs, independent of the rendered summary text. */
  readonly kind: string;
  readonly category: FindingCategory;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly summary: string;
  readonly evidence: ReadonlyArray<string>;
  readonly sourceFiles: ReadonlyArray<string>;
  /** ids of the EngineeringKnowledge items (subsystems, dependencyRelationships, or their own Detections) this Finding was derived from. */
  readonly sourceIds: ReadonlyArray<string>;
}

export interface EngineeringReasoning {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly findings: ReadonlyArray<Finding>;
  readonly timestamp: string;
}
