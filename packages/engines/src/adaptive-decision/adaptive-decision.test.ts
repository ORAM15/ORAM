/**
 * Regression coverage for the Adaptive Decision Engine (Capability Sprint 14).
 *
 * Covers each of the 6 supported decisions reachable via a dedicated, minimal synthetic scenario, plus:
 *   - deterministic ids (unique per decision)
 *   - a stored JSON snapshot of buildEngineeringDecision()'s output for concentrated-monorepo
 *   - zero-issue fixtures (CONTINUE, never a fabricated decision)
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/adaptive-decision/adaptive-decision.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "../execution-planning/analysis/build-execution-plans";
import { runAll as runProviderExecutionAll } from "../provider-execution/ProviderExecutionEngine";
import { validateAll } from "../validation/ValidationEngine";
import type { ValidationIssue, ValidationReport, ValidationResult, ValidationSeverity } from "../validation/analysis/types";
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import type { RecommendationSet } from "../recommendation/analysis/types";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import type { RunSnapshot } from "../memory/analysis/types";
import { buildEngineeringDecision } from "./analysis/build-decision";
import { computeValidationScore, RETRY_VALIDATION_SCORE_THRESHOLD } from "./analysis/rules";
import { DecisionEngine } from "./DecisionEngine";
import type { DecisionInputs, EngineeringDecision } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "decision-concentrated-monorepo.snap.json");

function findRepositoryRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, "scripts", "repository-intelligence.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find a repository root containing scripts/repository-intelligence.js above ${startDir}.`);
}

function pipelineInputsFor(root: string): DecisionInputs {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  return { reflectionReport, validationResult, recommendationSet, previousRun: null };
}

function makeIssue(severity: ValidationSeverity, title: string, patchId = "patch-artifact:synthetic"): ValidationIssue {
  return { id: `validation-issue:synthetic-${title}-${Math.random()}`, severity, title, description: "synthetic", patchId };
}

function makeReport(issues: ValidationIssue[], score = 100, patchId = "patch-artifact:synthetic"): ValidationReport {
  return { id: `validation-report:${patchId}`, patchId, passed: !issues.some((i) => i.severity === "ERROR"), score, issues };
}

function emptyRecommendations(): RecommendationSet {
  return { recommendations: [] };
}

function makeRunSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    repositoryId: "repository:synthetic",
    runId: "run:synthetic-previous",
    timestamp: "2026-01-01T00:00:00.000Z",
    analysisSummary: "synthetic",
    knowledgeSummary: "synthetic",
    reasoningSummary: "synthetic",
    planningSummary: "synthetic",
    missionCount: 0,
    requestCount: 0,
    executionPlanCount: 0,
    validationScore: 60,
    recommendationCount: 0,
    reflectionSummary: "synthetic",
    retryRecommended: true,
    overallConfidence: 0.7,
    ...overrides,
  };
}

function inputsFor(validationResult: ValidationResult, recommendationSet: RecommendationSet = emptyRecommendations(), previousRun: RunSnapshot | null = null): DecisionInputs {
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  return { reflectionReport, validationResult, recommendationSet, previousRun };
}

// ---------------------------------------------------------------------------------------------------------
// One reachable scenario per supported decision
// ---------------------------------------------------------------------------------------------------------

test("decision: CONTINUE when there is nothing to validate", () => {
  const decision = buildEngineeringDecision(inputsFor({ reports: [] }));
  assert.equal(decision.decisionType, "CONTINUE");
  assert.equal(decision.riskLevel, "LOW");
  assert.deepEqual(decision.evidenceIds, []);
});

test("decision: RETRY when the aggregate validation score drops below the threshold, with no errors", () => {
  const warnings = Array.from({ length: 3 }, () => makeIssue("WARNING", "Placeholder diff detected"));
  const lowScore = RETRY_VALIDATION_SCORE_THRESHOLD - 20;
  const recs: RecommendationSet = { recommendations: [{ id: "recommendation:1", validationIssueId: "x", title: "t", description: "d", priority: "WARNING", category: "GENERAL", confidence: 0.5 }] };
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport(warnings, lowScore)] }, recs));

  assert.equal(decision.decisionType, "RETRY");
  assert.equal(decision.riskLevel, "MEDIUM");
  assert.ok(decision.evidenceIds.length > 0);
});

test("decision: SPLIT_MISSION when validation issue volume is large, with no errors", () => {
  const manyIssues = Array.from({ length: 11 }, () => makeIssue("WARNING", "Placeholder diff detected"));
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport(manyIssues)] }));

  assert.equal(decision.decisionType, "SPLIT_MISSION");
  assert.equal(decision.riskLevel, "MEDIUM");
});

test("decision: CHANGE_PROVIDER when exactly one or two ERROR issues are present", () => {
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport([makeIssue("ERROR", "Empty patch")])] }));

  assert.equal(decision.decisionType, "CHANGE_PROVIDER");
  assert.equal(decision.riskLevel, "MEDIUM");
  assert.ok(decision.evidenceIds.length > 0);
});

test("decision: ESCALATE_TO_HUMAN when three or more ERROR issues are present", () => {
  const manyErrors = Array.from({ length: 3 }, () => makeIssue("ERROR", "Empty patch"));
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport(manyErrors)] }));

  assert.equal(decision.decisionType, "ESCALATE_TO_HUMAN");
  assert.equal(decision.riskLevel, "HIGH");
});

test("decision: STOP when both the previous run and this run recommend a retry", () => {
  const previousRun = makeRunSnapshot({ retryRecommended: true });
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport([makeIssue("ERROR", "Empty patch")])] }, emptyRecommendations(), previousRun));

  assert.equal(decision.decisionType, "STOP");
  assert.equal(decision.riskLevel, "HIGH");
  assert.ok(decision.evidenceIds.includes(previousRun.runId));
});

test("decision: STOP takes priority over CHANGE_PROVIDER/ESCALATE_TO_HUMAN when both conditions hold", () => {
  const previousRun = makeRunSnapshot({ retryRecommended: true });
  const manyErrors = Array.from({ length: 3 }, () => makeIssue("ERROR", "Empty patch"));
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport(manyErrors)] }, emptyRecommendations(), previousRun));

  assert.equal(decision.decisionType, "STOP");
});

test("decision: no previous run (null) never produces STOP by itself", () => {
  const decision = buildEngineeringDecision(inputsFor({ reports: [makeReport([makeIssue("ERROR", "Empty patch")])] }, emptyRecommendations(), null));
  assert.notEqual(decision.decisionType, "STOP");
});

// ---------------------------------------------------------------------------------------------------------
// computeValidationScore
// ---------------------------------------------------------------------------------------------------------

test("computeValidationScore: matches the average ValidationReport.score, 100 when there are zero reports", () => {
  assert.equal(computeValidationScore({ reports: [] }), 100);
  assert.equal(computeValidationScore({ reports: [{ ...makeReport([]), score: 80 }, { ...makeReport([]), score: 60 }] }), 70);
});

// ---------------------------------------------------------------------------------------------------------
// Identity, engine class, snapshot, smoke test
// ---------------------------------------------------------------------------------------------------------

test("deterministic ids: two decisions built back to back never collide", () => {
  const ids = new Set(Array.from({ length: 20 }, () => buildEngineeringDecision(inputsFor({ reports: [] })).id));
  assert.equal(ids.size, 20);
});

test("DecisionEngine.decide() and buildEngineeringDecision() agree", () => {
  const inputs = inputsFor({ reports: [] });
  const engine = new DecisionEngine();
  const viaEngine = engine.decide(inputs);
  const viaFunction = buildEngineeringDecision(inputs);
  assert.equal(viaEngine.decisionType, viaFunction.decisionType);
  assert.equal(viaEngine.reason, viaFunction.reason);
});

for (const fixture of ["web-app", "clean-architecture", "python-fastapi", "minimal"]) {
  test(`${fixture} fixture (zero patches): buildEngineeringDecision() returns CONTINUE, never a fabricated decision`, () => {
    const decision = buildEngineeringDecision(pipelineInputsFor(path.join(REPO_ANALYZER_FIXTURES, fixture)));
    assert.equal(decision.decisionType, "CONTINUE");
  });
}

test("snapshot: concentrated-monorepo's EngineeringDecision matches the stored snapshot", () => {
  const inputs = pipelineInputsFor(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const actual: EngineeringDecision = buildEngineeringDecision(inputs);
  const normalized = { ...actual, id: "<normalized>", timestamp: "<normalized>" };
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(normalized, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const decision = buildEngineeringDecision(pipelineInputsFor(repoRoot));

  assert.ok(decision.reason.length > 0);
  assert.ok(decision.nextAction.length > 0);
  assert.ok(decision.confidence > 0 && decision.confidence <= 1);
  assert.ok(["CONTINUE", "RETRY", "SPLIT_MISSION", "ESCALATE_TO_HUMAN", "CHANGE_PROVIDER", "STOP"].includes(decision.decisionType));
});
