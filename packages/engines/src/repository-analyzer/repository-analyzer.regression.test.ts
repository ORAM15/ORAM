/**
 * Regression coverage for LegacyRepositoryAnalyzerAdapter (Phase 3 Task 4).
 *
 * Runs BOTH paths against this actual repository and compares their output:
 *   (A) "legacy script"  -- scripts/repository-intelligence.js's own buildAnalysis(), called directly, no
 *       adapter, no Runtime involved at all.
 *   (B) "runtime engine" -- the exact same legacy buildAnalysis(), reached through
 *       createLegacyRepositoryAnalyzerAdapter() -> a real EngineRunner -> a real FileSystemArtifactStore,
 *       then read back via ArtifactStore.read() -- proving the full Phase 2/3 wrapping path end to end.
 *
 * INTENTIONAL DIFFERENCE (documented per Phase 3 Task 4's own instruction):
 *   `timestamp` WILL differ between (A) and (B). scripts/repository-intelligence.js's buildAnalysis() sets
 *   `timestamp: new Date().toISOString()` as its very last step (see that file's buildAnalysis(), final
 *   field) -- every call, whether direct or wrapped, legitimately produces a fresh timestamp. This is not a
 *   defect introduced by wrapping: running the legacy CLI twice in a row (`node
 *   scripts/repository-intelligence.js`) has always produced two different timestamps too. Every other field
 *   is asserted for exact structural equality; `timestamp` is deliberately excluded from that comparison and
 *   separately asserted to be a valid, recent ISO-8601 string on both sides.
 *
 * Uses node:test (this repository's own established convention -- see e.g.
 * scripts/repository-intelligence.test.js's header for precedent; no Jest anywhere in this codebase).
 * Run with: node --experimental-strip-types --test packages/engines/src/repository-analyzer/repository-analyzer.regression.test.ts
 * (requires Node 22.6+ for native TypeScript type-stripping, and @oram/* package resolution -- see this
 * phase's final report for exactly how that was verified without a full workspace install.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  createRuntimeContext,
  InMemoryEventBus,
  InMemoryProviderRegistry,
  BufferedLogger,
  FileSystemArtifactStore,
  EngineRunner,
} from "@oram/runtime";

import { createLegacyRepositoryAnalyzerAdapter } from "./LegacyRepositoryAnalyzerAdapter";
import type { LegacyRepositoryAnalysis, LegacyRepositoryIntelligenceModule } from "./types";

const require = createRequire(import.meta.url);

/**
 * Walks upward from `startDir` until a directory containing `scripts/repository-intelligence.js` is found.
 * Deliberately NOT a hardcoded relative offset (e.g. `path.resolve(dir, "../../../../..")`): different
 * TypeScript loaders (Node's native --experimental-strip-types vs. tsx) were observed to report
 * `import.meta.dirname` for this same file differently by one directory level, which silently broke a
 * fixed-offset computation. Searching for the actual marker file is robust to that discrepancy regardless
 * of which loader runs this test. See LegacyRepositoryAnalyzerAdapter.ts's own KNOWN LIMITATION note: this
 * only finds the right repository because ORAM's scripts/ and the analyzed repository are still colocated
 * (ORAM_V3_MIGRATION_PLAN.md Milestone 5 not yet done).
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

const REPOSITORY_ROOT = findRepositoryRoot(import.meta.dirname);

/** Fields expected to differ between two independent invocations -- see the file-level INTENTIONAL DIFFERENCE note. */
const TIME_VARYING_FIELDS = ["timestamp"] as const;

function withoutTimeVaryingFields(analysis: LegacyRepositoryAnalysis): Omit<LegacyRepositoryAnalysis, "timestamp"> {
  const clone: Partial<LegacyRepositoryAnalysis> = { ...analysis };
  for (const field of TIME_VARYING_FIELDS) delete clone[field];
  return clone as Omit<LegacyRepositoryAnalysis, "timestamp">;
}

function isRecentIsoTimestamp(value: string, withinMs = 60_000): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(Date.now() - parsed) <= withinMs;
}

test("(A) legacy script: buildAnalysis() runs directly against this repository", () => {
  const legacyModule = require(path.join(REPOSITORY_ROOT, "scripts", "repository-intelligence.js")) as LegacyRepositoryIntelligenceModule;
  const analysis = legacyModule.buildAnalysis();

  assert.equal(typeof analysis.projectName, "string");
  assert.ok(analysis.projectName.length > 0);
  assert.ok(analysis.fileCount > 0, "expected this repository to contain at least one file");
  assert.ok(Array.isArray(analysis.languages));
  assert.ok(isRecentIsoTimestamp(analysis.timestamp));
});

