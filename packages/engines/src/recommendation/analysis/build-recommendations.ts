/**
 * buildRecommendation() maps exactly one ValidationIssue to exactly one Recommendation -- the core rule
 * ("Map each ValidationIssue -> One Recommendation"). buildRecommendationSet() is the whole-pipeline entry
 * point: it flattens every ValidationReport's issues, across a whole ValidationResult, into one
 * RecommendationSet -- mirroring every prior stage's own "consume the whole upstream Set, produce your own
 * Set" shape (buildMissionGraph(plan), buildImplementationRequests(graph), buildExecutionPlans(requestSet),
 * validateAll(patches)).
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ValidationIssue, ValidationReport, ValidationResult } from "../../validation/analysis/types";
import { templateFor } from "./rules";
import type { Recommendation, RecommendationSet } from "./types";

export function buildRecommendation(issue: ValidationIssue): Recommendation {
  const template = templateFor(issue.title);
  return {
    id: makeId("recommendation", issue.id),
    validationIssueId: issue.id,
    title: template.title,
    description: template.description,
    priority: issue.severity,
    category: template.category,
    confidence: template.confidence,
  };
}

export function buildRecommendationsForReport(report: ValidationReport): Recommendation[] {
  return report.issues.map(buildRecommendation);
}

export function buildRecommendationSet(result: ValidationResult): RecommendationSet {
  return { recommendations: result.reports.flatMap(buildRecommendationsForReport) };
}
