# ADR 0002: EngineRunner, EngineDescriptor, and Phase-Engine Injection

- **Status:** Accepted (Phase 2), extended (Phase 3)
- **Date:** Phase 2 core design; Phase 3 extended with `PhaseEngineOverrides` (documented here per Phase 3
  Task 5, since Task 3's real-world use of this pattern is what proved it out)

## Context

`docs/ORAM_SPECIFICATION_v1.md`'s Core Philosophy states plainly: "Engine only computes. Runtime calls
EngineRunner. EngineRunner calls Engine." Every one of System A's existing `scripts/*.js` engines instead
handles its own timing implicitly, calls its own `writeOutputs()`, and prints its own `console.log` lines —
the exact behavior the ORAM Runtime is supposed to centralize instead of repeat once per phase. Phase 2
needed one place that owns "run one engine: time it, log it, persist its output, publish the event, isolate
its failure" — and Phase 3 then needed a way to substitute a *real* engine (the wrapped
`repository-intelligence.js`) for one of Phase 2's placeholders, without violating
`docs/ORAM_SPECIFICATION_v1.md` Section 3's System Layers rule that Core Runtime (`@oram/runtime`) may never
depend on Intelligence (`@oram/engines`), which sits above it.

## Decision

**`EngineRunner` + `EngineDescriptor<TOutput>`** (`packages/runtime/src/EngineRunner.ts`): a generic,
engine-agnostic contract — `{ stage, artifactName, run(context), buildEvent(runId, output, ref) }` — and one
class, `EngineRunner`, whose `run()` method performs the full sequence (log start → invoke `run()` → persist
via `ArtifactStore` → publish via `EventBus` → log completion, or log-and-rethrow on failure) exactly once,
reused for every phase.

**`PhaseEngineOverrides`** (Phase 3, `packages/runtime/src/Runtime.ts`): `OramRuntime`'s constructor accepts
an optional, additive second parameter — `{ observe?, understand?, reason?, plan? }`, each an
`EngineDescriptor<unknown>` — defaulting every field to Phase 2's own placeholder when omitted.
`RuntimeBuilder.withObserveEngine()` (ADR 0001) is the fluent seam a caller uses to supply one. This is how
Phase 3 Task 3 ("Modify Runtime.start(). Replace the Observe placeholder with the wrapped Repository
Analyzer.") was implemented **without** `Runtime.ts` importing `@oram/engines`.

## Alternatives considered

1. **Inline the run/log/write/publish sequence directly inside `Runtime.start()`, once per phase.** Rejected
   even in Phase 2: four duplicated copies of the same five-step sequence, untestable in isolation, and
   exactly the kind of per-phase boilerplate the "Engine only computes" principle exists to eliminate.
2. **Let each Engine call `ArtifactStore`/`EventBus` itself**, instead of `EngineRunner` doing it on the
   Engine's behalf. Rejected: this is precisely what "Engine only computes" forbids — it would require every
   future real engine (starting with `repository-intelligence.js`'s eventual full rewrite) to know about
   artifact addressing and event-publishing conventions it has no business knowing, and would make every
   engine's own unit tests need a real or mocked `ArtifactStore`/`EventBus` just to exercise pure computation.
3. **(Phase 3 specifically) Have `Runtime.ts` hard-import `@oram/engines`'s
   `createLegacyRepositoryAnalyzerAdapter()` directly**, calling it in place of `observePlaceholder()`.
   Rejected: this is the literal, most direct reading of Task 3's wording, but it inverts
   `docs/ORAM_SPECIFICATION_v1.md` Section 3's frozen dependency direction (Core Runtime must depend only on
   layers *below* it; Intelligence sits *above* Core Runtime) and directly contradicts `Runtime.ts`'s own
   Phase 1 `NON-RESPONSIBILITIES` comment: "Runtime never contains engineering rules itself... those remain
   in `@oram/engines`." A hard import would make that comment false the moment it shipped.
4. **(Phase 3) Add a `repositoryPath`-only new field to the frozen `RuntimeOptions`/`Runtime` interfaces to
   smuggle engine selection through.** Rejected: those interfaces are the "Runtime Contract" Phase 3's own
   opening instruction says must be preserved; adding fields to them is a redesign, not a preservation.

The chosen approach — `PhaseEngineOverrides` as an additive, optional **constructor** parameter on the
concrete `OramRuntime` class — satisfies Task 3's literal goal (the Observe placeholder really is replaced,
provably, in the Phase 3 regression test) while touching zero frozen public interfaces and zero package
dependency edges. This is textbook Dependency Inversion: the lower layer (`@oram/runtime`) defines and
depends only on the `EngineDescriptor` *shape* it already owned since Phase 2; the higher layer supplies a
concrete instance satisfying that shape.

## Consequences

**Positive:**
- `EngineRunner` has now been exercised twice — against four synthetic Phase 2 placeholders and against one
  real, legacy-wrapped engine (Phase 3) — with identical code, proving the abstraction holds up under a real
  workload, not just a synthetic one.
- The System Layers dependency direction from `docs/ORAM_SPECIFICATION_v1.md` remains true in the source
  tree, not just on paper: `packages/runtime` has no dependency on `@oram/engines` in its `package.json`.
- Any future real engine (Understand, Reason, Plan, ...) follows the identical injection pattern —
  `PhaseEngineOverrides` already has fields reserved for all four Phase-2-covered phases.

**Negative / open:**
- `EngineDescriptor` (and `Provider`, in `ProviderRegistry.ts`) are still minimal shapes duplicated inside
  `@oram/runtime` rather than imported from their eventual home packages (`@oram/engines`, `@oram/providers`)
  — both are still README-only. This is intentional short-term debt, not an oversight; each carries its own
  `TODO(engines)`/`TODO(providers)` marking exactly where it should move.
- `PhaseEngineOverrides` only covers the four phases Phase 2 already modeled (Observe/Understand/Reason/
  Plan). Execute, Validate, Reflect, and Publish have no equivalent override seam yet — extending this same
  pattern to those phases is expected, not a new design problem, once a real Provider exists (Phase 4+).
