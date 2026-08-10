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
      |
      v
Pull Request Proposal  <-- deterministic PR proposal artifact; nothing is published
```

Most stages are one-in, one-out: each consumes exactly the artifact the previous stage produced and emits
one new artifact. The Adaptive Decision Engine is the first exception — the first stage that synthesizes
four upstream artifacts at once to choose one outcome (`CONTINUE`, `RETRY`, `SPLIT_MISSION`,
`ESCALATE_TO_HUMAN`, `CHANGE_PROVIDER`, or `STOP`). See `docs/presentation/decision-engine.md`. The Pull
Request Engine then converts that decision plus the run's implementation artifacts into one deterministic,
structured `PullRequestProposal` (title, branch name, full PR body, verification expectations, and whether
human approval is required).

**ORAM does not publish pull requests automatically.** The Pull Request Engine never calls GitHub, never
runs git, never invokes an LLM, and never modifies the repository — it only produces the proposal
artifact. Actual GitHub publication belongs to a future Runtime/Publisher layer.

## Two execution styles

- **Direct engine API** — every stage is a pure `buildX()` function you compose by hand (this is what the
  per-stage CLI commands do). Ideal for isolated, deterministic testing; recomputes upstream stages by
  design.
- **Runtime pipeline execution** (Capability Sprint 17) — engines invoked through `@oram/runtime`'s
  `EngineRunner` receive a run-scoped `RunArtifacts` view and consume artifacts already persisted by
  earlier stages of the same run instead of recomputing them. Same-run identity is enforced by the
  `ArtifactStore`'s own addressing (every artifact is keyed by `runId`), and a missing required artifact
  fails with a clear, deterministic error. Run `oram handoff .` to see this working: it persists every
  upstream artifact once, then drives the Adaptive Decision and Pull Request Engines through the real
  `EngineRunner` with their recompute fallbacks forbidden.

ORAM is moving toward a fully artifact-driven execution pipeline: every arrow in the diagram above should
increasingly represent an artifact handoff rather than a recomputation.

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

To try the CLI straight from a clone without building or linking, run it in dev mode via `tsx`
(`npm install` provides it):

```bash
npx tsx packages/cli/src/bin.ts engineer .
```

Every `oram <command>` in this README works the same way as `npx tsx packages/cli/src/bin.ts <command>`.

## Usage

The recommended entry point is the flagship command:

```bash
oram engineer .
```

It runs every ORAM engine sequentially (Repository Analysis → Engineering Knowledge → Engineering
Reasoning → Engineering Planning → Engineering Missions → Implementation Requests → Execution Planning →
Implementation Executor → Recommendation Engine → Reflection Engine → Engineering Memory → Adaptive
Decision Engine → Pull Request Engine) and prints one boot-sequence-style report ending in the FINAL
ENGINEERING DECISION and the PULL REQUEST PROPOSAL.

The individual per-stage commands (`oram analyze .`, `oram plan .`, `oram missions .`, `oram requests .`,
`oram execute-plan .`, `oram execute .`, `oram recommend .`, `oram reflect .`, `oram history .`,
`oram decide .`, `oram pull-request .`) remain available when you want to inspect a single stage's output —
see `oram --help`.

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