test("(B) runtime engine: the wrapped adapter produces an artifact equal to (A), modulo the documented timestamp difference", async (t) => {
  const legacyModule = require(path.join(REPOSITORY_ROOT, "scripts", "repository-intelligence.js")) as LegacyRepositoryIntelligenceModule;
  const directAnalysis = legacyModule.buildAnalysis();

  const artifactBaseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-repository-analyzer-regression-"));
  t.after(async () => {
    await fsp.rm(artifactBaseDir, { recursive: true, force: true });
  });

  const context = createRuntimeContext({
    repositoryRoot: REPOSITORY_ROOT,
    logger: new BufferedLogger(),
    eventBus: new InMemoryEventBus(),
    artifactStore: new FileSystemArtifactStore(artifactBaseDir),
    providerRegistry: new InMemoryProviderRegistry(),
  });
  const engineRunner = new EngineRunner(context);
  const runId = "RUN-REGRESSION-TEST";

  // EngineRunner.run() now returns Artifact<LegacyRepositoryAnalysis> (see ../../runtime/src/artifacts/artifact.ts)
  // -- the engine's own raw output moved to `.payload`. Everything this test previously asserted about the
  // raw analysis shape is unchanged; it now reads through `.payload` to get there.
  const wrappedArtifact = await engineRunner.run(runId, createLegacyRepositoryAnalyzerAdapter());
  const wrappedAnalysis = wrappedArtifact.payload;

  // Artifact metadata: exists and is well-formed. Not present before this change -- new coverage, not a
  // relaxation of any prior assertion.
  assert.equal(typeof wrappedArtifact.id, "string");
  assert.ok(wrappedArtifact.id.length > 0);
  assert.equal(wrappedArtifact.type, "repository-analysis");
  assert.equal(wrappedArtifact.version, 1);
  assert.ok(isRecentIsoTimestamp(wrappedArtifact.createdAt));

  // The EngineRunner must have actually persisted the artifact -- read it back independently rather than
  // trusting the in-memory return value alone, so this test also proves ArtifactStore.write()/read() (Phase
  // 2) and the adapter's stage/artifactName addressing (Phase 3) are wired together correctly. Persistence is
  // untouched by the Artifact<T> wrapper: the file on disk is still the RAW analysis, never the wrapper.
  const persisted = await context.artifactStore.read<LegacyRepositoryAnalysis>({
    runId,
    stage: "repository-intelligence",
    name: "repository-analysis",
  });
  assert.equal((persisted as unknown as Record<string, unknown>).payload, undefined, "the persisted artifact must be the raw analysis, not the Artifact<T> wrapper");

  assert.deepEqual(
    withoutTimeVaryingFields(wrappedAnalysis),
    withoutTimeVaryingFields(directAnalysis),
    "wrapped buildAnalysis() output must be structurally identical to a direct call, aside from the documented timestamp difference"
  );
  assert.deepEqual(
    withoutTimeVaryingFields(persisted),
    withoutTimeVaryingFields(directAnalysis),
    "the PERSISTED artifact (read back from disk) must also match -- proves the ArtifactStore round-trip introduces no distortion"
  );

  // The documented intentional difference: both sides still produce a valid, fresh timestamp -- just not an
  // equal one, since buildAnalysis() computes it fresh on every call (a pre-existing legacy behavior, not
  // something introduced by wrapping).
  assert.ok(isRecentIsoTimestamp(wrappedAnalysis.timestamp));
  assert.ok(isRecentIsoTimestamp(directAnalysis.timestamp));

  const artifactRefs = await context.artifactStore.list(runId);
  assert.equal(artifactRefs.length, 1);
  assert.deepEqual(artifactRefs[0], { runId, stage: "repository-intelligence", name: "repository-analysis" });
});

test("EngineDescriptor.buildEvent() summary is a faithful reshape of the full analysis, never a recomputation", async () => {
  const legacyModule = require(path.join(REPOSITORY_ROOT, "scripts", "repository-intelligence.js")) as LegacyRepositoryIntelligenceModule;
  const directAnalysis = legacyModule.buildAnalysis();

  const descriptor = createLegacyRepositoryAnalyzerAdapter();
  const ref = { runId: "RUN-EVENT-TEST", stage: descriptor.stage, name: descriptor.artifactName };
  const event = descriptor.buildEvent("RUN-EVENT-TEST", directAnalysis, ref);

  assert.equal(event.type, "RepositoryAnalyzed");
  assert.equal(descriptor.stage, "repository-intelligence");
  assert.equal(descriptor.artifactName, "repository-analysis");
  if (event.type === "RepositoryAnalyzed") {
    assert.equal(event.summary.projectName, directAnalysis.projectName);
    assert.equal(event.summary.fileCount, directAnalysis.fileCount);
    assert.deepEqual(
      event.summary.languages,
      directAnalysis.languages.map((entry) => entry.language)
    );
  }
});
