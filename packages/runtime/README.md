# @oram/runtime

The Core Runtime layer — see `docs/ORAM_SPECIFICATION_v1.md` Section 5 ("Runtime Responsibilities") for the
authoritative contract.

## Responsibility

Owns exactly five things, and nothing else:

1. **Lifecycle** — the explicit state machine for one Engineering Cycle (`CREATED → ... → COMPLETE`),
   generalizing the implicit control flow inside `scripts/autonomous-orchestrator.js`'s `runOrchestration()`
   into a queryable state.
2. **Engine and Provider dispatch** — invoking the right Intelligence-layer Engine for a deterministic
   phase, or the configured Execution-layer Provider for Execute, with the same failure-isolation guarantee
   `invokeProvider()` already provides today in `scripts/implementation-executor.js`.
3. **Event dispatch** — publishing every phase transition, artifact write, and gate evaluation onto the
   EventBus (see `@oram/events`).
4. **Artifact management** — persisting every Engine/Provider/Gate output as a versioned, run-scoped record,
   independent of the target repository's own working tree.
5. **Logging** — one structured, per-stage log stream, replacing ad hoc `console.log` calls.

## Explicit non-responsibilities

- No engineering rules (what makes a good recommendation, how risk is estimated) — that is
  `@oram/engines`'s job.
- No Provider-specific behavior (how to talk to Claude Code vs. Gemini) — that is `@oram/providers`'s job.
- No UI concerns — that is `packages/cli` and `apps/dashboard`'s job.

## Status

**Phase 2 (current):** `Lifecycle`, `EventBus`, `ArtifactStore`, and `Runtime.start()` are functionally
implemented — a real `RunLifecycle` state machine, a real in-memory `EventBus`, a real
`FileSystemArtifactStore` writing to `.oram/runs/<run-id>/artifacts/<stage>/<name>.json`, and `start()` now
drives ANALYZING → PLANNING → AWAITING_APPROVAL through four *placeholder* engines (see `Runtime.ts`'s
`PLACEHOLDER ENGINES` section — proven end to end, not yet real). `RuntimeBuilder.ts` is the package's
Composition Root, and `RuntimeContext.ts`/`EngineRunner.ts` are the injected-context and single-engine-
execution abstractions everything else is built on. `approve()`/`RunHandle.wait()` remain unimplemented —
both require a real EXECUTING phase (a Provider), which is Phase 3's job. `ProviderRegistry`/`Logger` were
already functional as of Phase 1 and are unchanged.

**Phase 1:** interfaces and TODOs only, no business logic.

See `ORAM_V3_MIGRATION_PLAN.md` Milestone 2 and Milestone 3.

## Relationship to the existing pipeline

This package does not yet call, wrap, or replace `scripts/autonomous-orchestrator.js`. That script remains
the only functional orchestrator — this package proves out the *shape* a future replacement will have,
using placeholder data, not real repository analysis. Real engine logic is only ever extracted in Phase 3.
