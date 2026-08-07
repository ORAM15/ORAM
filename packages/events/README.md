# @oram/events

Typed Event definitions for the ORAM Timeline — see `docs/ORAM_SPECIFICATION_v1.md` Section 7 ("Event
Model").

## Responsibility

The `OramEvent` discriminated union and its nine v1 members (`RepositoryAnalyzed`, `KnowledgeBuilt`,
`RecommendationsGenerated`, `MissionCreated`, `ExecutionStarted`, `ExecutionFinished`,
`ValidationCompleted`, `ReflectionCompleted`, `PRCreated`), each generalizing the moment an existing
`scripts/*.js` engine writes its artifact into a typed, subscribable notification. Consumed by
`@oram/runtime`'s EventBus, and by any Experience-layer package (`@oram/cli`, `apps/dashboard`) that needs
to observe a run without polling the ArtifactStore.

## Explicit non-responsibilities

- Never carries an event's full payload data by value if that data is large — an event references an
  Artifact (via `@oram/artifacts`' addressing scheme) rather than duplicating it.
- Never implements delivery (pub/sub) itself — that is `@oram/runtime`'s EventBus; this package only defines
  shapes.

## Status

Skeleton (`src/types.ts`) — the full v1 event union is defined and compile-safe; no publisher/subscriber
logic lives here (see `@oram/runtime`'s `EventBus.ts`). See `ORAM_V3_MIGRATION_PLAN.md` Milestone 2.
