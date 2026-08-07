/**
 * Lifecycle — the explicit state machine for one Engineering Cycle.
 *
 * Directly formalizes docs/ORAM_SPECIFICATION_v1.md Section 5.1 and ORAM_V3_MIGRATION_PLAN.md Section 5.1.
 * Today's System A pipeline (scripts/autonomous-orchestrator.js) already runs through this exact sequence
 * of phases, but only as an implicit consequence of one function's (runOrchestration()) local control flow
 * -- there is no queryable "what phase is this run in right now" outside of reading partially-written
 * files. This module makes that state first-class and inspectable; it is what `oram inspect` is built on.
 *
 * PHASES (docs/ORAM_SPECIFICATION_v1.md Section 4, "Engineering Lifecycle")
 *   CREATED -> ANALYZING -> PLANNING -> AWAITING_APPROVAL -> EXECUTING -> VALIDATING -> REFLECTING
 *     -> PUBLISHING -> COMPLETE
 *   Any non-terminal phase may transition to ABORTED instead of its normal successor.
 *
 * ENGINE MAPPING
 *   ANALYZING          -> Observe + Understand + Reason (Repository Intelligence, Engineering Knowledge,
 *                         Historical Context, Recommendation Engine)
 *   PLANNING           -> Decide + Plan (Adaptive Decision Engine, Execution Planner, Work Order creation)
 *   AWAITING_APPROVAL  -> human/CLI gate (successor to today's EXECUTION_APPROVED environment variable)
 *   EXECUTING          -> the configured Provider's implement()
 *   VALIDATING         -> Quality Gates (Validation Engine)
 *   REFLECTING         -> Reflection Engine
 *   PUBLISHING         -> Pull Request Generator + Publisher
 *
 * PHASE 2 STATUS: canTransition()/transition() are both implemented (see RunLifecycle below), including the
 *   REFLECTING -> EXECUTING retry edge (resolved per docs/ORAM_SPECIFICATION_v1.md Section 4's note that a
 *   retry re-enters at Execute with a refined objective, never re-plans from scratch -- LIFECYCLE_TRANSITIONS
 *   models this as a direct edge, not a nested sub-cycle).
 *
 * TODO(runtime): define the exact transition-guard signature (what data a phase requires before entering,
 *   e.g. EXECUTING requires an approved Mission) -- today, transition() only checks the phase graph, never
 *   the data a phase needs.
 * TODO(runtime): decide how Lifecycle persists across process restarts (a long `oram run` interrupted mid-
 *   way should be resumable via `oram inspect`, not silently lost) -- today, RunLifecycle only lives in
 *   process memory (see OramRuntime's own `lifecycles` map in Runtime.ts).
 */

export const LIFECYCLE_PHASES = [
  "CREATED",
  "ANALYZING",
  "PLANNING",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "VALIDATING",
  "REFLECTING",
  "PUBLISHING",
  "COMPLETE",
  "ABORTED",
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

const TERMINAL_PHASES: ReadonlySet<LifecyclePhase> = new Set(["COMPLETE", "ABORTED"]);

/** The fixed, valid forward transitions. ABORTED is reachable from any non-terminal phase (see canTransition) and is intentionally omitted from this table to keep it representing only the "happy path". */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecyclePhase, ReadonlyArray<LifecyclePhase>>> = {
  CREATED: ["ANALYZING"],
  ANALYZING: ["PLANNING"],
  PLANNING: ["AWAITING_APPROVAL"],
  AWAITING_APPROVAL: ["EXECUTING"],
  EXECUTING: ["VALIDATING"],
  VALIDATING: ["REFLECTING"],
  REFLECTING: ["PUBLISHING", "EXECUTING"], // PUBLISHING on approval; back to EXECUTING on a recommended retry
  PUBLISHING: ["COMPLETE"],
  COMPLETE: [],
  ABORTED: [],
};

export interface LifecyclePhaseRecord {
  readonly phase: LifecyclePhase;
  readonly enteredAt: string; // ISO-8601
}

export interface LifecycleState {
  readonly runId: string;
  readonly phase: LifecyclePhase;
  readonly enteredAt: string;
  readonly history: ReadonlyArray<LifecyclePhaseRecord>;
}

/**
 * The contract a Lifecycle controller must satisfy. Deliberately synchronous/pure for the transition check
 * itself -- side effects (emitting events, persisting state) are the Runtime's job, not this module's (see
 * docs/ORAM_SPECIFICATION_v1.md Section 5's explicit non-responsibilities).
 */
export interface Lifecycle {
  readonly state: LifecycleState;

  /** True if `to` is a legal transition from the current phase. */
  canTransition(to: LifecyclePhase): boolean;

  /** Performs the transition. Throws if !canTransition(to). Returns the new state. */
  transition(to: LifecyclePhase): LifecycleState;
}

/**
 * Reference implementation (Phase 2). canTransition() is pure state-machine graph logic (not engineering
 * business logic -- see the module comment); transition() is now implemented on top of it: it performs the
 * move, appends to history, and rejects (throws) any transition canTransition() would refuse -- there is no
 * way to force an illegal phase change through this class.
 */
export class RunLifecycle implements Lifecycle {
  private currentState: LifecycleState;

  constructor(initialState: LifecycleState) {
    this.currentState = initialState;
  }

  get state(): LifecycleState {
    return this.currentState;
  }

  canTransition(to: LifecyclePhase): boolean {
    if (TERMINAL_PHASES.has(this.currentState.phase)) return false;
    if (to === "ABORTED") return true;
    return LIFECYCLE_TRANSITIONS[this.currentState.phase].includes(to);
  }

  transition(to: LifecyclePhase): LifecycleState {
    if (!this.canTransition(to)) {
      throw new Error(
        `Invalid lifecycle transition for run "${this.currentState.runId}": "${this.currentState.phase}" -> "${to}" is not allowed. ` +
          `Valid transitions from "${this.currentState.phase}": ${[...LIFECYCLE_TRANSITIONS[this.currentState.phase], "ABORTED"].join(", ") || "none (terminal phase)"}.`
      );
    }
    const enteredAt = new Date().toISOString();
    const record: LifecyclePhaseRecord = { phase: to, enteredAt };
    this.currentState = {
      ...this.currentState,
      phase: to,
      enteredAt,
      history: [...this.currentState.history, record],
    };
    return this.currentState;
  }

  /** Constructs a fresh Lifecycle for a new run, already in CREATED with a one-entry history. The only place a LifecycleState is built from scratch, so run-id/timestamp bookkeeping lives in one location. */
  static create(runId: string): RunLifecycle {
    const enteredAt = new Date().toISOString();
    return new RunLifecycle({ runId, phase: "CREATED", enteredAt, history: [{ phase: "CREATED", enteredAt }] });
  }
}
