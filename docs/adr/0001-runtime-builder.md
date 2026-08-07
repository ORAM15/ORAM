# ADR 0001: RuntimeBuilder as the Core Runtime's Composition Root

- **Status:** Accepted (Phase 2), extended (Phase 3)
- **Date:** Phase 2 (retroactively documented in Phase 3, per Phase 3 Task 5)

## Context

Phase 1 left five Core Runtime interfaces — `EventBus`, `ArtifactStore`, `ProviderRegistry`, `Logger`, and
`Runtime` itself — each with exactly one reference implementation (`InMemoryEventBus`,
`FileSystemArtifactStore`, `InMemoryProviderRegistry`, `BufferedLogger`, `OramRuntime`). Nothing yet decided
*where* those four dependencies get chosen and wired into an `OramRuntime` instance. Without a single answer
to that question, every consumer (`@oram/cli`, tests, a future `apps/dashboard`) would otherwise need its
own knowledge of which concrete class backs which interface — exactly the kind of duplicated wiring
`docs/ORAM_SPECIFICATION_v1.md`'s Core Runtime responsibilities are supposed to centralize.

## Decision

Introduce `RuntimeBuilder` (`packages/runtime/src/RuntimeBuilder.ts`) as the one Composition Root:

- A fluent `with*()` override for each of the four dependencies (`withEventBus`, `withLogger`,
  `withArtifactStore`, `withProviderRegistry`), each optional.
- `build(options: RuntimeBuilderOptions): Runtime` composes whichever dependencies were supplied, defaulting
  any that weren't to the v1 reference implementation, and returns a ready `OramRuntime`.
- `RuntimeBuilder.createDefault(options)` is a one-call convenience for the common "every default" case.

Phase 3 extended this same builder with `withObserveEngine(engine)` — see ADR 0002 for why that specific
seam exists and why it lives here rather than as a hard import inside `Runtime.ts`.

## Alternatives considered

1. **`OramRuntime`'s own constructor instantiates its defaults directly** (e.g. `new InMemoryEventBus()`
   inline whenever no dependency is passed). Rejected: this couples the Runtime class itself to concrete
   implementations, defeats the purpose of depending on interfaces, and makes substituting a test double
   (or, later, a durable/hosted transport — see `docs/ORAM_SPECIFICATION_v1.md` Section 11's Non-goals on a
   future hosted ORAM) require editing `Runtime.ts` itself instead of composing it differently.
2. **A single factory function**, e.g. `createRuntime(options)`, with no override seam at all. Rejected:
   works for the default case but provides no way to substitute a dependency for testing or for a future
   deployment target without adding parameters to the function signature every time a new override is
   needed — exactly the extensibility problem a builder avoids.
3. **A general-purpose DI container/framework.** Rejected outright: a new external dependency for a problem
   five constructor-injected classes and one builder already solve, and directly against this codebase's own
   established, repeatedly-stated preference for zero new dependencies (see `scripts/gvams-cli.js`'s
   hand-rolled argument parser, cited as precedent in `@oram/cli`'s own design).

## Consequences

**Positive:**
- One place decides "which concrete class backs which interface" — every consumer depends on
  `RuntimeBuilder`, never on `InMemoryEventBus`/`FileSystemArtifactStore`/etc. directly.
- The override seam was proven useful almost immediately: Phase 3's `withObserveEngine()` is the exact same
  pattern, added without touching `build()`'s core structure.
- Zero new dependencies, consistent with every other package in this monorepo.

**Negative / open:**
- `build()` must be remembered and updated every time a new Core Runtime dependency is introduced (e.g. a
  future `GateRegistry` per `docs/ORAM_SPECIFICATION_v1.md` Section 10's Plugin Model) — there is no
  compiler-enforced checklist ensuring this.
- `RuntimeBuilderOptions.repositoryRoot` and `Runtime.start()`'s own `RuntimeOptions.repositoryPath` are
  presently decoupled (the former only seeds the default `ArtifactStore` location at composition time); see
  `RuntimeBuilder.ts`'s own open TODO on whether these should eventually be unified.
