# ADR 0004: Should Runtime Execute Engineering Phases Directly, or Generic Pipelines Composed of Stages?

- **Status:** Proposed — architecture review only, no code changes accompany this document
- **Date:** Post–Phase 3 (Phase 3 frozen; no engine migrated, no runtime feature added as part of this review)

## Portability constraint for this review

This work is happening inside a temporary incubation repository; everything proposed below is written to be
liftable into a standalone `oram` repository with zero edits. Nothing in either the current or proposed
design references an MP6-specific path, and the proposal's central claim — that a Pipeline should be
**plain, serializable data**, not control flow — makes this *more* true of the proposed design than the
current one (see "Portability" under Consequences).

## Context

`OramRuntime.start()` today (`packages/runtime/src/Runtime.ts`) is six lines of hardcoded, imperative
sequencing:

```
runLifecycle.transition("ANALYZING");
await engineRunner.run(runId, this.engineOverrides.observe ?? observePlaceholder());
await engineRunner.run(runId, this.engineOverrides.understand ?? understandPlaceholder());
await engineRunner.run(runId, this.engineOverrides.reason ?? reasonPlaceholder());

runLifecycle.transition("PLANNING");
await engineRunner.run(runId, this.engineOverrides.plan ?? planPlaceholder());
```

`Lifecycle.ts`'s own ENGINE MAPPING comment already describes this exact grouping in prose ("ANALYZING ->
Observe + Understand + Reason", "PLANNING -> Decide + Plan") — but that description is only true because
`start()` happens to be coded that way. There is no data structure anywhere that *is* "the pipeline"; there
is only one method's control flow that behaves like one.

Three concrete pressures already exist against this, all found in code already written in this repository,
not hypothesized for this review:

1. **`PhaseEngineOverrides` (Phase 3) can only *replace* one of four fixed slots.** It cannot add a fifth
   engine to a phase, add a new phase, or omit one — see `docs/adr/0002-engine-runner.md`'s own documented
   negative consequence: "Execute, Validate, Reflect, and Publish have no equivalent override seam yet."
2. **`@oram/cli`'s `analyze.ts` already can't be wired up as designed.** Its own TODO reads: *"wire to
   @oram/runtime once phase-scoped (partial) Lifecycle execution is supported -- currently Runtime.start()
   is specified as running Observe through Plan as one unit... this command needs a narrower entry point
   than that."* `oram analyze` needs Observe+Understand+Reason without Plan; today's `start()` cannot express
   that without a second, hand-duplicated copy of its own body.
3. **`docs/ORAM_SPECIFICATION_v1.md` Section 10 already promises "Engine plugins"** that "contribute an
   additional deterministic phase contributor." There is currently no mechanism by which a plugin could add
   itself to a phase — only `PhaseEngineOverrides`' narrow replace-one-slot seam exists, and it was never
   designed for addition, only substitution.

## Current vs. Proposed

**Current:**
```
Runtime
  ↓
Observe → Understand → Reason → Plan      (hardcoded call sequence inside start())
```

**Proposed:**
```
Runtime
  ↓
Pipeline                                   (an ordered list of Stages — DATA)
  ↓
Stage                                      (one Lifecycle phase's worth of work — DATA)
  ↓
Engine                                     (an EngineDescriptor, run via the existing, unchanged EngineRunner)
```

Concretely: a `Pipeline` is an ordered list of `Stage` objects; each `Stage` names the `LifecyclePhase` it
runs within and carries an ordered list of `EngineDescriptor`s. Today's exact behavior becomes one specific
`Pipeline` value —

```
DEFAULT_ANALYSIS_PIPELINE = {
  stages: [
    { phase: "ANALYZING", engines: [observe, understand, reason] },
    { phase: "PLANNING",  engines: [plan] },
  ],
}
```

— rather than the only behavior `start()` is capable of. `Runtime.start()` would walk `pipeline.stages`,
transitioning `Lifecycle` and invoking `EngineRunner` exactly as it does today, just driven by data instead
of by hand-written sequence.

**Explicit non-goal, to keep this proposal's scope honest:** Pipeline/Stage is not a replacement for
`Lifecycle`'s own state machine, and does not attempt to model branching or retries. The
`REFLECTING -> EXECUTING` retry edge and the `PUBLISHING` approval gate stay exactly where they are, owned
by `Lifecycle`'s transition graph. Pipeline/Stage only decides *what runs* within the phases that are
already linear (today: `ANALYZING`, `PLANNING`; later, in principle, `EXECUTING`/`VALIDATING`/`PUBLISHING`
too) — it is a population mechanism for stage content, not a second workflow engine competing with
`Lifecycle`.

## Comparison

### Extensibility

**Current:** Adding an engine to an existing phase, adding a new phase, or defining an alternate sequence
all require editing `Runtime.ts`'s control flow directly. There is exactly one sequence `start()` can
produce.

**Proposed:** All three become data changes — append to a `Stage.engines` array, insert a new `Stage` into a
`Pipeline.stages` array, or define an entirely new `Pipeline` constant. `Runtime.ts` itself does not change
when the *content* of a pipeline changes, only when the *walking* algorithm needs to change (which is rare
and generic, not per-engine).

### Plugin support

**Current:** Structurally cannot support `docs/ORAM_SPECIFICATION_v1.md` Section 10's "Engine plugin"
promise. `PhaseEngineOverrides` replaces; it cannot add. A plugin has no defined operation available to it.

