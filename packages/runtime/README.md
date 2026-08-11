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

**Capability Sprint 19 (current) — Real Runtime Safety Gate:** `AWAITING_APPROVAL` is now a genuine
boundary, not an auto-passed formality. `Runtime.runPipeline()` executes only the pre-approval half of the
pipeline (repository-intelligence through execution-planning), advances the Lifecycle to
`AWAITING_APPROVAL`, and **returns** — Provider Execution has not been invoked, and nothing further happens
until an explicit decision is made. `Runtime.approve(runId)` resumes that EXACT run (same `runId`, same
`RuntimeContext`/`EngineRunner`/`ArtifactStore`, same `PipelineEngines`) from `provider-execution` through
`pull-request`, reaching `COMPLETE` on success or `ABORTED` on a post-approval failure.
`Runtime.reject(runId, reason?)` transitions straight from `AWAITING_APPROVAL` to `ABORTED` and guarantees
Provider Execution never runs for that run. `Runtime.status(runId)` reads back the Lifecycle phase for any
run this instance has touched. Both `approve()`/`reject()` claim their pending run with a synchronous
`Map.get()` + `Map.delete()` (no `await` between them), so concurrent or duplicate calls for the same
`runId` can never execute Provider Execution more than once — the second caller always finds the run already
claimed and fails loudly instead. There is no timer, no simulated approval, and no fallback that silently
continues without an explicit call.

**Capability Sprint 18 — Full Runtime Pipeline:** `Runtime.runPipeline()` executes the complete,
REAL thirteen-stage engineering pipeline (`@oram/core`'s declarative `FULL_ENGINEERING_WORKFLOW`:
repository-intelligence → … → pull-request) through the same `EngineRunner` `start()` uses. Every stage's
output is persisted in the `ArtifactStore` under the run's `runId`, every downstream stage consumes the
current run's artifacts via `RunArtifacts` (the caller-supplied engines from `@oram/engines`'
`createFullPipelineEngines()` wire THROWING recompute fallbacks, so a completed run is itself proof of
handoff). The final stage produces a `PullRequestProposal` artifact — generated, never published; no GitHub
API exists anywhere in this package. `start()`'s four-step placeholder workflow is unchanged (its frozen
tests keep passing, including reaching its own `AWAITING_APPROVAL`, which is unrelated to the real pipeline
safety gate above), and `oram run <path>` is the CLI entry point for the real pipeline.

Provider Execution today is always the deterministic in-memory `MemoryProvider` — no git, no filesystem, no
shell, no LLM. The safety gate exists in anticipation of a real, code-changing Provider; it is enforced now,
before one exists, rather than bolted on afterward.

**Capability Sprint 17 — Runtime Artifact Handoff:** `EngineRunner.run()` now passes every engine
a second, optional argument: `RunArtifacts` (`src/RunArtifacts.ts`), a read-only, run-scoped view of the
current run's already-persisted artifacts (`has()` / `require()` / `missing()`), backed directly by the
existing `ArtifactStore` — not a second storage abstraction. This closes the long-disclosed "an engine
receives no runId, so it cannot read any prior stage's artifact for THIS run" limitation: a downstream
engine can now declare its upstream dependencies explicitly (see `@oram/engines`'
`DECISION_UPSTREAM_ARTIFACTS` / `PULL_REQUEST_UPSTREAM_ARTIFACTS`) and consume artifacts instead of
recomputing the pipeline. Same-run isolation comes for free from `ArtifactRef`'s own addressing (`runId` is
part of every key), and a missing required artifact fails with the store's own deterministic error naming
the runId/stage/name. The change is purely additive: `run(context)` engines ignore the new argument and
behave exactly as before. This is the distinction between ORAM's two execution styles:

- **Direct engine API** — `buildX()` pure functions composed by hand (what the CLI's per-stage commands do):
  ideal for isolated, deterministic testing; recomputes by design.
- **Runtime pipeline execution** — engines invoked through `EngineRunner` consume the current run's
  persisted artifacts; every arrow in the pipeline is an artifact handoff, not a recomputation.

**Phase 2:** `Lifecycle`, `EventBus`, `ArtifactStore`, and `Runtime.start()` are functionally
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

As of Capability Sprint 18, this package IS a functional orchestrator: `Runtime.runPipeline()` executes the
full real engineering pipeline (see the Status section above), and `oram run <path>` drives it. The
placeholder-engine `start()` path and its frozen Phase 2/4 behavior remain intact alongside it.
`scripts/autonomous-orchestrator.js` (System A) still exists as working reference material and prior art —
see `docs/history/origin.md` — but is no longer the only functional orchestrator.
