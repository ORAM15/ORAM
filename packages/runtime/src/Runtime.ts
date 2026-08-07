/**
 * Runtime — the top-level façade every other ORAM package depends on.
 *
 * The direct successor to scripts/autonomous-orchestrator.js's runOrchestration(), generalized per
 * docs/ORAM_SPECIFICATION_v1.md Section 5 and ORAM_V3_MIGRATION_PLAN.md Section 5: it no longer assumes it
 * IS the repository it analyzes (no path.resolve(__dirname, "..") anywhere in this package -- see
 * RuntimeOptions.repositoryPath below), it emits typed Events instead of only returning a value at the very
 * end, and it stores Artifacts in a run-scoped ArtifactStore instead of the target repo's own working tree.
 *
 * RESPONSIBILITIES (docs/ORAM_SPECIFICATION_v1.md Section 5 is the authoritative list)
 *   - own the Lifecycle for a run
 *   - resolve and invoke Engines (@oram/engines) for the deterministic phases
 *   - resolve and invoke exactly one Provider (via ProviderRegistry) for EXECUTING
 *   - publish every meaningful state change to the EventBus
 *   - persist every artifact an engine/provider produces via the ArtifactStore
 *   - route all diagnostic output through the Logger (never raw console.log from business code)
 *
 * NON-RESPONSIBILITIES
 *   - Runtime never contains engineering rules itself (no scoring formulas, no recommendation logic) --
 *     those remain in @oram/engines, carrying forward the spirit of today's scripts/*.js unchanged.
 *   - Runtime never talks to git/GitHub directly -- that stays inside the Publisher engine/provider.
 *
 * PHASE 2 STATUS: start() is implemented up through AWAITING_APPROVAL, driving four Phase-2-only placeholder
 *   "engines" (see the PLACEHOLDER ENGINES section below) through a real EngineRunner, against a real
 *   FileSystemArtifactStore and a real InMemoryEventBus -- proving the whole Runtime shape end to end
 *   without extracting any real scripts/*.js logic (that is Phase 3's job; see ORAM_V3_MIGRATION_PLAN.md).
 *   approve() and RunHandle.wait() remain intentionally unimplemented: both require EXECUTING to be a real
 *   phase (a Provider to invoke, a completion signal to wait on), which does not exist until Phase 3.
 *
 * PHASE 3 STATUS: OramRuntime's constructor now accepts an optional PhaseEngineOverrides (see below) so a
 *   caller can substitute a real EngineDescriptor for one or more of the four Observe/Understand/Reason/Plan
 *   placeholders -- e.g. @oram/engines' createLegacyRepositoryAnalyzerAdapter() for `observe`. This file
 *   deliberately does NOT import @oram/engines itself: docs/ORAM_SPECIFICATION_v1.md Section 3 (System
 *   Layers) only allows a layer to depend on the layer(s) below it, and Core Runtime (this package) sits
 *   BELOW Intelligence (@oram/engines) -- importing it here would invert that dependency and contradict this
 *   very file's own NON-RESPONSIBILITIES note above ("Runtime never contains engineering rules itself").
 *   PhaseEngineOverrides is Dependency Inversion applied literally: Runtime defines and depends only on the
 *   EngineDescriptor *shape* (already in this package, from Phase 2's EngineRunner.ts); concrete engines
 *   from @oram/engines merely satisfy that shape and are supplied by whichever caller composes them --
 *   RuntimeBuilder.withObserveEngine() is that seam (see RuntimeBuilder.ts, itself still @oram/engines-free).
 *   The Runtime/RuntimeOptions/RuntimeDependencies/RunHandle interfaces below are completely unchanged by
 *   this -- only the concrete OramRuntime class gained one new, optional, backward-compatible constructor
 *   parameter. See docs/adr/0002-engine-runner.md for the fuller rationale.
 *
 * PHASE 4 STATUS: start() no longer hardcodes its own Observe/Understand/Reason/Plan call sequence. It now
 *   loops over @oram/core's ENGINEERING_WORKFLOW.steps (a declarative StepId[] -- see
 *   docs/adr/0004-pipeline-vs-direct-execution.md for the review this followed, and this PR's own
 *   deliverables notes for exactly how much of that proposal this specific change implements: only the
 *   declarative-sequence part, deliberately -- no Stage/phase-grouping type, no registry, no plugin support,
 *   no dynamic workflow selection). @oram/core contains ONLY the StepId/Workflow *types* and one data
 *   constant -- zero engine implementations, zero imports of any other @oram/* package -- so this file
 *   depending on it does not violate the System Layers rule this file's own NON-RESPONSIBILITIES note above
 *   already commits to: @oram/core is pure declarative data, not a concrete engine implementation, and sits
 *   alongside @oram/events as something Core Runtime may safely depend on. PhaseEngineOverrides,
 *   observePlaceholder()/understandPlaceholder()/reasonPlaceholder()/planPlaceholder(), and their per-StepId
 *   Lifecycle-phase mapping (STEP_LIFECYCLE_PHASE, below) are UNCHANGED in substance from Phase 2/3 -- this
 *   refactor only changes how start() walks them (a loop over workflow data) instead of what they are or do.
 *   Behavior is intended to be, and was verified to be, identical: same Lifecycle transition sequence, same
 *   artifact stage/name addresses, same event types, same four steps in the same order.
 *
 * PHASE 4 (Run object) STATUS: start() now also constructs a run/Run.ts instance per run, alongside the
 *   existing per-run RunLifecycle, and calls run.start() before the workflow loop begins. Run does NOT
 *   replace or duplicate Lifecycle's phase graph -- it carries only what Lifecycle has no place for: its
 *   immutable execution input (`context`, a run/run-context.ts RunContext -- repositoryRoot + workflowId, and
 *   ONLY those two fields; not RuntimeContext, not merged with it, not a rename of it) and a coarse
 *   started/finished/status summary. Neither Run nor `runs` (the map below) is exposed on the public Runtime
 *   interface or this package's barrel -- this task asked only that "Runtime now owns a Run instance," not
 *   that any public API surface change, so it stays private exactly like `lifecycles` was before it was ever
 *   queryable via any getter other than the single most-recent one. abort() additionally calls run.fail();
 *   nothing yet calls run.finish(), because no Phase-4 run ever reaches a terminal success phase (EXECUTING
 *   does not exist until a later phase) -- wiring finish() in before that is true would fabricate behavior,
 *   not preserve it.
 *
 * PHASE 4 (Run.artifacts) STATUS: the workflow loop now captures each EngineRunner.run() call's return value
 * (Artifact<unknown> -- see ./artifacts/artifact.ts) instead of discarding it, and appends it to `run` via
 * Run.addArtifact(). Purely an in-memory collection for the run's own duration -- no persistence, no
 * serialization, nothing new exposed publicly (Run itself already wasn't). What EngineRunner.run() actually
 * does (compute, persist the raw payload, publish the event, wrap the return value) is completely unchanged
 * by this -- this is only about what start() now does with a value it already had in hand.
 *
 * TODO(runtime): define RuntimeOptions.config's real type once oram.config.schema.json is finalized and
 *   @oram/artifacts exists to type-check against it -- `unknown` below is a deliberate placeholder.
 * TODO(runtime): decide sync-vs-async engine invocation -- today's engines are synchronous fs calls;
 *   keeping Runtime's own public API async from day one avoids a breaking change if/when engines are
 *   parallelized or made to support remote repositories.
 * TODO(runtime): decide how `approve()` is actually delivered from a human -- a CLI prompt (packages/cli),
 *   a dashboard click (apps/dashboard), and a CI approval step (a future GitHub Action) all need to resolve
 *   to this same method.
 */

