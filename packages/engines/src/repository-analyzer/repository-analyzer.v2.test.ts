/**
 * Regression coverage for the v2, repository-agnostic Repository Analyzer (Capability Sprint 1, Milestone 1).
 *
 * Runs buildRepositoryAnalysis() (./analysis/build-analysis.ts) against a handful of small, purpose-built
 * fixture repositories under ./__fixtures__/ -- each isolates one or two detection categories so assertions
 * stay precise -- plus one smoke test against this actual repository (MP6 itself), proving the analyzer
 * doesn't crash on a large, real, multi-package tree.
 *
 * Run with: node --import tsx --test packages/engines/src/repository-analyzer/repository-analyzer.v2.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { buildRepositoryAnalysis } from "./analysis/build-analysis";
import type { Detection, RepositoryAnalysis } from "./analysis/types";

const FIXTURES_ROOT = path.join(import.meta.dirname, "__fixtures__");

/**
 * Loader-independent walk-up, same technique (and same reason) as repository-analyzer.regression.test.ts's
 * own findRepositoryRoot() -- a hardcoded relative `..` offset was found to differ between Node's native
 * --experimental-strip-types and tsx for `import.meta.dirname` on a .ts file; searching for a stable marker
 * avoids repeating that bug here.
 */
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

function fixture(name: string): RepositoryAnalysis {
  return buildRepositoryAnalysis(path.join(FIXTURES_ROOT, name));
}

function labels(detections: ReadonlyArray<Detection<string>>): Set<string> {
  return new Set(detections.map((d) => d.value));
}

/** Every Detection must carry well-formed metadata -- the contract this whole feature is built on. */
function assertWellFormedDetection<T>(detection: Detection<T>): void {
  assert.equal(typeof detection.id, "string");
  assert.ok(detection.id.length > 0, "expected a non-empty stable id");
  assert.equal(typeof detection.kind, "string");
  assert.ok(detection.kind.length > 0, "expected a non-empty kind");
  assert.ok(["High", "Medium", "Low"].includes(detection.confidence), `expected a valid confidence, got "${detection.confidence}"`);
  assert.ok(Array.isArray(detection.evidence));
  assert.ok(Array.isArray(detection.sourceFiles));
  assert.ok(Array.isArray(detection.sourceDetectionIds));
  if (detection.confidence !== "Low") {
    assert.ok(detection.evidence.length > 0, "non-Low-confidence detections must carry evidence");
  }
}

/** Every id in an array must be unique -- the whole point of "stable identity" collapses if two different facts can share one id. */
function assertUniqueIds(detections: ReadonlyArray<{ id: string }>): void {
  const ids = detections.map((d) => d.id);
  assert.deepEqual(ids, [...new Set(ids)], "expected every id in this array to be unique");
}

