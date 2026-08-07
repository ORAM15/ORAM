/**
 * EngineeringDecision — Capability Sprint 14 (Adaptive Decision Engine).
 *
 * Every prior stage from Reflection backward transforms exactly one input into exactly one output. This
 * stage is different: it synthesizes across FOUR already-computed sources at once -- Reflection's own
 * batch-level verdict, the raw Validation batch, the raw Recommendation batch, and (optionally) the most
 * recently recorded run for this repository from Engineering Memory -- and decides what should happen next.
 * Pure, deterministic, rule-based: no AI, no prompts, no filesystem modification, no re-evaluation of any
 * patch content Validation has already inspected.
 *
 * Field names below intentionally use this Sprint's own vocabulary ("EngineeringReflection",
 * "ValidationReport", "RecommendationReport", "EngineeringMemory") in comments even though the concrete
 * TypeScript types reused are `ReflectionReport`, `ValidationResult`, `RecommendationSet`, and `RunSnapshot`
 * respectively -- this package does not rename or duplicate those protected types, it only documents the
 * correspondence (see ./types.ts's own `DecisionInputs`).
 */

import type { ValidationResult } from "../../validation/analysis/types";
import type { RecommendationSet } from "../../recommendation/analysis/types";
import type { ReflectionReport } from "../../reflection/analysis/types";
import type { RunSnapshot } from "../../memory/analysis/types";

/**
 * Everything buildEngineeringDecision() needs.
 *   - reflectionReport: this Sprint's own "EngineeringReflection" input -- the whole-batch ReflectionReport.
 *   - validationResult: this Sprint's own "ValidationReport" input -- the whole-batch ValidationResult (there
 *     is no single "the" ValidationReport once a batch has more than one patch; this is that batch).
 *   - recommendationSet: this Sprint's own "RecommendationReport" input -- the whole-batch RecommendationSet.
 *   - previousRun: this Sprint's own "EngineeringMemory (latest run only)" input -- the most recently
 *     recorded RunSnapshot for this same repository, or null when Memory has no prior run to compare
 *     against (see MemoryStore.ts's own disclosed cross-process-persistence limitation; in `oram decide`
 *     today this is honestly always null -- see DecisionEngine.ts).
 */
export interface DecisionInputs {
  readonly reflectionReport: ReflectionReport;
  readonly validationResult: ValidationResult;
  readonly recommendationSet: RecommendationSet;
  readonly previousRun: RunSnapshot | null;
}

export type DecisionType = "CONTINUE" | "RETRY" | "SPLIT_MISSION" | "ESCALATE_TO_HUMAN" | "CHANGE_PROVIDER" | "STOP";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface EngineeringDecision {
  /** Unique per decision (timestamp-derived -- see ./build-decision.ts's own note; the same reasoning memory/analysis/build-run-snapshot.ts already documents for RunSnapshot.runId applies here). */
  readonly id: string;
  readonly timestamp: string;
  readonly decisionType: DecisionType;
  readonly reason: string;
  /** 0-1. Fixed per matched policy (see ./rules.ts) -- never computed from anything probabilistic, the same "fixed template confidence" convention Reflection and Recommendation both already established. */
  readonly confidence: number;
  readonly riskLevel: RiskLevel;
  readonly nextAction: string;
  /** ids of the real upstream facts (ValidationIssues, ReflectionFindings, Recommendations, or a previous RunSnapshot's own runId) that justify this decision -- never fabricated, empty when nothing blocking exists (CONTINUE). */
  readonly evidenceIds: ReadonlyArray<string>;
  /** id(s) of the policy/policies that produced this decision (see ./rules.ts's DecisionOutcome.kind) -- exactly one today, since rules are evaluated in a fixed order and the first match wins, but modeled as an array for a future policy set that might combine more than one. */
  readonly policyIds: ReadonlyArray<string>;
}
