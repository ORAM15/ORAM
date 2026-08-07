# apps/dashboard

The real ORAM engineering dashboard — the successor to the prototype at
`frontend/src/pages/AutonomousEngineer.js`, which today only visualizes 3 of System A's 14 pipeline stages
by reading static, manually-synced JSON files (`frontend/scripts/sync-autonomous-data.js`).

## Responsibility

A live view of one repository's ORAM state, built against `packages/runtime`'s EventBus (`packages/events`)
rather than by polling files — see `ORAM_V3_MIGRATION_PLAN.md` Section 8 for the full panel-by-panel UX
vision (Pipeline, Current Stage, Work Orders, Validation, PR, Engineering Health, Artifacts, Logs).

## Explicit non-responsibilities

- Never computes engineering data itself — every panel renders data the `packages/engines` layer already
  produced and the `packages/runtime` ArtifactStore already persisted.
- Never invokes a Provider or approves a Mission directly — it may *trigger* an approval action, but the
  decision logic and safety gates live in `packages/runtime`, not here.

## Status

Scaffolded only. Per `ORAM_V3_MIGRATION_PLAN.md` Milestone 4, this app is deliberately the *last* thing
built, once the Runtime emits the events it needs — building it earlier against today's flat JSON files
would just reproduce the existing prototype's limitations instead of fixing them.

No code exists here yet. The existing `frontend/src/pages/AutonomousEngineer.js` prototype remains fully
functional and untouched in the meantime.
