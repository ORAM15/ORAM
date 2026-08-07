export type { RecommendationSeverity, RecommendationCategory, Recommendation, RecommendationSet } from "./analysis/types";
export type { RecommendationTemplate } from "./analysis/rules";
export { templateFor } from "./analysis/rules";
export { buildRecommendation, buildRecommendationsForReport, buildRecommendationSet } from "./analysis/build-recommendations";

export { RecommendationEngine, createRecommendationEngine } from "./RecommendationEngine";
