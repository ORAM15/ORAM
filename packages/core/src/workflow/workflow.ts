import type { StepId } from "./step";

/**
 * Workflow — a declarative, ordered list of steps. Pure data: no engine references, no lifecycle-phase
 * metadata, no behavior. `packages/runtime/src/Runtime.ts` is the sole interpreter of this data today
 * (it decides which Lifecycle phase each StepId belongs to and which EngineDescriptor implements it) —
 * this type intentionally carries none of that interpretation itself, so it stays reusable if a second
 * interpreter is ever needed.
 *
 * Only one Workflow value exists today (see engineering-workflow.ts's ENGINEERING_WORKFLOW) — there is no
 * registry and no mechanism to select among multiple Workflows. That is explicitly out of scope for this
 * change; see ADR 0004 for the fuller design this is a deliberately narrow first step toward.
 */
export interface Workflow<TStepId extends string = StepId> {
  readonly id: string;
  readonly name: string;
  readonly steps: ReadonlyArray<TStepId>;
}
