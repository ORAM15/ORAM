/**
 * buildValidationReport() — runs every rule (./rules.ts) against one PatchArtifact and turns the resulting
 * issues into a scored ValidationReport. Scoring is a fixed, deterministic deduction table, not a judgment
 * call: 100 minus a per-issue penalty by severity, clamped at 0. `passed` is strictly "no ERROR-severity
 * issue" -- a report can carry WARNING/INFO issues and still pass.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { PatchArtifact } from "../../provider-execution/analysis/types";
import { evaluatePatch } from "./rules";
import type { ValidationReport, ValidationSeverity } from "./types";

const SEVERITY_DEDUCTION: Readonly<Record<ValidationSeverity, number>> = {
  ERROR: 40,
  WARNING: 15,
  INFO: 5,
};

export function buildValidationReport(patch: PatchArtifact): ValidationReport {
  const issues = evaluatePatch(patch);
  const deduction = issues.reduce((total, issue) => total + SEVERITY_DEDUCTION[issue.severity], 0);
  const score = Math.max(0, 100 - deduction);
  const passed = !issues.some((issue) => issue.severity === "ERROR");

  return {
    id: makeId("validation-report", patch.id),
    patchId: patch.id,
    passed,
    score,
    issues,
  };
}
