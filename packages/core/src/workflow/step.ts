/**
 * StepId — the identifier for one unit of work within a Workflow.
 *
 * This union is deliberately closed and small today: exactly the four steps
 * `packages/runtime/src/Runtime.ts` already executes (previously as a hardcoded call sequence, now as a
 * loop over a Workflow's `steps`). See ADR 0004 (`docs/adr/0004-pipeline-vs-direct-execution.md`) for the
 * broader design discussion this module is the first, deliberately-minimal slice of — this file does not
 * introduce a registry, plugin support, or dynamic step discovery; those are explicitly out of scope for
 * this change (see this PR's own deliverables notes).
 */
export type StepId = "observe" | "understand" | "reason" | "plan";

/**
 * PipelineStepId — the identifier for one stage of the FULL real engineering pipeline (Capability Sprint
 * 18). A separate union from StepId on purpose: StepId names the four coarse Phase-2 workflow steps (still
 * used, unchanged, by Runtime.start()'s placeholder workflow and its frozen tests); PipelineStepId names the
 * thirteen real engine stages, using each engine's own existing `EngineDescriptor.stage` string verbatim --
 * no new vocabulary, a PipelineStepId IS the stage it addresses. Extending StepId instead would have forced
 * every existing exhaustive Record<StepId, ...> in Runtime.ts to grow placeholder entries for stages that
 * have no placeholder, which is exactly the kind of fabrication this codebase avoids.
 */
export type PipelineStepId =
  | "repository-intelligence"
  | "engineering-knowledge"
  | "engineering-reasoning"
  | "engineering-planning"
  | "engineering-missions"
  | "implementation-requests"
  | "execution-planning"
  | "provider-execution"
  | "validation"
  | "recommendation"
  | "reflection"
  | "adaptive-decision"
  | "pull-request";
