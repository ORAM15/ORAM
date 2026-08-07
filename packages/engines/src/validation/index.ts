export type { ValidationSeverity, ValidationIssue, ValidationReport, ValidationResult } from "./analysis/types";
export { evaluatePatch, MAX_DIFF_LENGTH } from "./analysis/rules";
export { buildValidationReport } from "./analysis/build-validation-report";

export { ValidationEngine, validateAll, createValidationEngine } from "./ValidationEngine";