test("web-app fixture: full-stack Node/React/Express app is detected with rich, evidence-backed metadata", () => {
  const analysis = fixture("web-app");

  assert.equal(analysis.projectType.value, "Full-stack web application");
  assert.equal(analysis.projectType.confidence, "High");
  assertWellFormedDetection(analysis.projectType);

  assert.deepEqual(labels(analysis.primaryLanguages), new Set(["JavaScript"]));
  assert.equal(analysis.primaryLanguages[0]?.confidence, "High");

  assert.deepEqual(labels(analysis.frameworks), new Set(["React", "React DOM"]));
  assert.ok(analysis.frameworks.some((d) => d.id === "framework:react" && d.kind === "framework"));
  assert.deepEqual(labels(analysis.apiFrameworks), new Set(["Express"]));
  assert.deepEqual(labels(analysis.buildTools), new Set(["TypeScript", "Webpack"]));
  assert.deepEqual(labels(analysis.testingFrameworks), new Set(["Jest"]));
  assert.deepEqual(labels(analysis.databaseTechnologies), new Set(["MongoDB (Mongoose)"]));
  assert.deepEqual(labels(analysis.authenticationLibraries), new Set(["JSON Web Tokens (jsonwebtoken)", "bcrypt"]));
  assert.deepEqual(labels(analysis.aiLlmLibraries), new Set(["OpenAI SDK"]));
  assert.deepEqual(labels(analysis.cloudProviders), new Set(["AWS SDK"]));
  assert.deepEqual(labels(analysis.packageManagers), new Set(["npm"]));
  assert.deepEqual(labels(analysis.configurationFiles), new Set(["TypeScript config", "ESLint config", "Jest config"]));
  assert.deepEqual(labels(analysis.environmentFiles), new Set([".env file"]));
  assert.deepEqual(labels(analysis.ciCdSystems), new Set(["GitHub Actions"]));
  assert.deepEqual(labels(analysis.deploymentTargets), new Set(["Vercel"]));
  assert.deepEqual(analysis.infrastructureFiles, []);

  assert.equal(analysis.docker.value, true);
  assert.equal(analysis.docker.confidence, "High");
  assert.deepEqual(new Set(analysis.docker.sourceFiles), new Set(["Dockerfile", "docker-compose.yml", ".dockerignore"]));

  assert.deepEqual(labels(analysis.architecturalPatterns), new Set(["Likely MVC (Model-View-Controller)"]));
  assert.equal(analysis.architecturalPatterns[0]?.confidence, "High");

  assert.equal(analysis.monorepo.value, false);

  // Explicit package.json "main" field and the conventional-filename match now coincide on the same path --
  // exactly one entry, not two colliding on the same id (previously a disclosed, unfixed duplicate).
  assert.equal(analysis.entryPoints.length, 1);
  assert.ok(analysis.entryPoints.some((e) => e.value === "src/index.js" && e.confidence === "High"));
  assert.ok(analysis.repositoryStructure.some((e) => e.path === "src" && e.role === "source" && e.confidence === "Medium"));
  assert.ok(analysis.repositoryStructure.some((e) => e.path === ".github" && e.role === "ci" && e.confidence === "Medium"));

  assert.equal(analysis.fileCount, 15);
  assert.equal(analysis.dependencySummary.totalDependencies, 11);
  assert.equal(analysis.dependencySummary.manifests.length, 1);
  assert.equal(analysis.dependencySummary.manifests[0]?.ecosystem, "npm");
  assert.equal(analysis.dependencySummary.manifests[0]?.id, "manifest:package-json");
  assert.deepEqual(
    new Set(analysis.dependencySummary.manifests[0]?.dependencyNames),
    new Set(["react", "react-dom", "express", "mongoose", "jsonwebtoken", "bcrypt", "openai", "@aws-sdk/client-s3", "jest", "typescript", "webpack"])
  );

  // Every non-empty Detection array must be well-formed, not just the ones asserted above by value.
  for (const detection of [
    ...analysis.frameworks,
    ...analysis.apiFrameworks,
    ...analysis.buildTools,
    ...analysis.testingFrameworks,
    ...analysis.databaseTechnologies,
    ...analysis.authenticationLibraries,
    ...analysis.aiLlmLibraries,
    ...analysis.cloudProviders,
    ...analysis.packageManagers,
    analysis.projectType,
    analysis.docker,
    analysis.monorepo,
  ]) {
    assertWellFormedDetection(detection);
  }
  assertUniqueIds(analysis.entryPoints);
  assertUniqueIds([...analysis.frameworks, ...analysis.databaseTechnologies, ...analysis.authenticationLibraries]);
});

test("clean-architecture fixture: src/domain + src/application + src/infrastructure is detected as Clean/Hexagonal Architecture", () => {
  const analysis = fixture("clean-architecture");

  assert.deepEqual(labels(analysis.architecturalPatterns), new Set(["Likely Clean/Hexagonal Architecture"]));
  const pattern = analysis.architecturalPatterns[0]!;
  assert.equal(pattern.confidence, "High");
  assert.deepEqual(new Set(pattern.sourceFiles), new Set(["src/domain", "src/application", "src/infrastructure"]));

  assert.deepEqual(labels(analysis.primaryLanguages), new Set(["TypeScript"]));
  assert.equal(analysis.projectType.value, "Library/package");
  assert.equal(analysis.fileCount, 5);
});

test("python-fastapi fixture: pip ecosystem frameworks/database/testing/auth/AI are detected from requirements.txt", () => {
  const analysis = fixture("python-fastapi");

  assert.deepEqual(labels(analysis.apiFrameworks), new Set(["FastAPI"]));
  assert.deepEqual(labels(analysis.databaseTechnologies), new Set(["SQLAlchemy", "PostgreSQL (psycopg2)"]));
  assert.deepEqual(labels(analysis.testingFrameworks), new Set(["pytest"]));
  assert.deepEqual(labels(analysis.aiLlmLibraries), new Set(["OpenAI SDK"]));
  assert.deepEqual(labels(analysis.authenticationLibraries), new Set(["python-jose (JWT)"]));

  assert.deepEqual(labels(analysis.packageManagers), new Set(["pip"]));
  assert.equal(analysis.packageManagers[0]?.confidence, "Medium");

  assert.equal(analysis.docker.value, true);
  assert.deepEqual(labels(analysis.deploymentTargets), new Set(["Heroku"]));

  assert.equal(analysis.projectType.value, "Backend API service");
  assert.deepEqual(labels(analysis.primaryLanguages), new Set(["Python"]));

  assert.equal(analysis.dependencySummary.manifests.length, 1);
  assert.equal(analysis.dependencySummary.manifests[0]?.ecosystem, "pip");
  assert.equal(analysis.dependencySummary.totalDependencies, 7);
});

