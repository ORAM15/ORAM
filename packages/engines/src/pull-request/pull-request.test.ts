/**
 * Regression coverage for the Pull Request Engine (Capability Sprint 16).
 *
 * Covers, per the Sprint's own testing requirements:
 *   - a normal actionable decision produces an IMPLEMENTATION proposal
 *   - STOP produces a NO_ACTION proposal (no branch, explicit no-implementation title/body)
 *   - ESCALATE_TO_HUMAN requires human approval (as does HIGH risk)
 *   - the suggested branch name is deterministic
 *   - the PR body is deterministic
 *   - the repository's absolute path/environment never leaks into the proposal
 *   - a stored JSON snapshot of buildPullRequestProposal()'s output for concentrated-monorepo
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/pull-request/pull-request.test.ts
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
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import { buildEngineeringDecision } from "../adaptive-decision/analysis/build-decision";
import type { EngineeringDecision } from "../adaptive-decision/analysis/types";
import { buildPullRequestProposal } from "./analysis/build-pull-request-proposal";
import { BRANCH_PREFIX, DEFAULT_BASE_BRANCH } from "./analysis/rules";
import { PullRequestEngine } from "./PullRequestEngine";
import type { PullRequestInputs, PullRequestProposal } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "pull-request-proposal-concentrated-monorepo.snap.json");

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

function pipelineInputsFor(root: string): PullRequestInputs {
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
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });
  return { repositoryRoot: root, requestSet, planSet, validationResult, recommendationSet, reflectionReport, decision };
}

function makeDecision(overrides: Partial<EngineeringDecision> = {}): EngineeringDecision {
  return {
    id: "decision:synthetic",
    timestamp: "2026-01-01T00:00:00.000Z",
    decisionType: "CONTINUE",
    reason: "Validation acceptable and no blocking findings.",
    confidence: 0.9,
    riskLevel: "LOW",
    nextAction: "Execute implementation.",
    evidenceIds: [],
    policyIds: ["policy:continue-clean"],
    ...overrides,
  };
}

const FIXTURE = path.join(REASONING_FIXTURES, "concentrated-monorepo");

function normalizeProposal(proposal: PullRequestProposal): unknown {
  return { ...proposal, id: "<normalized>", timestamp: "<normalized>" };
}

// ---------------------------------------------------------------------------------------------------------
// Proposal kinds per decision
// ---------------------------------------------------------------------------------------------------------

test("actionable decision: the concentrated-monorepo run produces an IMPLEMENTATION proposal", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const proposal = buildPullRequestProposal(inputs);

  assert.equal(proposal.kind, "IMPLEMENTATION");
  assert.equal(proposal.decision, inputs.decision.decisionType);
  assert.equal(proposal.risk, inputs.decision.riskLevel);
  assert.equal(proposal.baseBranch, DEFAULT_BASE_BRANCH);
  assert.ok(proposal.branchName?.startsWith(BRANCH_PREFIX));
  assert.equal(proposal.proposedChanges.length, inputs.requestSet.requests.length);
  assert.deepEqual(
    proposal.implementationRequestIds,
    inputs.requestSet.requests.map((request) => request.id)
  );
  assert.deepEqual(
    proposal.executionPlanIds,
    inputs.planSet.plans.map((plan) => plan.id)
  );
  assert.ok(proposal.verification.length > 0, "the fixture's plans contain RUN_TESTS steps, so verification must not be empty");
});

test("STOP: produces a NO_ACTION proposal -- no branch, and the body says no PR should be created", () => {
  const inputs: PullRequestInputs = { ...pipelineInputsFor(FIXTURE), decision: makeDecision({ decisionType: "STOP", riskLevel: "HIGH" }) };
  const proposal = buildPullRequestProposal(inputs);

  assert.equal(proposal.kind, "NO_ACTION");
  assert.equal(proposal.branchName, null);
  assert.equal(proposal.proposedChanges.length, 0);
  assert.equal(proposal.title, "ORAM: no implementation proposed for this run");
  assert.ok(proposal.body.includes("No implementation pull request should be created"));
  assert.equal(proposal.humanApprovalRequired, true);
});

test("zero ImplementationRequests: produces a NO_ACTION proposal even when the decision is CONTINUE", () => {
  const inputs = pipelineInputsFor(path.join(REPO_ANALYZER_FIXTURES, "minimal"));
  assert.equal(inputs.requestSet.requests.length, 0, "the minimal fixture should produce zero requests");
  const proposal = buildPullRequestProposal(inputs);

  assert.equal(proposal.kind, "NO_ACTION");
  assert.equal(proposal.branchName, null);
});

// ---------------------------------------------------------------------------------------------------------
// Human approval
// ---------------------------------------------------------------------------------------------------------

test("ESCALATE_TO_HUMAN: human approval is required, and the proposal remains an IMPLEMENTATION proposal", () => {
  const inputs: PullRequestInputs = { ...pipelineInputsFor(FIXTURE), decision: makeDecision({ decisionType: "ESCALATE_TO_HUMAN", riskLevel: "HIGH" }) };
  const proposal = buildPullRequestProposal(inputs);

  assert.equal(proposal.kind, "IMPLEMENTATION");
  assert.equal(proposal.humanApprovalRequired, true);
  assert.ok(proposal.body.includes("Human approval is REQUIRED"));
});

test("HIGH risk requires approval regardless of decision type; LOW/MEDIUM actionable decisions do not", () => {
  const base = pipelineInputsFor(FIXTURE);
  assert.equal(buildPullRequestProposal({ ...base, decision: makeDecision({ decisionType: "RETRY", riskLevel: "HIGH" }) }).humanApprovalRequired, true);
  assert.equal(buildPullRequestProposal({ ...base, decision: makeDecision({ decisionType: "RETRY", riskLevel: "MEDIUM" }) }).humanApprovalRequired, false);
  assert.equal(buildPullRequestProposal({ ...base, decision: makeDecision({ decisionType: "CONTINUE", riskLevel: "LOW" }) }).humanApprovalRequired, false);
});

// ---------------------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------------------

test("determinism: the suggested branch name is identical across repeated builds, and slug-derived from the primary request", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const first = buildPullRequestProposal(inputs);
  const second = buildPullRequestProposal(inputs);

  assert.equal(first.branchName, second.branchName);
  assert.equal(first.branchName, "oram/improve-subsystem-documentation");
});

test("determinism: the PR body and title are identical across repeated builds (only id/timestamp may differ)", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const first = buildPullRequestProposal(inputs);
  const second = buildPullRequestProposal(inputs);

  assert.equal(first.body, second.body);
  assert.equal(first.title, second.title);
  assert.deepEqual(normalizeProposal(first), normalizeProposal(second));
  assert.notEqual(first.id, second.id);
});

test("no environment leak: the proposal never contains the absolute repository path, on any platform", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const proposal = buildPullRequestProposal(inputs);
  const serialized = JSON.stringify(normalizeProposal(proposal));

  assert.equal(proposal.repositoryId, "repository:concentrated-monorepo");
  assert.ok(!serialized.includes(JSON.stringify(inputs.repositoryRoot).slice(1, -1)), "the absolute repositoryRoot must never appear in a proposal");
  assert.ok(!serialized.includes(JSON.stringify(import.meta.dirname).slice(1, -1)), "no test-environment path may appear in a proposal");
});

// ---------------------------------------------------------------------------------------------------------
// Engine class, snapshot, smoke test
// ---------------------------------------------------------------------------------------------------------

test("PullRequestEngine.propose() and buildPullRequestProposal() agree", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const viaEngine = new PullRequestEngine().propose(inputs);
  const viaFunction = buildPullRequestProposal(inputs);

  assert.equal(viaEngine.body, viaFunction.body);
  assert.equal(viaEngine.branchName, viaFunction.branchName);
  assert.equal(viaEngine.kind, viaFunction.kind);
});

test("deterministic ids: two proposals built back to back never collide", () => {
  const inputs = pipelineInputsFor(FIXTURE);
  const ids = new Set(Array.from({ length: 20 }, () => buildPullRequestProposal(inputs).id));
  assert.equal(ids.size, 20);
});

test("snapshot: concentrated-monorepo's PullRequestProposal matches the stored snapshot", () => {
  const actual = normalizeProposal(buildPullRequestProposal(pipelineInputsFor(FIXTURE)));
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const proposal = buildPullRequestProposal(pipelineInputsFor(findRepositoryRoot(import.meta.dirname)));

  assert.ok(proposal.title.length > 0);
  assert.ok(proposal.body.includes("## Summary"));
  assert.ok(proposal.body.includes("## Safety"));
  assert.ok(["IMPLEMENTATION", "NO_ACTION"].includes(proposal.kind));
  assert.equal(proposal.repositoryId, "repository:oram");
});
