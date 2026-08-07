# packages/

The ORAM platform itself, as a set of independently-versionable packages. Each package owns exactly one
layer or seam described in `docs/ORAM_SPECIFICATION_v1.md` Section 3 (System Layers) — see each package's
own `README.md` for its specific responsibility and non-responsibilities.

This directory is scaffolding only, per `ORAM_V3_MIGRATION_PLAN.md` Milestone 0/2. It grows alongside the
existing, fully-functional pipeline under `scripts/` — nothing here replaces or depends on that pipeline
yet. See the root-level `ORAM_V3_MIGRATION_PLAN.md` for the full migration order.

| Package | Layer | Status |
|---|---|---|
| `core` | cross-cutting (below Core Runtime) | Real — declarative `Workflow`/`StepId` types + `ENGINEERING_WORKFLOW`, zero dependencies |
| `runtime` | Core Runtime | Real — `Lifecycle`, `EventBus`, `ArtifactStore`, `EngineRunner`, `RuntimeBuilder` implemented; `start()` now executes `@oram/core`'s `ENGINEERING_WORKFLOW` via a generic loop instead of a hardcoded call sequence |
| `engines` | Intelligence | One real member (`repository-analyzer`, wrapping `scripts/repository-intelligence.js`); every other phase still scaffolded (README only) |
| `providers` | Execution | Scaffolded (README only) |
| `events` | Core Runtime | Real — typed event definitions |
| `cli` | Experience | Skeleton (command architecture, no behavior) |
| `sdk` | Experience | Scaffolded (README only) |
| `artifacts` | cross-cutting | Scaffolded (README only) |
| `plugins` | cross-cutting | Scaffolded (README only) |
