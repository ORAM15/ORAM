# ADR 0003: RuntimeContext as the Single Dependency-Injection Bag

- **Status:** Accepted (Phase 2)
- **Date:** Phase 2

## Context

Phase 2's design rules were explicit: *"Everything receives RuntimeContext. No globals. No
`path.resolve(__dirname, ...)`."* This directly targets a pattern present in every one of System A's
existing `scripts/*.js` engines: each computes `const root = path.resolve(__dirname, "..")` once, at module
load time, as a hidden global — the single biggest reason those engines assume they *are* the repository
they analyze (`ORAM_V3_MIGRATION_PLAN.md` Section 3's central finding, and the reason G-VAMS is planned to
move to `examples/` under Milestone 5). Any new abstraction built without addressing this pattern would just
relocate the problem, not solve it.

## Decision

Introduce `RuntimeContext` (`packages/runtime/src/RuntimeContext.ts`): one plain, immutable interface —
`{ repositoryRoot, config, logger, eventBus, artifactStore, providerRegistry }` — constructed exactly once
per run by a single pure factory function, `createRuntimeContext()`, and threaded explicitly into
`EngineRunner` and (from Phase 3) into every `EngineDescriptor.run(context)` call. `repositoryRoot` is always
supplied by the caller (ultimately, `Runtime.start()`'s own `RuntimeOptions.repositoryPath`) — never computed
from `__dirname` or any other implicit, load-time source.

## Alternatives considered

1. **Module-level singletons** for the logger/event bus/artifact store (mirroring how every legacy engine
   already has a module-level `root`). Rejected outright: this is exactly the "globals" pattern design rule
   7 forbids, and it would make running two Engineering Cycles concurrently within one process — or even
   just unit-testing one component in isolation — impossible without monkey-patching module state.
2. **Pass each dependency as its own separate parameter** to every function that needs one (e.g.
   `run(repositoryRoot, config, logger, eventBus, artifactStore, providerRegistry)`), instead of bundling
   them into one object. Rejected: parameter-list bloat, easy to pass arguments in the wrong order (several
   of these are same-shaped objects), and every call site across every future engine would need editing
   whenever one more cross-cutting dependency is introduced (e.g. a future `GateRegistry`).
3. **A class with methods, rather than a plain data interface.** Rejected: nothing about a `RuntimeContext`
   needs behavior of its own — it is purely a bag of already-constructed collaborators. A plain interface
   plus one pure factory function is simpler, trivially constructible in a test with partial overrides, and
   avoids inventing a class hierarchy for what is fundamentally a value object.

## Consequences

**Positive:**
- `repositoryRoot` living on `RuntimeContext` — rather than being computed from `__dirname` anywhere — is
  precisely what let Phase 3's `LegacyRepositoryAnalyzerAdapter` receive "which repository to analyze" as
  ordinary data instead of an assumption baked into its own file location. (The wrapped *legacy script*
  itself still cannot take that data, since Phase 3 explicitly forbids rewriting it — see that adapter's own
  KNOWN LIMITATION comment — but the *new* code written in Phase 2/3 fully honors design rule 7.)
- Every future real engine, provider, or gate follows one, already-proven injection pattern; there is no
  second convention to invent later.
- Trivially testable: Phase 3's regression test constructs a `RuntimeContext` by hand, pointed at a temporary
  `ArtifactStore` and a real repository root, with no module state to reset between tests.

**Negative / open:**
- `config: unknown` remains a placeholder typed as `unknown` pending `@oram/artifacts` having a generated
  type to check it against (tracked identically in `Runtime.ts`'s own `RuntimeOptions.config` TODO).
- `RuntimeContext` deliberately does **not** carry a `runId` (see its own TODO) so that, in principle, one
  context could be reused across more than one run within a process. The practical effect today is that
  `EngineRunner.run()` must accept `runId` as a *second*, separate parameter alongside `context` — a minor
  asymmetry worth revisiting once it's clear whether contexts are ever actually reused across runs in
  practice.