test("monorepo fixture: workspaces + multiple package.json files are detected as a High-confidence monorepo", () => {
  const analysis = fixture("monorepo");

  assert.equal(analysis.monorepo.value, true);
  assert.equal(analysis.monorepo.confidence, "High");
  assert.ok(analysis.monorepo.evidence.some((line) => line.includes("workspaces")));

  assert.deepEqual(labels(analysis.architecturalPatterns), new Set(["Monorepo (packages/* convention)"]));
  assert.deepEqual(labels(analysis.packageManagers), new Set(["pnpm"]));
  assert.deepEqual(labels(analysis.frameworks), new Set(["React"]));
  assert.deepEqual(labels(analysis.apiFrameworks), new Set(["Express"]));

  assert.equal(analysis.projectType.value, "Monorepo (full-stack web application)");
  assert.equal(analysis.projectType.confidence, "High");

  assert.equal(analysis.dependencySummary.manifests.length, 3);
  assert.equal(analysis.dependencySummary.totalDependencies, 2);
});

test("minimal fixture: no evidence anywhere yields honest Unknown/empty results, never a guess", () => {
  const analysis = fixture("minimal");

  assert.equal(analysis.projectType.value, "Unknown");
  assert.equal(analysis.projectType.confidence, "Low");
  assert.deepEqual(analysis.projectType.evidence, []);

  assert.equal(analysis.primaryLanguages.length, 1);
  assert.equal(analysis.primaryLanguages[0]?.value, "Unknown");

  assert.equal(analysis.monorepo.value, false);
  assert.equal(analysis.docker.value, false);

  assert.equal(analysis.architecturalPatterns.length, 1);
  assert.equal(analysis.architecturalPatterns[0]?.value, "Unknown");

  for (const detections of [
    analysis.frameworks,
    analysis.apiFrameworks,
    analysis.buildTools,
    analysis.testingFrameworks,
    analysis.packageManagers,
    analysis.configurationFiles,
    analysis.environmentFiles,
    analysis.ciCdSystems,
    analysis.infrastructureFiles,
    analysis.databaseTechnologies,
    analysis.authenticationLibraries,
    analysis.aiLlmLibraries,
    analysis.cloudProviders,
    analysis.deploymentTargets,
    analysis.entryPoints,
  ]) {
    assert.deepEqual(detections, []);
  }

  assert.equal(analysis.fileCount, 1);
  assert.equal(analysis.dependencySummary.totalDependencies, 0);
  assert.deepEqual(analysis.dependencySummary.manifests, []);
});

test("identity is deterministic: analyzing the same fixture twice produces byte-identical ids", () => {
  const first = fixture("web-app");
  const second = fixture("web-app");

  assert.deepEqual(
    first.frameworks.map((d) => d.id).sort(),
    second.frameworks.map((d) => d.id).sort()
  );
  assert.equal(first.projectType.id, second.projectType.id);
  assert.equal(first.docker.id, second.docker.id);
  assert.deepEqual(
    first.repositoryStructure.map((e) => e.id).sort(),
    second.repositoryStructure.map((e) => e.id).sort()
  );
});

test("smoke test: buildRepositoryAnalysis() runs against this actual repository without crashing", () => {
  const repoRoot = findRepositoryRoot(import.meta.dirname);
  const analysis = buildRepositoryAnalysis(repoRoot);

  assert.ok(analysis.fileCount > 0);
  assert.ok(analysis.languages.length > 0);
  assert.ok(analysis.primaryLanguages.length > 0);
  assert.ok(["High", "Medium", "Low"].includes(analysis.projectType.confidence));
  assert.ok(typeof analysis.timestamp === "string" && Number.isFinite(Date.parse(analysis.timestamp)));
  // Every detection this run produced must still be well-formed, whatever this real repository's actual stack is.
  for (const detection of [...analysis.frameworks, ...analysis.buildTools, ...analysis.packageManagers, analysis.projectType, analysis.docker]) {
    assertWellFormedDetection(detection);
  }
  assertUniqueIds([...analysis.frameworks, ...analysis.buildTools, ...analysis.packageManagers]);
  assertUniqueIds(analysis.entryPoints);
  assertUniqueIds(analysis.repositoryStructure);
  assertUniqueIds(analysis.dependencySummary.manifests);
});
