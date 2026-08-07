/**
 * LegacyRepositoryAnalyzerAdapter — wraps scripts/repository-intelligence.js behind the EngineDescriptor
 * contract (@oram/runtime), WITHOUT rewriting a single line of that script.
 *
 * RESPONSIBILITIES (Phase 3 Task 2)
 *   1. Invoke the legacy implementation -- require()s the real, unmodified scripts/repository-intelligence.js
 *      and calls its own exported buildAnalysis() (a pure function: no fs writes, only fs *reads* while it
 *      walks the repository). writeOutputs() (the function that actually writes repository-analysis.json/.md
 *      into the target repo's working tree) is never called -- this adapter's whole point is that ORAM's own
 *      ArtifactStore becomes the sole place this data is persisted (docs/ORAM_SPECIFICATION_v1.md Section 8),
 *      so no double-write, and no more of the 14 gitignore entries the legacy pipeline needed.
 *   2. Translate legacy output into the new artifact model -- the FULL legacy analysis object is written
 *      verbatim as the Artifact's JSON payload (this is what "behavior must remain identical" requires: the
 *      artifact's *content* is byte-for-byte the same data legacy would have produced); only the Timeline
 *      Event gets a deliberately-summarized view (toEventSummary()), matching the pattern every Phase 2
 *      placeholder engine already established.
 *   3. Expose the EngineDescriptor interface -- createLegacyRepositoryAnalyzerAdapter() below is a drop-in
 *      replacement for Runtime.ts's own observePlaceholder(), same `stage`/`artifactName` values, so no
 *      downstream artifact address changes.
 *
 * KNOWN LIMITATION -- READ BEFORE REUSING THIS PATTERN
 *   scripts/repository-intelligence.js computes its own `root` constant at module load time via
 *   `path.resolve(__dirname, "..")` (see that file's line 21) -- a hidden global, exactly the pattern
 *   RuntimeContext.ts's own doc comment identifies as what makes legacy engines assume they live inside the
 *   repository they analyze. This adapter does NOT fix that (fixing it would be a rewrite, forbidden by
 *   Phase 3's own instructions: "Do NOT rewrite it. ... No business logic changes."). Instead,
 *   loadLegacyModule() below requires the script from `<context.repositoryRoot>/scripts/repository-
 *   intelligence.js` -- i.e. it only works correctly TODAY, while ORAM's own scripts/ directory is still
 *   colocated with the repository it analyzes (see ORAM_V3_MIGRATION_PLAN.md Milestone 5, "Repository-
 *   independent ORAM" -- explicitly not yet done). Once ORAM and its target repository are ever different
 *   directories, this specific adapter stops being meaningful and must be replaced by a real, rewritten
 *   @oram/engines implementation with no scripts/*.js dependency at all -- NOT patched to accept a different
 *   root, since "behavior must remain identical" only has meaning while wrapping the actual legacy file.
 *
 * TODO(engines): require() caches modules by resolved path -- if this adapter is ever asked to analyze two
 *   different repositories with two different scripts/repository-intelligence.js copies within one process
 *   lifetime, only the FIRST one's module-scope `root` truly reflects reality for that process (mirrors the
 *   legacy script's own existing single-process-lifetime assumption; not a new limitation this adapter
 *   introduces).
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import type { LegacyRepositoryAnalysis, LegacyRepositoryIntelligenceModule } from "./types";

const require = createRequire(import.meta.url);

const LEGACY_SCRIPT_RELATIVE_PATH = path.join("scripts", "repository-intelligence.js");

/**
 * Resolves and requires the real, unmodified legacy script from inside the repository being analyzed. See
 * this file's KNOWN LIMITATION note above for exactly what "repository being analyzed" means today.
 */
function loadLegacyModule(repositoryRoot: string): LegacyRepositoryIntelligenceModule {
  const legacyPath = path.join(repositoryRoot, LEGACY_SCRIPT_RELATIVE_PATH);
  return require(legacyPath) as LegacyRepositoryIntelligenceModule;
}

/**
 * Derives the RepositoryAnalyzed Timeline event's summary from the full legacy analysis -- a reshape, not a
 * recomputation: every field here is copied directly off `analysis`, never re-derived by new logic (the
 * same "no business logic changes" discipline the whole adapter follows).
 */
function toEventSummary(analysis: LegacyRepositoryAnalysis): { projectName: string; fileCount: number; languages: string[] } {
  return {
    projectName: analysis.projectName,
    fileCount: analysis.fileCount,
    languages: analysis.languages.map((entry) => entry.language),
  };
}

/**
 * Builds the EngineDescriptor that replaces Runtime.ts's observePlaceholder() for a caller that wires it in
 * (see Runtime.ts's PhaseEngineOverrides / RuntimeBuilder.withObserveEngine() -- this package is never
 * imported by @oram/runtime itself; the wiring happens one layer up, per docs/ORAM_SPECIFICATION_v1.md
 * Section 3's System Layers dependency direction).
 */
export function createLegacyRepositoryAnalyzerAdapter(): EngineDescriptor<LegacyRepositoryAnalysis> {
  return {
    stage: "repository-intelligence",
    artifactName: "repository-analysis",
    run(context: RuntimeContext): LegacyRepositoryAnalysis {
      const legacyModule = loadLegacyModule(context.repositoryRoot);
      return legacyModule.buildAnalysis();
    },
    buildEvent(runId: string, output: LegacyRepositoryAnalysis, _ref: ArtifactRef): OramEvent {
      return {
        type: "RepositoryAnalyzed",
        runId,
        timestamp: new Date().toISOString(),
        summary: toEventSummary(output),
      };
    },
  };
}
