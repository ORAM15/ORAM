/**
 * MemoryEngine -- records one already-computed pipeline run (a RunSnapshotInputs bundle) into a MemoryStore.
 * `record()` is the whole job: build a RunSnapshot (./analysis/build-run-snapshot.ts) and save() it. Mirrors
 * every other stage's adapter/provider-injection pattern (ImplementationExecutor takes adapters,
 * ProviderExecutionEngine takes a Provider) -- MemoryEngine takes a MemoryStore, defaulting to a fresh one.
 *
 * `createEngineeringMemoryEngine()` at the bottom of this file is the EngineDescriptor factory every prior
 * stage provides (normally from its own `<Stage>Engine.ts` file) -- co-located here for the same reason
 * Sprints 9-12 each gave: this Sprint's own spec names the core worker class itself "Memory Engine", leaving
 * no distinct, non-redundant name for a separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same gaps disclosed in every prior stage's own EngineDescriptor wrapper, plus
 * the one specific to this stage disclosed in MemoryStore.ts's own header comment (no cross-process
 * persistence):
 *
 *   1. EngineDescriptor.run(context) receives no `runId`, so this cannot read any prior stage's actual
 *      persisted artifact for THIS run. Default behavior recomputes the entire pipeline from scratch via
 *      buildRepositoryAnalysis() + ... + buildReflectionReport() -- same deterministic result under
 *      MemoryProvider/MemoryAdapter, extra CPU, no Runtime change. A caller holding the real upstream
 *      pipeline output can bypass this via the optional `loadInputs` parameter below.
 *
 *   2. @oram/events has no event type for "a run was recorded into history." Reusing ReflectionCompletedEvent
 *      here (as Reflection's own EngineDescriptor genuinely does one stage up) would make one real run emit
 *      that event type twice with different meanings -- worse than the honest-reuse pattern this codebase
 *      otherwise follows. RecommendationsGeneratedEvent is reused instead, the same way every stage since
 *      Sprint 5 that lacks a purpose-built event has reused it: `opportunityCount: 1` (one snapshot was
 *      recorded), `topOpportunityId: null` always (that field is typed `number | null`; every id in this
 *      pipeline is a string). A dedicated RunRecordedEvent is the correct long-term fix, left for a future PR.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
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
import { buildRunSnapshot } from "./analysis/build-run-snapshot";
import type { RunSnapshot, RunSnapshotInputs } from "./analysis/types";
import { MemoryStore } from "./MemoryStore";

export class MemoryEngine {
  constructor(private readonly store: MemoryStore = new MemoryStore()) {}

  /** The MemoryStore this engine records into -- exposed so a caller (e.g. the CLI) can render history/statistics after record() without needing to keep its own separate reference. */
  get memoryStore(): MemoryStore {
    return this.store;
  }

  /** Builds a RunSnapshot from already-computed pipeline output and saves it into this engine's MemoryStore. Returns the snapshot that was saved. */
  record(inputs: RunSnapshotInputs): RunSnapshot {
    const snapshot = buildRunSnapshot(inputs);
    this.store.save(snapshot);
    return snapshot;
  }
}

function defaultLoadInputs(context: RuntimeContext): RunSnapshotInputs {
  const analysis = buildRepositoryAnalysis(context.repositoryRoot);
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

  return {
    repositoryRoot: context.repositoryRoot,
    analysis,
    knowledge,
    reasoning,
    plan,
    graph,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
  };
}

export function createEngineeringMemoryEngine(
  loadInputs: (context: RuntimeContext) => RunSnapshotInputs = defaultLoadInputs,
  store: MemoryStore = new MemoryStore()
): EngineDescriptor<RunSnapshot> {
  const engine = new MemoryEngine(store);
  return {
    stage: "memory",
    artifactName: "run-snapshot",
    run(context: RuntimeContext): RunSnapshot {
      const inputs = loadInputs(context);
      return engine.record(inputs);
    },
    buildEvent(runId: string, _output: RunSnapshot, _ref: ArtifactRef): OramEvent {
      return {
        type: "RecommendationsGenerated",
        runId,
        timestamp: new Date().toISOString(),
        summary: {
          opportunityCount: 1,
          topOpportunityId: null,
        },
      };
    },
  };
}
