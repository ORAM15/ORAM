# @oram/cli

The `oram` command — the primary Experience-layer entry point. Supersedes `scripts/gvams-cli.js` entirely
(see `ORAM_V3_MIGRATION_PLAN.md` Section 4.3); no user of `oram` should ever need to know
`scripts/autonomous-orchestrator.js` exists.

## Installation

From the repository root:

```bash
npm install
npm run build
npm link
```

`npm run build` bundles `packages/cli/src/bin.ts` (via esbuild) into `packages/cli/dist/bin.js`. `npm link`
uses the workspace root's own `bin` field to expose that file globally as `oram`.

## Usage

```bash
oram analyze .
oram plan .
oram missions .
oram requests .
oram execute-plan .
oram execute .
oram recommend .
oram reflect .
oram history .
oram decide .
oram --help
oram --version
```

## Responsibility

The original fixed ten commands (`init`, `run`, `analyze`, `plan`, `execute`, `validate`, `inspect`,
`dashboard`, `doctor`, `replay`) — see `docs/ORAM_SPECIFICATION_v1.md`'s companion CLI table in
`ORAM_V3_MIGRATION_PLAN.md` Section 6 for each command's purpose/inputs/outputs — plus `help`/`version`
(Sprint 4.5), `missions` (Sprint 5), `requests` (Sprint 6), `execute-plan` (Sprint 7), a real
implementation of `execute` (Sprint 8, superseding its earlier stub -- see execute.ts's own header comment
for what that stub's original, heavier, Provider-gated vision was and why it's still a TODO, not this),
`recommend` (Sprint 11), `reflect` (Sprint 12), `history` (Sprint 13), and `decide` (Sprint 14). Sprints 9
(Provider Execution) and 10 (Validation) added no CLI command of their own.
Every command is a thin wrapper: parse arguments, construct or attach to a `@oram/runtime` `Runtime`
instance, call one method on it, format the result for the terminal.

## Explicit non-responsibilities

- No command contains engineering logic — that always lives in `@oram/engines`, invoked through the Runtime.
- No command talks to a Provider, the filesystem artifact store, or git directly — always through
  `@oram/runtime`'s public interface.

## Status

`analyze`, `plan`, `missions`, `requests`, `execute-plan`, `execute`, `recommend`, `reflect`, `history`, and
`decide` are real: each runs @oram/engines' pipeline directly (Repository Analysis -> Engineering Knowledge ->
Engineering Reasoning, then one stage further for each of `plan` (Engineering Planning), `missions`
(Engineering Missions), `requests` (Implementation Requests), `execute-plan` (Execution Planning), `execute`
(the Implementation Executor, via its default, side-effect-free `MemoryAdapter`), `recommend` (Provider
Execution -> Validation -> Recommendation, via the default `MemoryProvider`), `reflect` (one further stage:
Reflection, reasoning over the whole Validation + Recommendation batch), `history` (one further stage:
Engineering Memory, recording that run as one `RunSnapshot` into a fresh, in-process-only `MemoryStore`), and
`decide` (one further stage: the Adaptive Decision Engine, synthesizing Reflection + Validation +
Recommendation + the latest recorded Memory run into one `EngineeringDecision`)) and prints a
presentation-ready console report -- see
`src/report/`. None are wired to `@oram/runtime` (no Lifecycle, no ArtifactStore, no EventBus); that's
deliberate, see each command's own header comment. `run` (Capability Sprints 18-19) is the exception and the
primary command: it executes the full real thirteen-stage pipeline through `@oram/runtime`'s
`Runtime.runPipeline()` -- real Lifecycle, real EngineRunner, real ArtifactStore persistence under
`<repository>/.oram` (or `--artifacts-dir`), artifact handoff between every stage. Since Sprint 19 the run
genuinely PAUSES at `AWAITING_APPROVAL` before Provider Execution -- no auto-pass, no timer -- and only
proceeds to COMPLETE (or aborts) when `--approve` / `--reject[=<reason>]` is passed, driving the real
`Runtime.approve()`/`Runtime.reject()` within the same process/run; with neither flag the process exits with
the run still paused. `help`/`version`
(and their `--help`/`-h`/`--version`/`-v` flag aliases -- see `src/index.ts`) are real too. Every other
command (`init`, `validate`, `inspect`, `dashboard`, `doctor`, `replay`) is still command architecture only,
currently printing `"Not implemented yet."`. See `ORAM_V3_MIGRATION_PLAN.md` Milestone 1.

**Packaging (Capability Sprint 4.5):** `bin.ts` is now a real, buildable entry point -- `npm run build`
bundles it with esbuild into `packages/cli/dist/bin.js` (not committed; see this repo's root `.gitignore`),
and the workspace root's `package.json` declares `"bin": { "oram": "./packages/cli/dist/bin.js" }` so a bare
`npm link` at the repository root, no `-w`/`--workspace` flag needed, links the real global `oram` command.

`scripts/gvams-cli.js` remains the only functional CLI in the meantime and is not modified by this package's
existence.