import type { EventBus } from "./EventBus";
import type { Lifecycle, LifecyclePhase } from "./Lifecycle";
import { RunLifecycle } from "./Lifecycle";
import type { ArtifactStore } from "./ArtifactStore";
import type { ProviderRegistry } from "./ProviderRegistry";
import type { Logger } from "./Logger";
import { createRuntimeContext } from "./RuntimeContext";
import { EngineRunner, type EngineDescriptor } from "./EngineRunner";
import { ENGINEERING_WORKFLOW, type StepId } from "@oram/core";
import { Run } from "./run/run";
import type { RunContext } from "./run/run-context";

export interface RuntimeDependencies {
  readonly eventBus: EventBus;
  readonly artifactStore: ArtifactStore;
  readonly providerRegistry: ProviderRegistry;
  readonly logger: Logger;
}

export interface RuntimeOptions {
  /** Absolute path to the repository ORAM is being run against. Never assumed to be ORAM's own install location -- this is the field that makes ORAM repository-independent (ORAM_V3_MIGRATION_PLAN.md Milestone 5). */
  readonly repositoryPath: string;
  /** Parsed oram.config.json for this repository. TODO(runtime): replace `unknown` with the generated OramConfig type once oram.config.schema.json (this phase's Task 5) has a corresponding TypeScript type. */
  readonly config?: unknown;
}

