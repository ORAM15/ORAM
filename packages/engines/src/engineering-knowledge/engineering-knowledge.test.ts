/**
 * Regression coverage for Engineering Knowledge v2 (Capability Sprint 1, Phase 2), including the Identity
 * Preservation milestone: every Detection/Subsystem/DependencyRelationship carries a stable id, and
 * relationships are referenced by id rather than flattened into bare label arrays.
 *
 * Reuses the repository-analyzer package's own fixtures (../repository-analyzer/__fixtures__/) rather than
 * duplicating them -- buildEngineeringKnowledge() is a pure transform of a RepositoryAnalysis, so those
 * fixtures already give precise, hand-computed inputs to assert against.
 *
 * Run with: node --import tsx --test packages/engines/src/engineering-knowledge/engineering-knowledge.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "./analysis/build-knowledge";
import type { Detection, RepositoryAnalysis } from "../repository-analyzer/analysis/types";
import type { EngineeringKnowledge } from "./analysis/types";

const FIXTURES_ROOT = path.join(import.meta.dirname, "..", "repository-analyzer", "__fixtures__");

/** Same loader-independent walk-up as repository-analyzer.v2.test.ts's own findRepositoryRoot() -- see that file's comment for why a hardcoded relative `..` offset is deliberately avoided here. */
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

function analyze(fixtureName: string): { analysis: RepositoryAnalysis; knowledge: EngineeringKnowledge } {
  const analysis = buildRepositoryAnalysis(path.join(FIXTURES_ROOT, fixtureName));
  return { analysis, knowledge: buildEngineeringKnowledge(analysis) };
}

function values(detections: ReadonlyArray<Detection<string>>): Set<string> {
  return new Set(detections.map((d) => d.value));
}

function assertWellFormedDetection<T>(detection: Detection<T>): void {
  assert.equal(typeof detection.id, "string");
  assert.ok(detection.id.length > 0);
  assert.equal(typeof detection.kind, "string");
  assert.ok(detection.kind.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(detection.confidence));
  assert.ok(Array.isArray(detection.evidence));
  assert.ok(Array.isArray(detection.sourceFiles));
  assert.ok(Array.isArray(detection.sourceDetectionIds));
}

/** Every id in an array must be unique -- the whole point of "stable identity" collapses if two different facts can share one id. */
function assertUniqueIds(detections: ReadonlyArray<{ id: string }>): void {
  const ids = detections.map((d) => d.id);
  assert.deepEqual(ids, [...new Set(ids)], "expected every id in this array to be unique");
}

/** Collects every Detection id that exists anywhere in a RepositoryAnalysis, for dangling-reference checks. */
function allDetectionIds(analysis: RepositoryAnalysis): Set<string> {
  const ids = new Set<string>();
  const collect = (detections: ReadonlyArray<Detection<unknown>>) => detections.forEach((d) => ids.add(d.id));
  ids.add(analysis.projectType.id);
  collect(analysis.primaryLanguages);
  collect(analysis.frameworks);
  collect(analysis.apiFrameworks);
  collect(analysis.packageManagers);
  collect(analysis.buildTools);
  collect(analysis.testingFrameworks);
  collect(analysis.entryPoints);
  collect(analysis.configurationFiles);
  collect(analysis.architecturalPatterns);
  ids.add(analysis.monorepo.id);
  collect(analysis.environmentFiles);
  collect(analysis.ciCdSystems);
  ids.add(analysis.docker.id);
  collect(analysis.infrastructureFiles);
  collect(analysis.databaseTechnologies);
  collect(analysis.authenticationLibraries);
  collect(analysis.aiLlmLibraries);
  collect(analysis.cloudProviders);
  collect(analysis.deploymentTargets);
  return ids;
}

