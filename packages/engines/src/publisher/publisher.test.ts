/**
 * Regression coverage for the Publisher Engine (Capability Sprint 20).
 *
 * Covers:
 *   - an actionable, non-approval-required proposal is PUBLISHED (simulated) through all four stages
 *   - a NO_ACTION proposal is SKIPPED -- no stage attempted, no branch
 *   - a proposal with humanApprovalRequired is SKIPPED -- no stage attempted, even though it IS actionable
 *   - MemoryPublisher is always dry-run, its stage details are deterministic and describe simulated commands
 *   - determinism: repeated builds produce identical output (only id/timestamp may differ)
 *   - the repository's absolute path/environment never leaks into the record
 *   - a stored JSON snapshot of buildPublishRecord()'s output for concentrated-monorepo
 *   - PublisherEngine.publish() agrees with buildPublishRecord()
 *   - a smoke test against this actual repository
 *
 * Run with: node --import tsx --test packages/engines/src/publisher/publisher.test.ts
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
import { buildPullRequestProposal } from "../pull-request/analysis/build-pull-request-proposal";
import type { PullRequestProposal } from "../pull-request/analysis/types";
import { buildPublishRecord } from "./analysis/build-publish-record";
import { MemoryPublisher } from "./publishers/MemoryPublisher";
import { PublisherEngine } from "./PublisherEngine";
import type { PublisherInputs, PublishRecord } from "./analysis/types";

const REASONING_FIXTURES = path.join(import.meta.dirname, "..", "engineering-reasoning", "__fixtures__");
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "publish-record-concentrated-monorepo.snap.json");
const FIXTURE = path.join(REASONING_FIXTURES, "concentrated-monorepo");

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

function proposalFor(root: string): PullRequestProposal {
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
  return buildPullRequestProposal({ repositoryRoot: root, requestSet, planSet, validationResult, recommendationSet, reflectionReport, decision });
}

function makeProposal(overrides: Partial<PullRequestProposal> = {}): PullRequestProposal {
  return {
    id: "pull-request-proposal:synthetic",
    timestamp: "2026-01-01T00:00:00.000Z",
    repositoryId: "repository:synthetic",
    kind: "IMPLEMENTATION",
    title: "ORAM: synthetic change",
    summary: "synthetic summary",
    body: "## Summary\n\nsynthetic\n",
    branchName: "oram/synthetic-change",
    baseBranch: "main",
    decision: "CONTINUE",
    risk: "LOW",
    validationScore: 100,
    humanApprovalRequired: false,
    implementationRequestIds: [],
    executionPlanIds: [],
    recommendationSummary: "No recommendations were produced for this run.",
    reflectionSummary: "synthetic",
    proposedChanges: [],
    verification: [],
    ...overrides,
  };
}

function inputsFor(proposal: PullRequestProposal, repositoryRoot = "/fake/repo"): PublisherInputs {
  return { repositoryRoot, proposal };
}

function normalizeRecord(record: PublishRecord): unknown {
  return { ...record, id: "<normalized>", timestamp: "<normalized>", proposalId: "<normalized>" };
}

// ---------------------------------------------------------------------------------------------------------
// Publish outcomes
// ---------------------------------------------------------------------------------------------------------

test("actionable, approval-not-required proposal: PUBLISHED through all four simulated stages", () => {
  const proposal = proposalFor(FIXTURE);
  const record = buildPublishRecord(inputsFor(proposal, FIXTURE));

  assert.equal(proposal.humanApprovalRequired, false, "fixture precondition: this proposal must not require approval");
  assert.equal(record.outcome, "PUBLISHED");
  assert.equal(record.branchName, proposal.branchName);
  assert.equal(record.stages.length, 4);
  assert.deepEqual(
    record.stages.map((stage) => stage.name),
    ["CREATE_BRANCH", "COMMIT", "PUSH", "CREATE_DRAFT_PULL_REQUEST"]
  );
  assert.ok(record.stages.every((stage) => stage.status === "PASS"));
  assert.equal(record.pullRequestUrl, null, "MemoryPublisher never produces a real URL");
  assert.equal(record.dryRun, true);
  assert.equal(record.publisherId, "memory-publisher-v1");
});

test("NO_ACTION proposal: SKIPPED -- no stage attempted, no branch published", () => {
  const proposal = makeProposal({ kind: "NO_ACTION", branchName: null, title: "ORAM: no implementation proposed for this run" });
  const record = buildPublishRecord(inputsFor(proposal));

  assert.equal(record.outcome, "SKIPPED");
  assert.equal(record.stages.length, 0);
  assert.equal(record.branchName, null);
  assert.equal(record.pullRequestUrl, null);
  assert.ok(record.reason.includes("nothing to publish"));
});

test("humanApprovalRequired proposal: SKIPPED even though it IS actionable -- publishing still requires its own approval", () => {
  const proposal = makeProposal({ kind: "IMPLEMENTATION", humanApprovalRequired: true, decision: "ESCALATE_TO_HUMAN", risk: "HIGH" });
  const record = buildPublishRecord(inputsFor(proposal));

  assert.equal(record.outcome, "SKIPPED");
  assert.equal(record.stages.length, 0);
  assert.ok(record.reason.includes("requires human approval"));
});

test("actionable and approval-not-required, but a synthetic branch name is still required to publish: sanity of the gate's own precondition", () => {
  // An IMPLEMENTATION proposal always carries a branchName (rules.ts's own buildBranchName) -- this just
  // pins that MemoryPublisher's CREATE_BRANCH stage really does receive and use it.
  const proposal = makeProposal({ branchName: "oram/explicit-branch" });
  const record = buildPublishRecord(inputsFor(proposal));

  assert.equal(record.outcome, "PUBLISHED");
  assert.ok(record.stages[0]!.details.includes("oram/explicit-branch"));
});

// ---------------------------------------------------------------------------------------------------------
// MemoryPublisher determinism
// ---------------------------------------------------------------------------------------------------------

test("MemoryPublisher: dry-run stage details describe the simulated command, never touching git/filesystem/network", () => {
  const client = new MemoryPublisher();
  assert.equal(client.dryRun, true);

  const createBranch = client.createBranch({ branchName: "oram/x" });
  assert.equal(createBranch.status, "PASS");
  assert.ok(createBranch.details.includes("[dry-run]"));
  assert.ok(createBranch.details.includes("git checkout -b oram/x"));

  const draftPr = client.createDraftPullRequest({ branchName: "oram/x", baseBranch: "main", title: "T", body: "B" });
  assert.equal(draftPr.pullRequestUrl, null);
});

// ---------------------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------------------

test("determinism: repeated builds from the same proposal are identical (only id/timestamp/proposalId-independent fields may differ)", () => {
  const proposal = proposalFor(FIXTURE);
  const inputs = inputsFor(proposal, FIXTURE);
  const first = buildPublishRecord(inputs);
  const second = buildPublishRecord(inputs);

  assert.deepEqual(normalizeRecord(first), normalizeRecord(second));
  assert.notEqual(first.id, second.id);
});

test("no environment leak: the record never contains the absolute repository path, on any platform", () => {
  const proposal = proposalFor(FIXTURE);
  const record = buildPublishRecord(inputsFor(proposal, FIXTURE));
  const serialized = JSON.stringify(normalizeRecord(record));

  assert.equal(record.repositoryId, "repository:concentrated-monorepo");
  assert.ok(!serialized.includes(JSON.stringify(FIXTURE).slice(1, -1)), "the absolute repositoryRoot must never appear in a record");
});

// ---------------------------------------------------------------------------------------------------------
// Engine class, snapshot, smoke test
// ---------------------------------------------------------------------------------------------------------

test("PublisherEngine.publish() and buildPublishRecord() agree", () => {
  const proposal = proposalFor(FIXTURE);
  const inputs = inputsFor(proposal, FIXTURE);
  const viaEngine = new PublisherEngine().publish(inputs);
  const viaFunction = buildPublishRecord(inputs);

  assert.equal(viaEngine.outcome, viaFunction.outcome);
  assert.equal(viaEngine.branchName, viaFunction.branchName);
  assert.deepEqual(
    viaEngine.stages.map((s) => s.status),
    viaFunction.stages.map((s) => s.status)
  );
});

test("deterministic ids: two records built back to back never collide", () => {
  const proposal = proposalFor(FIXTURE);
  const inputs = inputsFor(proposal, FIXTURE);
  const ids = new Set(Array.from({ length: 20 }, () => buildPublishRecord(inputs).id));
  assert.equal(ids.size, 20);
});

test("snapshot: concentrated-monorepo's PublishRecord matches the stored snapshot", () => {
  const proposal = proposalFor(FIXTURE);
  const actual = normalizeRecord(buildPublishRecord(inputsFor(proposal, FIXTURE)));
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(actual, expected);
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const root = findRepositoryRoot(import.meta.dirname);
  const proposal = proposalFor(root);
  const record = buildPublishRecord(inputsFor(proposal, root));

  assert.ok(["PUBLISHED", "SKIPPED", "FAILED"].includes(record.outcome));
  assert.equal(record.repositoryId, "repository:oram");
  assert.equal(record.dryRun, true);
  assert.equal(record.pullRequestUrl, null);
});