**Proposed:** "Register an Engine plugin into Stage X" becomes a well-defined operation: append the plugin's
`EngineDescriptor` to the named `Stage`'s `engines` array of the active `Pipeline`, resolved at
`RuntimeBuilder` composition time (the same seam `withObserveEngine()` already occupies — see ADR 0001/0002)
before `start()` ever runs. This is the mechanism the frozen spec already assumes exists; today's design
does not provide it.

### Multiple pipeline types

**Current:** Exactly one, implicit pipeline. `oram run` and any future `oram analyze` are forced to share
`start()`'s single hardcoded sequence or fork it entirely (code duplication, immediately violating "Engine
only computes, Runtime calls EngineRunner" by inventing a second orchestration path).

**Proposed:** `oram analyze` becomes `DEFAULT_ANALYSIS_PIPELINE` with its `PLANNING` stage simply omitted —
a different `Pipeline` *value*, run through the exact same `start()`/`EngineRunner` machinery. This directly
resolves `analyze.ts`'s own standing TODO. Other pipeline shapes (a narrower "security-focused" reasoning
pass, a docs-only pass) become equally easy to express later without ever touching `Runtime.ts` again.

### Backward compatibility

Fully preservable, and cheaply. The public "Runtime Contract" — `Runtime`, `RuntimeOptions`,
`RuntimeDependencies`, `RunHandle` — never needs to change; only `OramRuntime`'s *private* implementation of
`start()` changes, from an imperative sequence to a data-driven walk over `DEFAULT_ANALYSIS_PIPELINE`. This
is the same category of change Phase 3 already made once (`PhaseEngineOverrides`, ADR 0002) without touching
a single frozen interface. `PhaseEngineOverrides` itself does not need to be removed on day one — it can be
kept, temporarily, as a convenience that mutates the effective `Pipeline`'s first-matching-stage engine
before `start()` walks it, then formally deprecated once callers migrate to passing a `Pipeline` (or a
smaller override) directly through `RuntimeBuilder`.

### Migration cost

Low, and incremental — no step below requires touching `EngineRunner`, `ArtifactStore`, `EventBus`,
`Lifecycle`, `RuntimeContext`, `ProviderRegistry`, or `Logger`. All five already-proven Phase 2/3 components
are reused completely unchanged:

1. Add `Stage`/`Pipeline` as new, additive type definitions (a new `Pipeline.ts` file) — zero behavior
   change; nothing yet reads them.
2. Express today's exact `start()` sequence as one literal `DEFAULT_ANALYSIS_PIPELINE` data value.
3. Add a small, generic "walk a Pipeline" helper that transitions `Lifecycle` per `Stage.phase` and calls
   `EngineRunner.run()` per `Stage.engines` entry — this is a mechanical generalization of `start()`'s
   existing six lines, not new logic.
4. Rewrite `start()`'s body to call that helper against `DEFAULT_ANALYSIS_PIPELINE` (or an injected
   override). Verify byte-for-byte identical output to today's behavior — the same regression discipline
   Phase 3 already established for the Repository Analyzer wrapper, applied here to `start()` itself.
5. Only after step 4 is verified: extend `RuntimeBuilder` with a `withPipeline()` seam, let
   `PhaseEngineOverrides` become sugar implemented in terms of it, and unblock `analyze.ts`'s standing TODO.

Each step is independently shippable and independently verifiable; nothing requires a single large rewrite.

## Recommendation

**Adopt the Pipeline/Stage model.** It is not merely "nicer" — it is the only one of the two designs capable
of satisfying a promise (`docs/ORAM_SPECIFICATION_v1.md` Section 10's Engine plugins) and resolving a gap
(`analyze.ts`'s own TODO) that already exist in this codebase today. The migration cost is low specifically
*because* Phase 2/3 already isolated sequencing (`Runtime.start()`) from execution mechanics
(`EngineRunner`) — this proposal only touches the former.

## Consequences

**Positive:**
- Closes the two concrete gaps identified in Context (partial pipelines for `oram analyze`; a real
  mechanism for Engine plugins) without inventing new ones.
- `PhaseEngineOverrides` (Phase 3) is not wasted work — it becomes the special case "override this pipeline's
  first Observe-phase engine," expressible in terms of the more general mechanism rather than replaced by it.
- **Portability:** a `Pipeline` is plain, JSON-serializable data (an ordered list of stage/engine
  identifiers) with no reference to any filesystem path or MP6-specific concept — more portable to a
  standalone `oram` repository than today's design, where "what the pipeline does" is inseparable from
  `Runtime.ts`'s own TypeScript control flow. A future config file or plugin manifest could describe a
  `Pipeline` directly.

**Negative / open questions for whoever implements this next:**
- Where should `Pipeline`/`Stage` types live — inside `@oram/runtime` (alongside `EngineDescriptor`, which
  they compose) or a new, small `@oram/pipeline` package? Leaning `@oram/runtime` for now, matching how
  `EngineDescriptor` itself already lives there rather than in `@oram/engines` (see ADR 0002) — but this is
  worth revisiting once a second consumer of the `Pipeline` type exists.
- Should a `Stage`'s engines run sequentially (today's behavior, preserved) or does the model need to express
  parallelism eventually? Recommend deferring: sequential-only keeps `DEFAULT_ANALYSIS_PIPELINE` a faithful,
  literal transcription of today's proven behavior; parallelism can be a later, additive `Stage.mode` field.
- Should `PhaseEngineOverrides` be deprecated immediately once `withPipeline()` exists, or kept indefinitely
  as sugar? No decision made here — flagged for the implementing phase.

This document does not implement any of the above. Per the instruction this review was requested under, no
code changes accompany it.