export interface RunHandle {
  readonly runId: string;
  /** Resolves once the run reaches COMPLETE or ABORTED. */
  wait(): Promise<void>;
}

/**
 * The Runtime's public contract. One instance is expected to be constructed per `oram` process invocation,
 * wired up by @oram/cli using whatever RuntimeDependencies are appropriate for that command (e.g.
 * `oram doctor` needs no ProviderRegistry at all; `oram run` needs every dependency).
 */
export interface Runtime {
  readonly lifecycle: Lifecycle;

  /** Starts a new Engineering Cycle against RuntimeOptions.repositoryPath, running Observe through Plan automatically and then pausing at AWAITING_APPROVAL. */
  start(options: RuntimeOptions): Promise<RunHandle>;

  /** Approves a run currently in AWAITING_APPROVAL, allowing it to proceed to EXECUTING. The sole path by which a human authorizes a Provider to actually change code -- see docs/ORAM_SPECIFICATION_v1.md Section 1.3, Core Philosophy. */
  approve(runId: string): Promise<void>;

  /** Aborts a run in any non-terminal phase, recording `reason` for later inspection via `oram inspect`. */
  abort(runId: string, reason: string): Promise<void>;
}

/** Direct precedent: buildRunId() in scripts/autonomous-orchestrator.js -- a timestamp-derived id needs no shared counter/lock, unlike run-history-manager.js's sequential RUN-NNNNNN scheme (which requires listing every prior run first; Phase 2's ArtifactStore interface has no "list all runs" operation to support that yet -- see ArtifactStore.ts's own open TODOs). */
function generateRunId(): string {
  return `RUN-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}`;
}

/**
 * Phase 3's injection seam (see the module-level PHASE 3 STATUS note above). Every field defaults to Phase
 * 2's own placeholder engine when omitted, so existing callers that construct `new OramRuntime(deps)` with
 * no second argument are completely unaffected -- this is an additive, backward-compatible constructor
 * parameter, not a change to any frozen public interface.
 */
export interface PhaseEngineOverrides {
  readonly observe?: EngineDescriptor<unknown>;
  readonly understand?: EngineDescriptor<unknown>;
  readonly reason?: EngineDescriptor<unknown>;
  readonly plan?: EngineDescriptor<unknown>;
}

// ---------------------------------------------------------------------------------------------------------
// PLACEHOLDER ENGINES (Phase 2 only)
//
// NOT real engines -- each simulates exactly one of Task 5's four steps (Observe/Understand/Reason/Plan)
// with a clearly-marked (`simulated: true`), structurally-plausible artifact, so start() can be proven end
// to end through a real EngineRunner/ArtifactStore/EventBus before Phase 3 extracts any real scripts/*.js
// logic. Every one of these four maps 1:1 onto one of @oram/events' first four event types -- exercising
// that frozen Phase 1 vocabulary end to end was a deliberate goal of this mapping, not a coincidence.
//
// Per Lifecycle.ts's own ENGINE MAPPING comment, Observe+Understand+Reason all occur within the single
// ANALYZING phase, and Plan (standing in for Decide+Plan combined, matching MissionCreatedEvent's own
// granularity) occurs within PLANNING -- this file does not invent new Lifecycle phases to fit four steps
// into two, since Phase 1's phase set is frozen.
//
// Each placeholder remains the DEFAULT for its phase (used whenever no PhaseEngineOverrides entry is
// supplied -- see start() below and the module-level PHASE 3 STATUS note). observePlaceholder() specifically
// is what @oram/engines' createLegacyRepositoryAnalyzerAdapter() now substitutes for, via injection, when a
// caller wires it in through RuntimeBuilder.withObserveEngine() -- this file does not delete
// observePlaceholder() itself, since it is still the correct behavior when no override is provided (e.g. a
// caller with no real Repository Analyzer configured yet).
// ---------------------------------------------------------------------------------------------------------

interface ObserveOutput {
  readonly simulated: true;
  readonly projectName: string;
  readonly fileCount: number;
  readonly languages: string[];
}

