# @oram/artifacts

Typed schemas and (de)serializers for every Artifact ORAM produces — see `docs/ORAM_SPECIFICATION_v1.md`
Section 8 ("Artifact Model").

## Responsibility

One schema per artifact kind, each a formalization of a JSON shape already proven in production by an
existing `scripts/*.js` engine:

`repository-analysis`, `engineering-knowledge`, `historical-context`, `recommendations` (a set of
Opportunities), `mission` (unifying today's `adaptive-decision.json` + `execution-plan.json`), `work-order`
(from `implementation-request.json`), `execution-result`, `validation-result`, `reflection-report`,
`pull-request`, `publish-result`.

Each schema is versioned (`docs/ORAM_SPECIFICATION_v1.md` Section 8's "schema-versioned" requirement) so
`oram replay` against an older run never has to guess whether a field still means what it used to.

## Explicit non-responsibilities

- Never decides *when* an artifact is written — that is `@oram/runtime`'s ArtifactStore.
- Never contains the logic that produces an artifact's *content* — that is `@oram/engines`.

## Status

Scaffolded (this README only). No schemas have been extracted yet. `packages/runtime`'s skeleton currently
types artifact payloads as `unknown` with a TODO pointing here — this package is expected to begin once
`@oram/engines`' extraction (Milestone 2, step 1) has settled each engine's real output shape.
