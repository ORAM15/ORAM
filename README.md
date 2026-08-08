# ORAM — Orchestrated Repository Autonomous Manager

ORAM is a deterministic engineering intelligence framework: a pipeline of engines that observe a
repository, reason about it, and produce recommendations, validation results, and decisions about what
should happen next — without an LLM in the decision path itself. See `docs/ORAM_SPECIFICATION_v1.md` for
the full specification and `docs/history/origin.md` for how this project came to exist as its own
repository.

## Pipeline

```
Repository Analysis
      |
      v
Engineering Knowledge
      |
      v
Engineering Reasoning
      |
      v
Engineering Planning
      |
      v
Engineering Missions (Mission Graph)
      |
      v
Implementation Requests
      |
      v
Execution Planning
      |
      v
Implementation Executor
      |
      v
Provider Execution
      |
      v
Validation
      |
      v
Recommendation
      |
      v
Reflection
      |
      v
Engineering Memory
      |
      v
Adaptive Decision  <-- reads Validation + Recommendation + Reflection + Engineering Memory together
```

Every stage but the last is one-in, one-out: it consumes exactly the artifact the previous stage produced
and emits one new artifact. The Adaptive Decision Engine is the exception — the first stage that
synthesizes four upstream artifacts at once to choose one outcome (`CONTINUE`, `RETRY`, `SPLIT_MISSION`,
`ESCALATE_TO_HUMAN`, `CHANGE_PROVIDER`, or `STOP`). See `docs/presentation/decision-engine.md`.

## Two implementations, one lineage

This repository contains two pipelines on purpose:

- **`packages/engines/`** (TypeScript, `@oram/*` packages) — the current framework, driven by the `oram`
  CLI in `packages/cli/`. This is the supported entry point.
- **`scripts/`** ("System A") — the original, deterministic JavaScript pipeline ORAM evolved from.
  Real, tested code, kept as working reference material and prior art, not the recommended way to run ORAM
  today.

See `docs/history/origin.md` for why both exist.

## Installation

```bash
npm install
npm run build
npm link
```

`npm run build` bundles `packages/cli/src/bin.ts` into `packages/cli/dist/bin.js`; `npm link` exposes it
globally as `oram`.

## Usage

The recommended entry point is the flagship command:

```bash
oram engineer .
```

It runs every ORAM engine sequentially (Repository Analysis → Engineering Knowledge → Engineering
Reasoning → Engineering Planning → Engineering Missions → Implementation Requests → Execution Planning →
Implementation Executor → Recommendation Engine → Reflection Engine → Engineering Memory → Adaptive
Decision Engine) and prints one boot-sequence-style report ending in the FINAL ENGINEERING DECISION.

The individual per-stage commands (`oram analyze .`, `oram plan .`, `oram missions .`, `oram requests .`,
`oram execute-plan .`, `oram execute .`, `oram recommend .`, `oram reflect .`, `oram history .`,
`oram decide .`) remain available when you want to inspect a single stage's output — see `oram --help`.

## Repository layout

- `packages/` — the framework itself: `core`, `events`, `runtime`, `engines`, `cli`, plus scaffolded
  `providers`, `artifacts`, `plugins`, `sdk`.
- `apps/dashboard` — the (scaffolded) live engineering dashboard; see `apps/dashboard/README.md`.
- `scripts/` — System A, the original JavaScript pipeline.
- `providers/`, `publisher/` — System A's Claude provider adapter and GitHub publisher.
- `docs/` — specification, architecture decision records (`docs/adr/`), presentation material
  (`docs/presentation/`), project history (`docs/history/`), and the migration report
  (`docs/migration-report.md`).

## Contributing

See `CONTRIBUTING.md`. Security issues: see `SECURITY.md`.
