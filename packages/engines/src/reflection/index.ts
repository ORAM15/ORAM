export type { ReflectionSeverity, ReflectionCategory, ReflectionFinding, ReflectionReport } from "./analysis/types";
export type { ValidationStats } from "./analysis/rules";
export {
  computeStats,
  evaluateFindings,
  LARGE_ISSUE_COUNT_THRESHOLD,
  MANY_ERRORS_THRESHOLD,
  MULTIPLE_RECOMMENDATIONS_THRESHOLD,
} from "./analysis/rules";
export { buildReflectionReport, computeOverallScore, computeConfidence, buildSummary, RETRY_SCORE_THRESHOLD } from "./analysis/build-reflection";

export { ReflectionEngine, createReflectionEngine } from "./ReflectionEngine";