test("web-app fixture: single-package repo attributes all technologies to the project, not to `src`", () => {
  const { analysis, knowledge } = analyze("web-app");

  assert.equal(knowledge.subsystems.length, 1);
  const src = knowledge.subsystems[0]!;
  assert.equal(src.id, "subsystem:src");
  assert.equal(src.path, "src");
  assert.equal(src.role, "source");
  assert.deepEqual(src.relationshipIds, []);
  // "Medium": a naming-convention match ("src") -- structural identification confidence, no longer conflated
  // with "how many relationships does this subsystem happen to own" (0, honestly visible via relationshipIds).
  assert.equal(src.confidence, "Medium");
  assert.deepEqual(src.evidence, ["src"]);

  assert.equal(knowledge.dependencyRelationships.length, 11);
  assert.ok(knowledge.dependencyRelationships.every((r) => r.from === "repository:demo-web-app"));
  const reactRelationship = knowledge.dependencyRelationships.find((r) => r.to === "React" && r.kind === "uses-framework");
  assert.ok(reactRelationship);
  assert.equal(reactRelationship!.toId, "framework:react");
  assert.ok(knowledge.dependencyRelationships.some((r) => r.to === "Express" && r.kind === "uses-api-framework"));

  assert.equal(knowledge.architectureSummary.value, "demo-web-app is a Full-stack web application. Primary language(s): JavaScript. Likely MVC (Model-View-Controller). 1 subsystem(s) were identified.");
  assert.equal(knowledge.architectureSummary.confidence, "High");
  assert.ok(knowledge.architectureSummary.sourceDetectionIds.includes(analysis.projectType.id));

  assert.equal(knowledge.technologyStackNarrative.confidence, "High");
  assert.ok(knowledge.technologyStackNarrative.value.includes("Frameworks: React"));

  assert.deepEqual(values(knowledge.architecturalStrengths), new Set([
    "Automated testing is configured (Jest).",
    "Continuous integration is configured (GitHub Actions).",
    "Containerization (Docker) supports reproducible builds/deployments.",
    "An ORM/ODM is used (MongoDB (Mongoose)), reducing raw-query risk and improving maintainability.",
    "A recognizable architectural pattern was detected (Likely MVC (Model-View-Controller)), suggesting intentional structural organization.",
    "Configuration is externalized via environment files rather than hardcoded.",
  ]));
  assert.deepEqual(knowledge.architecturalRisks, []);
  assert.deepEqual(knowledge.technicalDebtAreas, []);
  assert.deepEqual(knowledge.missingEngineeringPractices, []);

  // Identity checks: unique ids, no dangling references.
  assertUniqueIds(knowledge.subsystems);
  assertUniqueIds(knowledge.dependencyRelationships);
  const knownDetectionIds = allDetectionIds(analysis);
  for (const relationship of knowledge.dependencyRelationships) {
    assert.ok(knownDetectionIds.has(relationship.toId), `relationship.toId "${relationship.toId}" must reference a real RepositoryAnalysis Detection`);
  }
  for (const subsystem of knowledge.subsystems) {
    for (const relationshipId of subsystem.relationshipIds) {
      assert.ok(
        knowledge.dependencyRelationships.some((r) => r.id === relationshipId),
        `subsystem.relationshipIds entry "${relationshipId}" must reference a real relationship`
      );
    }
  }

  for (const detection of [knowledge.architectureSummary, knowledge.technologyStackNarrative, ...knowledge.architecturalStrengths]) {
    assertWellFormedDetection(detection);
  }
  for (const relationship of knowledge.dependencyRelationships) {
    assert.equal(typeof relationship.id, "string");
    assert.ok(relationship.id.length > 0);
    assert.ok(["High", "Medium", "Low"].includes(relationship.confidence));
    assert.ok(Array.isArray(relationship.evidence));
  }
});

test("clean-architecture fixture: TypeScript + Clean Architecture strengths, missing testing/CI/lint flagged", () => {
  const { knowledge } = analyze("clean-architecture");

  assert.equal(knowledge.subsystems.length, 1);
  assert.equal(knowledge.subsystems[0]!.path, "src");
  assert.equal(knowledge.subsystems[0]!.confidence, "Medium");

  assert.equal(knowledge.dependencyRelationships.length, 1);
  assert.equal(knowledge.dependencyRelationships[0]?.to, "TypeScript");
  assert.equal(knowledge.dependencyRelationships[0]?.from, "repository:demo-clean-architecture");
  assert.equal(knowledge.dependencyRelationships[0]?.toId, "build-tool:typescript");

  assert.deepEqual(values(knowledge.architecturalStrengths), new Set([
    "Static typing (TypeScript) is used, reducing a class of runtime errors.",
    "A recognizable architectural pattern was detected (Likely Clean/Hexagonal Architecture), suggesting intentional structural organization.",
  ]));

  assert.equal(knowledge.technicalDebtAreas.length, 1);
  assert.ok(knowledge.technicalDebtAreas[0]?.value.includes("no matching lockfile"));

  assert.deepEqual(values(knowledge.missingEngineeringPractices), new Set([
    "No automated testing framework was detected.",
    "No CI/CD configuration was detected.",
    "No ESLint configuration was detected for this JavaScript/TypeScript codebase.",
  ]));
});

test("python-fastapi fixture: pip ecosystem produces FastAPI/SQLAlchemy strengths, missing CI/env flagged, no false ESLint claim", () => {
  const { knowledge } = analyze("python-fastapi");

  // No directories in this fixture at all -- honestly zero subsystems, not a guess.
  assert.deepEqual(knowledge.subsystems, []);

  assert.equal(knowledge.dependencyRelationships.length, 6);
  assert.ok(knowledge.dependencyRelationships.every((r) => r.from === "repository:python-fastapi"));

  assert.deepEqual(values(knowledge.architecturalStrengths), new Set([
    "Automated testing is configured (pytest).",
    "Containerization (Docker) supports reproducible builds/deployments.",
    "An ORM/ODM is used (SQLAlchemy), reducing raw-query risk and improving maintainability.",
  ]));
  assert.deepEqual(knowledge.architecturalRisks, []);

  assert.equal(knowledge.technicalDebtAreas.length, 1);
  assert.ok(knowledge.technicalDebtAreas[0]?.value.includes("poetry/Pipenv lockfile"));

  const missing = values(knowledge.missingEngineeringPractices);
  assert.deepEqual(missing, new Set([
    "No CI/CD configuration was detected.",
    "Database/authentication dependencies were detected but no .env-pattern file (e.g. .env.example) was found -- onboarding configuration may be undocumented.",
  ]));
  // Never a false claim about a language-specific practice this analyzer didn't actually check for.
  assert.ok(![...missing].some((v) => v.includes("ESLint")));
});

