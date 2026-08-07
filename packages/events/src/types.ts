/**
 * @oram/events — the ORAM Timeline's typed event vocabulary.
 *
 * See docs/ORAM_SPECIFICATION_v1.md Section 7 ("Event Model") for the authoritative description of each
 * event and Section 2 ("Terminology") for Timeline/Artifact/Mission/Opportunity definitions.
 *
 * DESIGN NOTES
 * - Every event generalizes the exact moment an existing scripts/*.js engine writes its real artifact today
 *   (see the `@generalizes` note on each interface below) -- nothing here is speculative; every event has a
 *   proven, already-shipped trigger point.
 * - Events reference artifacts by address (see ArtifactRef in @oram/runtime's ArtifactStore.ts) rather than
 *   embedding full payloads, so a large artifact is never duplicated across the Timeline and the
 *   ArtifactStore.
 * - This module has NO runtime behavior -- it only defines shapes. Publishing/subscribing is
 *   @oram/runtime's EventBus's job (see packages/runtime/src/EventBus.ts).
 *
 * TODO(events): once @oram/artifacts exists, replace the loosely-typed `summary` fields below with
 *   references to that package's schema-versioned artifact types.
 * TODO(events): consider whether Events need their own schema version field (mirroring Artifacts, per
 *   docs/ORAM_SPECIFICATION_v1.md Section 8) once the first breaking payload change is needed.
 */

/** Every event's common envelope. No event type below repeats these fields. */
export interface OramEventBase {
  /** The Engineering Cycle (run) this event belongs to. */
  readonly runId: string;
  /** ISO-8601 timestamp of when the event was published. */
  readonly timestamp: string;
}

/**
 * Observe completes.
 * @generalizes repository-analysis.json being written by scripts/repository-intelligence.js
 */
export interface RepositoryAnalyzedEvent extends OramEventBase {
  readonly type: "RepositoryAnalyzed";
  readonly summary: {
    readonly projectName: string;
    readonly fileCount: number;
    readonly languages: ReadonlyArray<string>;
  };
}

/**
 * Understand completes.
 * @generalizes engineering-knowledge.json being written by scripts/engineering-knowledge.js
 */
export interface KnowledgeBuiltEvent extends OramEventBase {
  readonly type: "KnowledgeBuilt";
  readonly summary: {
    readonly moduleCount: number;
    readonly detectedModuleNames: ReadonlyArray<string>;
  };
}

/**
 * Reason completes -- a set of Opportunities now exists, none yet selected.
 * @generalizes recommendations.json being written by scripts/recommendation-engine.js
 */
export interface RecommendationsGeneratedEvent extends OramEventBase {
  readonly type: "RecommendationsGenerated";
  readonly summary: {
    readonly opportunityCount: number;
    readonly topOpportunityId: number | null;
  };
}

/**
 * Decide + Plan complete -- one Opportunity has been selected and turned into a Mission with exactly one
 * Work Order (docs/ORAM_SPECIFICATION_v1.md Section 2 -- v1 Missions always carry exactly one Work Order).
 * @generalizes adaptive-decision.json + execution-plan.json + implementation-request.json being written by
 *   scripts/adaptive-decision-engine.js, scripts/execution-planner.js, and
 *   scripts/implementation-request-engine.js respectively
 */
export interface MissionCreatedEvent extends OramEventBase {
  readonly type: "MissionCreated";
  readonly missionId: string;
  readonly summary: {
    readonly selectedOpportunityId: number | null;
    readonly title: string | null;
    readonly hasSelection: boolean;
  };
}

/**
 * The Runtime hands the Mission's Work Order to the resolved Provider.
 * @generalizes the moment invokeProvider() is called inside scripts/implementation-executor.js
 */
export interface ExecutionStartedEvent extends OramEventBase {
  readonly type: "ExecutionStarted";
  readonly missionId: string;
  readonly providerId: string;
}

/**
 * The Provider's result has been normalized into the fixed, provider-agnostic result shape.
 * @generalizes execution.json being written by scripts/implementation-executor.js
 */
export interface ExecutionFinishedEvent extends OramEventBase {
  readonly type: "ExecutionFinished";
  readonly missionId: string;
  readonly providerId: string;
  readonly status: "success" | "failure" | "cancelled" | "blocked" | "skipped";
}

/**
 * Every Quality Gate for this Mission has evaluated.
 * @generalizes validation.json being written by scripts/validation-engine.js
 */
export interface ValidationCompletedEvent extends OramEventBase {
  readonly type: "ValidationCompleted";
  readonly missionId: string;
  readonly approved: boolean;
  readonly score: number;
}

/**
 * The retry/stop decision for this Mission has been made.
 * @generalizes reflection-report.json being written by scripts/reflection-engine.js
 */
export interface ReflectionCompletedEvent extends OramEventBase {
  readonly type: "ReflectionCompleted";
  readonly missionId: string;
  readonly retryRecommended: boolean;
}

/**
 * The Publisher has produced (or, in dry run, simulated) a pull request for this Mission.
 * @generalizes pull-request.json + publish.json being written by scripts/pull-request-generator.js and
 *   scripts/github-publisher.js respectively
 */
export interface PRCreatedEvent extends OramEventBase {
  readonly type: "PRCreated";
  readonly missionId: string;
  readonly url: string | null;
  readonly dryRun: boolean;
}

/** The discriminated union of every v1 ORAM event. New event types are additive-only once published. */
export type OramEvent =
  | RepositoryAnalyzedEvent
  | KnowledgeBuiltEvent
  | RecommendationsGeneratedEvent
  | MissionCreatedEvent
  | ExecutionStartedEvent
  | ExecutionFinishedEvent
  | ValidationCompletedEvent
  | ReflectionCompletedEvent
  | PRCreatedEvent;

/** The set of valid `type` discriminants -- useful for EventBus.on()'s generic constraint. */
export type OramEventType = OramEvent["type"];
