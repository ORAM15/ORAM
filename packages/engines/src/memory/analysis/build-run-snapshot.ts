/**
 * buildRunSnapshot() — turns one already-computed pipeline run (RunSnapshotInputs) into one RunSnapshot.
 * Every field except `runId`/`timestamp` is a pure function of already-produced upstream data: this file
 * never re-inspects a repository, never re-evaluates a patch, never re-reasons about anything -- it only
 * summarizes and records.
 *
 * `repositoryId` is deterministic: makeId("repository", repositoryRoot) always produces the same id for the
 * same repository path, exactly like every other stable id in this pipeline (see
 * repository-analyzer/analysis/identity.ts). `runId`/`timestamp` are the one place this stage cannot be a
 * pure function of its inputs alone -- a run's identity is inherently tied to WHEN it happened, not just
 * WHAT it analyzed (the same reason @oram/runtime's own Runtime.ts has a `generateRunId()` doing the exact
 * same timestamp-derived thing, cited here as the established precedent rather than inventing a new scheme).
 * A small in-process counter is appended so two snapshots built within the same millisecond (e.g. in a tight
 * test loop) still never collide -- a call-order tiebreaker, never randomness.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { RunSnapshot, RunSnapshotInputs } from "./types";

let runSequence = 0;

/** Direct precedent: Runtime.ts's own generateRunId() in @oram/runtime -- a timestamp-derived id needing no shared counter/lock across processes. The trailing sequence number is this package's own addition, guarding only against same-millisecond collisions within one process (MemoryStore is explicitly in-memory/per-process -- see MemoryStore.ts). */
function generateRunId(): string {
  runSequence += 1;
  return `RUN-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}-${runSequence}`;
}

function averageScore(validationResult: RunSnapshotInputs["validationResult"]): number {
  if (validationResult.reports.length === 0) return 100;
  const total = validationResult.reports.reduce((sum, report) => sum + report.score, 0);
  return Math.round(total / validationResult.reports.length);
}

export function buildRunSnapshot(inputs: RunSnapshotInputs): RunSnapshot {
  const { analysis, knowledge, reasoning, plan, graph, requestSet, planSet, validationResult, recommendationSet, reflectionReport } = inputs;

  return {
    repositoryId: makeId("repository", inputs.repositoryRoot),
    runId: generateRunId(),
    timestamp: new Date().toISOString(),
    analysisSummary: `${analysis.projectName} -- ${analysis.fileCount} file(s) scanned.`,
    knowledgeSummary: `${knowledge.subsystems.length} subsystem(s), ${knowledge.dependencyRelationships.length} relationship(s) identified.`,
    reasoningSummary: `${reasoning.findings.length} finding(s) identified.`,
    planningSummary: `${plan.missions.length} mission(s) planned.`,
    missionCount: graph.missions.length,
    requestCount: requestSet.requests.length,
    executionPlanCount: planSet.plans.length,
    validationScore: averageScore(validationResult),
    recommendationCount: recommendationSet.recommendations.length,
    reflectionSummary: reflectionReport.summary,
    retryRecommended: reflectionReport.retryRecommended,
    overallConfidence: reflectionReport.confidence,
  };
}