test("monorepo fixture: package.json-per-workspace attributes React/Express to their own package, not the repo", () => {
  const { knowledge } = analyze("monorepo");

  assert.equal(knowledge.subsystems.length, 2);
  const pkgA = knowledge.subsystems.find((s) => s.path === "packages/pkg-a");
  const pkgB = knowledge.subsystems.find((s) => s.path === "packages/pkg-b");
  assert.ok(pkgA && pkgB);
  assert.equal(pkgA!.id, "subsystem:packages-pkg-a");
  assert.equal(pkgA!.confidence, "High"); // structural inference (child of a "package"-role directory), not a naming guess
  assert.equal(pkgA!.relationshipIds.length, 1);
  assert.equal(pkgB!.relationshipIds.length, 1);

  const reactRelationshipId = pkgA!.relationshipIds[0]!;
  const reactRelationship = knowledge.dependencyRelationships.find((r) => r.id === reactRelationshipId);
  assert.equal(reactRelationship?.to, "React");

  const expressRelationshipId = pkgB!.relationshipIds[0]!;
  const expressRelationship = knowledge.dependencyRelationships.find((r) => r.id === expressRelationshipId);
  assert.equal(expressRelationship?.to, "Express");

  assert.equal(knowledge.dependencyRelationships.length, 2);
  assert.ok(knowledge.dependencyRelationships.some((r) => r.from === "subsystem:packages-pkg-a" && r.to === "React"));
  assert.ok(knowledge.dependencyRelationships.some((r) => r.from === "subsystem:packages-pkg-b" && r.to === "Express"));

  assert.deepEqual(knowledge.architecturalStrengths, []);
  assert.deepEqual(values(knowledge.architecturalRisks), new Set([
    "An API framework (Express) was detected with no authentication library evidence -- verify access control is implemented.",
    "A monorepo was detected with no CI/CD configuration -- changes may not be automatically verified across workspace packages.",
  ]));
  assert.deepEqual(knowledge.technicalDebtAreas, []);
  assert.deepEqual(values(knowledge.missingEngineeringPractices), new Set([
    "No automated testing framework was detected.",
    "No CI/CD configuration was detected.",
    "No ESLint configuration was detected for this JavaScript/TypeScript codebase.",
    "No entry point was detected (no package.json main/bin field, no conventional entry filename).",
  ]));

  assert.ok(knowledge.architectureSummary.value.includes("monorepo"));
  assertUniqueIds(knowledge.subsystems);
  assertUniqueIds(knowledge.dependencyRelationships);
});

test("minimal fixture: zero evidence yields Unknown narrative and only the practices that can honestly be checked with no manifest", () => {
  const { knowledge } = analyze("minimal");

  assert.deepEqual(knowledge.subsystems, []);
  assert.deepEqual(knowledge.dependencyRelationships, []);
  assert.equal(knowledge.architectureSummary.value, "Unknown");
  assert.equal(knowledge.architectureSummary.confidence, "Low");
  assert.equal(knowledge.technologyStackNarrative.value, "Unknown");
  assert.deepEqual(knowledge.architecturalStrengths, []);
  assert.deepEqual(knowledge.architecturalRisks, []);
  assert.deepEqual(knowledge.technicalDebtAreas, []);
  assert.deepEqual(values(knowledge.missingEngineeringPractices), new Set([
    "No automated testing framework was detected.",
    "No CI/CD configuration was detected.",
    "No entry point was detected (no package.json main/bin field, no conventional entry filename).",
  ]));
});

test("identity is deterministic: analyzing the same fixture twice produces byte-identical ids", () => {
  const first = analyze("web-app");
  const second = analyze("web-app");

  assert.deepEqual(
    first.knowledge.subsystems.map((s) => s.id),
    second.knowledge.subsystems.map((s) => s.id)
  );
  assert.deepEqual(
    first.knowledge.dependencyRelationships.map((r) => r.id).sort(),
    second.knowledge.dependencyRelationships.map((r) => r.id).sort()
  );
  assert.equal(first.knowledge.architectureSummary.id, second.knowledge.architectureSummary.id);
});

test("smoke test: buildEngineeringKnowledge() runs against this actual repository's own analysis without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const analysis = buildRepositoryAnalysis(repoRoot);
  const knowledge = buildEngineeringKnowledge(analysis);

  assert.ok(["High", "Medium", "Low"].includes(knowledge.architectureSummary.confidence));
  assert.ok(typeof knowledge.timestamp === "string" && Number.isFinite(Date.parse(knowledge.timestamp)));
  for (const detection of [knowledge.architectureSummary, knowledge.technologyStackNarrative, ...knowledge.architecturalStrengths, ...knowledge.missingEngineeringPractices]) {
    assertWellFormedDetection(detection);
  }
  assertUniqueIds(knowledge.subsystems);
  assertUniqueIds(knowledge.dependencyRelationships);
});
