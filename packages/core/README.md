# @oram/core

Pure, dependency-free declarative type definitions shared across ORAM packages.

## Responsibility

Currently one module: `workflow/` — `StepId` (the closed union of step identifiers), `Workflow` (an id/name/
ordered-steps record), and `ENGINEERING_WORKFLOW` (the single, hardcoded `Workflow` value in use today). This
is the declarative data `packages/runtime/src/Runtime.ts` now loops over instead of calling
Observe → Understand → Reason → Plan directly — see `docs/adr/0004-pipeline-vs-direct-execution.md` for the
architecture review this change followed, and this package's own file-level comments for exactly how much of
that proposal this change does and does not implement (deliberately: only the declarative-sequence part —
no registry, no plugin support, no dynamic/YAML workflows, no phase/stage grouping).

## Explicit non-responsibilities

- No engine implementations, no imports of `@oram/engines`, `@oram/providers`, or `@oram/runtime` — this
  package sits below all of them, alongside `@oram/events`, as pure data with zero behavior.
- No interpretation of what a `StepId` *means* (which Lifecycle phase it belongs to, which
  `EngineDescriptor` implements it) — that interpretation is `@oram/runtime`'s job, kept out of this package
  so a Workflow value stays reusable if a second interpreter is ever needed.
- No registry, no way to select among multiple Workflows — only one Workflow value exists.

## Status

Real (not scaffolded). Introduced specifically to remove `Runtime.start()`'s previously-hardcoded execution
sequence, replacing it with a loop over `ENGINEERING_WORKFLOW.steps` — see the PR that introduced this
package for the full before/after and test results.