function observePlaceholder(): EngineDescriptor<ObserveOutput> {
  return {
    stage: "repository-intelligence",
    artifactName: "repository-analysis",
    run: () => ({ simulated: true, projectName: "unknown", fileCount: 0, languages: [] }),
    buildEvent: (runId, output) => ({
      type: "RepositoryAnalyzed",
      runId,
      timestamp: new Date().toISOString(),
      summary: { projectName: output.projectName, fileCount: output.fileCount, languages: output.languages },
    }),
  };
}

interface UnderstandOutput {
  readonly simulated: true;
  readonly moduleCount: number;
  readonly detectedModuleNames: string[];
}

function understandPlaceholder(): EngineDescriptor<UnderstandOutput> {
  return {
    stage: "engineering-knowledge",
    artifactName: "engineering-knowledge",
    run: () => ({ simulated: true, moduleCount: 0, detectedModuleNames: [] }),
    buildEvent: (runId, output) => ({
      type: "KnowledgeBuilt",
      runId,
      timestamp: new Date().toISOString(),
      summary: { moduleCount: output.moduleCount, detectedModuleNames: output.detectedModuleNames },
    }),
  };
}

interface ReasonOutput {
  readonly simulated: true;
  readonly opportunityCount: number;
  readonly topOpportunityId: number | null;
}

function reasonPlaceholder(): EngineDescriptor<ReasonOutput> {
  return {
    stage: "recommendation",
    artifactName: "recommendations",
    run: () => ({ simulated: true, opportunityCount: 0, topOpportunityId: null }),
    buildEvent: (runId, output) => ({
      type: "RecommendationsGenerated",
      runId,
      timestamp: new Date().toISOString(),
      summary: { opportunityCount: output.opportunityCount, topOpportunityId: output.topOpportunityId },
    }),
  };
}

interface PlanOutput {
  readonly simulated: true;
  readonly missionId: string;
  readonly hasSelection: boolean;
}

function planPlaceholder(): EngineDescriptor<PlanOutput> {
  return {
    stage: "work-order",
    artifactName: "mission",
    run: () => ({ simulated: true, missionId: `MISSION-${Date.now()}`, hasSelection: false }),
    buildEvent: (runId, output) => ({
      type: "MissionCreated",
      runId,
      timestamp: new Date().toISOString(),
      missionId: output.missionId,
      summary: { selectedOpportunityId: null, title: null, hasSelection: output.hasSelection },
    }),
  };
}

/**
 * Which Lifecycle phase each StepId belongs to (Phase 4). This is Runtime's own interpretation of
 * @oram/core's ENGINEERING_WORKFLOW -- the Workflow type itself deliberately carries no phase metadata (see
 * workflow.ts's own comment), so mapping "observe"/"understand"/"reason" to ANALYZING and "plan" to
 * PLANNING lives here, matching Lifecycle.ts's own pre-existing ENGINE MAPPING comment exactly (that mapping
 * was previously only true because start() happened to be coded that way; it is now this explicit,
 * inspectable table instead).
 */
const STEP_LIFECYCLE_PHASE: Readonly<Record<StepId, LifecyclePhase>> = {
  observe: "ANALYZING",
  understand: "ANALYZING",
  reason: "ANALYZING",
  plan: "PLANNING",
};

/**
 * Default EngineDescriptor factory per StepId (Phase 2's four placeholders, unchanged, now indexed instead
 * of called by name). Resolution order in start() is identical to Phase 3: an entry in `engineOverrides`
 * wins if present, otherwise the matching placeholder here runs -- see PhaseEngineOverrides above, whose
 * four optional field names are, not coincidentally, exactly StepId's four members.
 */
const PLACEHOLDER_ENGINES: Readonly<Record<StepId, () => EngineDescriptor<unknown>>> = {
  observe: observePlaceholder,
  understand: understandPlaceholder,
  reason: reasonPlaceholder,
  plan: planPlaceholder,
};

/**
 * Reference implementation (Phase 2). See the module-level PHASE 2 STATUS note above for exactly what is
 * and is not implemented. Every run's Lifecycle is retained in-memory (see the `lifecycles` map) so
 * abort()/the `lifecycle` getter can address any run this instance has started, even though the public
 * `lifecycle` getter itself (frozen Phase 1 shape) only ever exposes the most recently started one --
 * matching docs/ORAM_SPECIFICATION_v1.md Section 11's "one active Engineering Cycle per Runtime process"
 * non-goal without over-committing the public interface to that constraint forever.
 */
