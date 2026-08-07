import type { Workflow } from "./workflow";

/**
 * ENGINEERING_WORKFLOW — the one Workflow that exists today. Its `steps` list is a literal, declarative
 * transcription of the exact sequence `Runtime.ts`'s `start()` previously hardcoded (Observe → Understand →
 * Reason → Plan) — this refactor changes WHERE that sequence lives (data, here) and HOW Runtime consumes it
 * (a loop), not WHAT the sequence is. See `packages/runtime/src/Runtime.ts`'s own module-level comment for
 * how this value is interpreted (per-step Lifecycle phase mapping, per-step EngineDescriptor resolution).
 */
export const ENGINEERING_WORKFLOW: Workflow = {
  id: "engineering",
  name: "Engineering Analysis",
  steps: ["observe", "understand", "reason", "plan"],
};
