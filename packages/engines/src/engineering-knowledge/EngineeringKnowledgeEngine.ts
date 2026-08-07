/**
 * EngineeringKnowledgeEngine — wraps buildEngineeringKnowledge() (./analysis/build-knowledge.ts) as an
 * EngineDescriptor for the Understand phase (Capability Sprint 1, Phase 2).
 *
 * CONCRETE LIMITATION -- READ BEFORE WIRING THIS INTO A REAL RUNTIME
 *   EngineDescriptor.run(context: RuntimeContext) (@oram/runtime's EngineRunner.ts) receives no `runId` --
 *   only EngineRunner.run(runId, engine) and engine.buildEvent(runId, ...) see it; engine.run() does not.
 *   That means an engine has no way to call context.artifactStore.read({runId, stage, name}) to consume a
 *   PRIOR stage's actual persisted artifact for THIS run -- the EngineDescriptor contract, as it exists
 *   today, cannot express "read a sibling stage's artifact for this run." This is a real, structural gap in
 *   @oram/runtime, not something specific to this engine.
 *
 *   Per the current roadmap ("do not introduce new runtime abstractions unless a concrete limitation appears
 *   first -- explain it before implementing"), I am flagging this rather than changing EngineRunner/
 *   EngineDescriptor unilaterally. A proper fix would be small and targeted (e.g. passing `runId` into
 *   run(), or a narrow "read a named upstream artifact for this run" helper on RuntimeContext) -- but it is a
 *   Runtime change, and Runtime is explicitly frozen/stable, so it is out of scope for this PR.
 *
 *   Until that exists, this engine's DEFAULT behavior is to independently recompute a RepositoryAnalysis via
 *   buildRepositoryAnalysis(context.repositoryRoot) -- the exact same deterministic computation Observe would
 *   have produced for the same repositoryRoot, so the result is correct, just recomputed rather than reused
 *   (extra CPU work, no behavior difference, no double-write -- this engine never calls
 *   scripts/repository-intelligence.js or persists anything on its own). A caller who already holds the real
 *   upstream RepositoryAnalysis (e.g. a future orchestrator that reads it from the ArtifactStore itself, once
 *   the limitation above is fixed) can bypass the recomputation entirely via the optional
 *   `loadRepositoryAnalysis` parameter below.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import type { RepositoryAnalysis } from "../repository-analyzer/analysis/types";
import { buildEngineeringKnowledge } from "./analysis/build-knowledge";
import type { EngineeringKnowledge } from "./analysis/types";

export function createEngineeringKnowledgeEngine(
  loadRepositoryAnalysis: (context: RuntimeContext) => RepositoryAnalysis = (context) => buildRepositoryAnalysis(context.repositoryRoot)
): EngineDescriptor<EngineeringKnowledge> {
  return {
    stage: "engineering-knowledge",
    artifactName: "engineering-knowledge",
    run(context: RuntimeContext): EngineeringKnowledge {
      const analysis = loadRepositoryAnalysis(context);
      return buildEngineeringKnowledge(analysis);
    },
    buildEvent(runId: string, output: EngineeringKnowledge, _ref: ArtifactRef): OramEvent {
      return {
        type: "KnowledgeBuilt",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          moduleCount: output.subsystems.length,
          detectedModuleNames: output.subsystems.map((subsystem) => subsystem.name),
        },
      };
    },
  };
}
