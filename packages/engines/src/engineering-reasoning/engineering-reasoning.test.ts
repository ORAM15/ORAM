/**
 * Regression coverage for Engineering Reasoning MVP (Capability Sprint 1, Phase 3).
 *
 * Runs the full pipeline (buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning)
 * against:
 *   - the 5 existing repository-analyzer fixtures (proving the 5 rules stay honestly silent when their
 *     condition doesn't hold -- no false positives -- except the existing monorepo fixture, which turns out
 *     to genuinely trigger 3 of the 5 rules; that is asserted explicitly, not assumed away)
 *   - one new, dedicated fixture (./__fixtures__/concentrated-monorepo) purpose-built so all 5 rules fire at
 *     least once, including one deliberate negative case (a subsystem with an API framework AND auth,
 *     proving rule 4 doesn't fire when auth is actually present)
 *
 * Run with: node --import tsx --test packages/engines/src/engineering-reasoning/engineering-reasoning.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "./analysis/build-reasoning";
import type { Finding, EngineeringReasoning } from "./analysis/types";

const REPO_ANALYZER_FIXTURES = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");
const REASONING_FIXTURES = path.join(import.meta.dirname, "__fixtures__");

/** Same loader-independent walk-up used throughout this package's siblings -- see repository-analyzer.v2.test.ts's own findRepositoryRoot() for why a hardcoded relative `..` offset is deliberately avoided. */
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

function reasonAbout(root: string): EngineeringReasoning {
  const analysis = buildRepositoryAnalysis(root);
  const knowledge = buildEngineeringKnowledge(analysis);
  return buildEngineeringReasoning(knowledge);
}

function kinds(findings: ReadonlyArray<Finding>): Set<string> {
  return new Set(findings.map((f) => f.kind));
}

function assertWellFormedFinding(finding: Finding): void {
  assert.equal(typeof finding.id, "string");
  assert.ok(finding.id.length > 0);
  assert.equal(typeof finding.kind, "string");
  assert.ok(finding.kind.length > 0);
  assert.ok(
    ["architectural-smell", "anti-pattern", "testing-gap", "cicd-gap", "scalability-concern", "security-concern", "maintainability-issue"].includes(
      finding.category
    )
  );
  assert.ok(["High", "Medium", "Low"].includes(finding.severity));
  assert.ok(["High", "Medium", "Low"].includes(finding.confidence));
  assert.ok(Array.isArray(finding.evidence));
  assert.ok(Array.isArray(finding.sourceFiles));
  assert.ok(Array.isArray(finding.sourceIds));
  assert.ok(finding.sourceIds.length > 0, "every Finding must reference at least one EngineeringKnowledge item it was derived from");
}

test("concentrated-monorepo fixture: all 5 rules fire exactly once, including one deliberate negative case", () => {
  const reasoning = reasonAbout(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.equal(reasoning.findings.length, 5);
  assert.deepEqual(
    kinds(reasoning.findings),
    new Set(["subsystem-concentration", "untested-api-surface", "unverified-monorepo", "subsystem-api-without-auth", "opaque-subsystems"])
  );

  const concentration = reasoning.findings.find((f) => f.kind === "subsystem-concentration")!;
  assert.equal(concentration.category, "architectural-smell");
  assert.ok(concentration.summary.includes("packages/api"));

  const testingGap = reasoning.findings.find((f) => f.kind === "untested-api-surface")!;
  assert.equal(testingGap.category, "testing-gap");
  assert.equal(testingGap.severity, "High");

  const cicdGap = reasoning.findings.find((f) => f.kind === "unverified-monorepo")!;
  assert.equal(cicdGap.category, "cicd-gap");
  assert.ok(cicdGap.summary.includes("4-subsystem"));

  // The negative case: exactly ONE subsystem (api) is flagged, not secure-api (which has auth) or the two
  // opaque subsystems (which have no API framework to begin with).
  const apiWithoutAuth = reasoning.findings.filter((f) => f.kind === "subsystem-api-without-auth");
  assert.equal(apiWithoutAuth.length, 1);
  assert.ok(apiWithoutAuth[0]!.summary.includes("packages/api"));
  assert.ok(!apiWithoutAuth[0]!.summary.includes("secure-api"));

  const opaque = reasoning.findings.find((f) => f.kind === "opaque-subsystems")!;
  assert.equal(opaque.category, "maintainability-issue");
  assert.ok(opaque.summary.includes("packages/utils"));
  assert.ok(opaque.summary.includes("packages/shared"));

  for (const finding of reasoning.findings) assertWellFormedFinding(finding);
});

test("web-app fixture: well-configured single-package repo produces zero Findings", () => {
  const reasoning = reasonAbout(path.join(REPO_ANALYZER_FIXTURES, "web-app"));
  assert.deepEqual(reasoning.findings, []);
});

test("clean-architecture fixture: single-package repo with no API framework produces zero Findings", () => {
  const reasoning = reasonAbout(path.join(REPO_ANALYZER_FIXTURES, "clean-architecture"));
  assert.deepEqual(reasoning.findings, []);
});

test("python-fastapi fixture: tested, flat (no-subsystem) repo produces zero Findings", () => {
  const reasoning = reasonAbout(path.join(REPO_ANALYZER_FIXTURES, "python-fastapi"));
  assert.deepEqual(reasoning.findings, []);
});

test("minimal fixture: zero evidence anywhere produces zero Findings, never a fabricated conclusion", () => {
  const reasoning = reasonAbout(path.join(REPO_ANALYZER_FIXTURES, "minimal"));
  assert.deepEqual(reasoning.findings, []);
});

test("existing monorepo fixture (from repository-analyzer/engineering-knowledge phases): genuinely triggers 3 of the 5 rules", () => {
  const reasoning = reasonAbout(path.join(REPO_ANALYZER_FIXTURES, "monorepo"));

  assert.equal(reasoning.findings.length, 3);
  assert.deepEqual(kinds(reasoning.findings), new Set(["untested-api-surface", "unverified-monorepo", "subsystem-api-without-auth"]));

  const apiWithoutAuth = reasoning.findings.find((f) => f.kind === "subsystem-api-without-auth")!;
  assert.ok(apiWithoutAuth.summary.includes("packages/pkg-b")); // pkg-b owns Express; pkg-a owns only React

  for (const finding of reasoning.findings) assertWellFormedFinding(finding);
});

test("identity is deterministic: analyzing the same fixture twice produces byte-identical Finding ids", () => {
  const first = reasonAbout(path.join(REASONING_FIXTURES, "concentrated-monorepo"));
  const second = reasonAbout(path.join(REASONING_FIXTURES, "concentrated-monorepo"));

  assert.deepEqual(
    first.findings.map((f) => f.id).sort(),
    second.findings.map((f) => f.id).sort()
  );
});

test("smoke test: the full pipeline runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const reasoning = reasonAbout(repoRoot);

  assert.ok(typeof reasoning.timestamp === "string" && Number.isFinite(Date.parse(reasoning.timestamp)));
  for (const finding of reasoning.findings) assertWellFormedFinding(finding);
});
