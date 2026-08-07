/**
 * ValidationIssue / ValidationReport / ValidationResult — Capability Sprint 10 (Validation Engine).
 *
 * Provider Execution (../../provider-execution/) produces a PatchArtifact per ExecutionStep -- an unvalidated
 * container wrapping whatever an LLM Provider returned, never parsed. The Validation Engine is the first
 * stage that actually looks at that content, but only via lightweight, deterministic structural checks (see
 * ./rules.ts): it NEVER executes code, applies a patch, modifies a file, or calls an AI. One ValidationReport
 * is produced per PatchArtifact; a ValidationResult is the reports for a whole batch (mirrors
 * ProviderExecutionResult's own "one input, one output, batch is just the array" shape).
 *
 * `ValidationSeverity` is deliberately its own name, not reusing engineering-reasoning's `Severity`
 * ("Low"|"Medium"|"High", exported from the top-level barrel) -- these are two genuinely different concepts
 * (a Finding's severity vs. an issue found IN A PATCH) that would otherwise collide under `export *` the same
 * way engineering-missions' `Mission` did against engineering-planning's `Mission` (see
 * ../engineering-missions/index.ts's own header comment for that precedent).
 */

export type ValidationSeverity = "INFO" | "WARNING" | "ERROR";

export interface ValidationIssue {
  readonly id: string;
  readonly severity: ValidationSeverity;
  readonly title: string;
  readonly description: string;
  /** id of the PatchArtifact (see provider-execution/analysis/types.ts) this issue was found in. */
  readonly patchId: string;
}

export interface ValidationReport {
  readonly id: string;
  readonly patchId: string;
  /** true iff no ERROR-severity issue was found. A report with only WARNING/INFO issues still passes. */
  readonly passed: boolean;
  /** 0-100. 100 minus a fixed deduction per issue (see ./build-validation-report.ts), clamped at 0. */
  readonly score: number;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

export interface ValidationResult {
  readonly reports: ReadonlyArray<ValidationReport>;
}
