import type { Workflow } from "./workflow";
import type { PipelineStepId } from "./step";

/**
 * FULL_ENGINEERING_WORKFLOW — Capability Sprint 18 (Full Runtime Pipeline). The declarative, ordered list
 * of every REAL engine stage the Runtime executes end to end, in dependency order: each stage consumes the
 * artifact(s) earlier stages persisted for the same run (see @oram/runtime's RunArtifacts). Pure data,
 * exactly like ENGINEERING_WORKFLOW beside it: no engine references, no lifecycle-phase metadata, no
 * behavior -- `packages/runtime/src/Runtime.ts`'s runPipeline() is the sole interpreter (per-step Lifecycle
 * phase mapping, per-step EngineDescriptor resolution supplied by the caller).
 *
 * ENGINEERING_WORKFLOW (the four-step Phase 2 placeholder workflow) is unchanged and still what
 * Runtime.start() drives -- this is a second Workflow value, not a replacement, so every frozen Phase 2/4
 * behavior and test keeps meaning exactly what it always meant.
 *
 * Engineering Memory is deliberately absent: it is a cross-run historical record, not a stage of one run's
 * dataflow (and per MemoryStore's own disclosed limitation it has no cross-process persistence yet).
 *
 * `publisher` (Capability Sprint 20) is the fourteenth and final stage -- Lifecycle.ts's own ENGINE MAPPING
 * comment has always named PUBLISHING's two occupants as "Pull Request Generator + Publisher"; this is the
 * second of that pair, immediately after `pull-request`. Both stay inside the pipeline's post-approval
 * segment (see runtime/src/Runtime.ts's own gate-index derivation), so publishing a proposal always requires
 * the same explicit human approval Provider Execution itself requires.
 */
export const FULL_ENGINEERING_WORKFLOW: Workflow<PipelineStepId> = {
  id: "engineering-full",
  name: "Full Engineering Pipeline",
  steps: [
    "repository-intelligence",
    "engineering-knowledge",
    "engineering-reasoning",
    "engineering-planning",
    "engineering-missions",
    "implementation-requests",
    "execution-planning",
    "provider-execution",
    "validation",
    "recommendation",
    "reflection",
    "adaptive-decision",
    "pull-request",
    "publisher",
  ],
};