export class OramRuntime implements Runtime {
  private readonly lifecycles = new Map<string, RunLifecycle>();
  private readonly runs = new Map<string, Run>();
  private mostRecentRunId: string | null = null;

  constructor(
    private readonly deps: RuntimeDependencies,
    private readonly engineOverrides: PhaseEngineOverrides = {}
  ) {}

  get lifecycle(): Lifecycle {
    if (!this.mostRecentRunId) {
      throw new Error("No Engineering Cycle has been started yet -- call start() first.");
    }
    // Non-null: every id ever assigned to mostRecentRunId was inserted into `lifecycles` in the same breath (see start()).
    return this.lifecycles.get(this.mostRecentRunId) as RunLifecycle;
  }

  async start(options: RuntimeOptions): Promise<RunHandle> {
    const runId = generateRunId();
    const runLifecycle = RunLifecycle.create(runId);
    this.lifecycles.set(runId, runLifecycle);
    this.mostRecentRunId = runId;

    const runContext: RunContext = { repositoryRoot: options.repositoryPath, workflowId: ENGINEERING_WORKFLOW.id };
    const run = new Run(runId, runContext);
    run.start();
    this.runs.set(runId, run);

    const context = createRuntimeContext({
      repositoryRoot: options.repositoryPath,
      config: options.config,
      logger: this.deps.logger,
      eventBus: this.deps.eventBus,
      artifactStore: this.deps.artifactStore,
      providerRegistry: this.deps.providerRegistry,
    });
    const engineRunner = new EngineRunner(context);

    this.deps.logger.info(null, `Starting Engineering Cycle "${runId}" for repository "${options.repositoryPath}".`);

    // Phase 4: a declarative loop over @oram/core's ENGINEERING_WORKFLOW.steps, replacing what was
    // previously six hardcoded lines (one per phase transition, one per engine call). Transition guarded by
    // `!==` because Lifecycle.canTransition() has no self-loop (ANALYZING -> ANALYZING is not a valid
    // transition -- see Lifecycle.ts's LIFECYCLE_TRANSITIONS table) -- this reproduces the exact same
    // transition history as before: one transition into ANALYZING (before "observe"), one into PLANNING
    // (before "plan"), never a redundant call for "understand"/"reason".
    for (const step of ENGINEERING_WORKFLOW.steps) {
      const targetPhase = STEP_LIFECYCLE_PHASE[step];
      if (runLifecycle.state.phase !== targetPhase) {
        runLifecycle.transition(targetPhase);
      }
      const descriptor = this.engineOverrides[step] ?? PLACEHOLDER_ENGINES[step]();
      const artifact = await engineRunner.run(runId, descriptor);
      run.addArtifact(artifact);
    }

    runLifecycle.transition("AWAITING_APPROVAL");
    this.deps.logger.info(
      null,
      `Engineering Cycle "${runId}" is paused at AWAITING_APPROVAL. No Provider is invoked in this phase -- see approve()'s own TODO.`
    );

    return {
      runId,
      wait: async () => {
        throw new Error(
          `RunHandle.wait() is not implemented yet for run "${runId}" -- Phase 2 never reaches COMPLETE/ABORTED automatically ` +
            `(Execute does not exist until Phase 3), so there is nothing yet for wait() to resolve on. Inspect ` +
            `runtime.lifecycle.state directly instead.`
        );
      },
    };
  }

  async approve(runId: string): Promise<void> {
    if (!this.lifecycles.has(runId)) throw new Error(`Cannot approve unknown run "${runId}".`);
    throw new Error(
      `OramRuntime.approve() is not implemented yet -- approving run "${runId}" would need to invoke a Provider ` +
        `(the EXECUTING phase), which is out of scope until Phase 3.`
    );
  }

  async abort(runId: string, reason: string): Promise<void> {
    const runLifecycle = this.lifecycles.get(runId);
    if (!runLifecycle) throw new Error(`Cannot abort unknown run "${runId}".`);
    runLifecycle.transition("ABORTED");
    // Invariant: every runId in `lifecycles` was inserted into `runs` in the same breath, in start() -- see
    // the constructor-adjacent comment on `lifecycle` above for the same pattern.
    this.runs.get(runId)?.fail();
    this.deps.logger.warn(null, `Engineering Cycle "${runId}" aborted: ${reason}`);
  }
}
