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
