# Migration Report — ORAM Extraction from G-VAMS

Source: `d:\BRDR\Development\Active Projects\MP6` (G-VAMS monorepo), branch `feature/sprint-14`
(commit `89f4dd7`, "feat: add Adaptive Decision Engine (Capability Sprint 14)").
Destination: `d:\BRDR\Development\Active Projects\ORAM` (this repository), copied out — the source repository
was left untouched.

## Files moved (copied out of G-VAMS, unchanged in content)

| Source | Destination | Notes |
|---|---|---|
| `packages/{core,events,runtime,engines,cli,artifacts,plugins,providers,sdk}/`, `packages/README.md` | `packages/` | `node_modules/` and `dist/` excluded; reinstalled/rebuilt fresh here |
| `apps/dashboard/`, `apps/README.md` | `apps/` | scaffolded only, per its own README |
| `providers/claude/` (`adapter.js`, `parser.js`, `prompt-builder.js`) | `providers/claude/` | System A's Claude provider adapter |
| `publisher/github/client.js` | `publisher/github/` | System A's GitHub publisher |
| `docs/ORAM_SPECIFICATION_v1.md` | `docs/` | |
| `docs/adr/0001..0004*.md` | `docs/adr/` | all 4 ADRs |
| `docs/presentation/*` (README-demo, architecture.md/.png/.svg, decision-engine.md, demo-script.md, teacher-questions.md) | `docs/presentation/` | |
| `ORAM_V3_MIGRATION_PLAN.md` | `/` (root) | |
| `ORAM_PROJECT_EVOLUTION_REPORT.md` | `/` (root) | was untracked in the source repo; copied as-is |
| `oram.config.schema.json` | `/` (root) | |
| `examples/README.md` | `examples/` | |
| `tsconfig.base.json` | `/` (root) | copied unchanged — already scoped to `packages/*`/`apps/*` only |
| `.gitattributes` | `/` (root) | copied unchanged (`*.snap.txt eol=lf` rule) |

**21 of 37 files in `scripts/`** — System A's engine pipeline and its tests — were copied to `scripts/`:
`autonomous-orchestrator(.test).js`, `repository-intelligence(.test).js`, `engineering-knowledge(.test).js`,
`recommendation-engine(.test).js`, `decision-engine(.test).js`, `implementation-request-engine(.test).js`,
`implementation-executor(.test).js` + `implementation-executor.claude-provider.test.js`,
`validation-engine(.test).js`, `pull-request-generator(.test).js`, `github-publisher(.test).js`.

## Files intentionally NOT moved (stay G-VAMS-only)

- `backend/`, `frontend/` — the G-VAMS ERP application itself.
- `.agent/` (all of it) — System B's operational config (`PROJECT_VISION.md`, `BACKLOG.md`,
  `DEVELOPMENT_MEMORY.md`, `DAILY_DECISIONS.json`, gate schemas/runtime state) is written specifically
  about and for the G-VAMS repository, not reusable framework logic.
- **16 of 37 `scripts/` files** — the `agent-*` family (`agent-gatekeeper.js`, `agent-runtime-adapter.js`,
  `agent-cycle.js`, `agent-branch-publish.js`, `agent-backlog-reconcile.js`, `autonomous-agent-context.js`,
  `generate-project-health.js`, and their `.test.js` files) — System B, which exists to autonomously evolve
  *this specific G-VAMS repository* on a schedule, not a generic capability.
- `.github/workflows/agent-backlog-reconcile.yml`, `autonomous-evolution.yml`, `delta-budget-contract.yml`,
  `project-health.yml` — CI wired to the G-VAMS-specific System B above and to `docs/PROJECT_HEALTH.md`.
- `docs/PHASE_2C2_*.md`, `docs/PROJECT_HEALTH.md`, `docs/MAINTENANCE_NOTE.md` — G-VAMS-specific historical
  and operational docs, not part of ORAM's own specification/history.

## Files renamed

None. File and directory names were preserved as-is; only branding *content* (package name, README prose)
changed, listed below.

## Files removed

None — this was a copy, not a move (per explicit instruction: G-VAMS's own copies of every file above are
untouched).

## Configurations changed

- **`package.json`** — `name` changed from `"G-VAMS-ERP"` to `"oram"`; `description` rewritten to describe
  ORAM standalone rather than "workspace root for the packages/ tree ... does not affect backend/ or
  frontend/"; added a `test` script. `workspaces: ["packages/*"]` and the `bin` field were already
  self-contained and needed no change.
- **`.gitignore`** — rewritten to drop G-VAMS-specific entries (`frontend/node_modules/`,
  `backend/node_modules/`, `frontend/build/`, `.agent/runtime/*`, `frontend/public/autonomous-engineer-data/`);
  every entry describing `packages/*/dist/` and each engine's own generated-output directory was kept as-is.
- **`README.md`** (root) — the source repository's own root README was effectively empty (2 bytes); this
  repository's root README was written new, describing ORAM, its 14-stage pipeline, and the two preserved
  implementations (`packages/engines` vs. `scripts/`).
- **New root docs added** that did not exist in the source repository: `LICENSE` (MIT — a default choice;
  confirm or change the license/copyright holder if this should be different), `CONTRIBUTING.md`,
  `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `docs/history/origin.md`, and
  `.github/workflows/ci.yml` (a fresh, minimal install/test/build workflow — the source repository's own
  workflows were G-VAMS-specific and were not ported, see above).

## Dependencies updated

None required. `packages/*/package.json` dependency lists were already scoped to `@oram/*` workspace
packages and had no reference to `backend/`/`frontend`/G-VAMS. `scripts/*.js` (System A) use only Node core
modules (`fs`, `path`, `crypto`, `child_process`) — zero npm dependencies, nothing to update.
`package-lock.json` was copied as-is and revalidated by a fresh `npm install` in this repository (0
vulnerabilities, 13 packages added, no changes needed).

## Imports rewritten

None. Every `@oram/*` import in `packages/` already resolved via `tsconfig.base.json`'s own `paths` map and
the `npm` workspace symlinks — both were self-contained relative to `packages/` and needed no path changes
after the move. No file in `packages/`, `scripts/`, `providers/`, or `publisher/` imports anything from
`backend/`, `frontend/`, or `.agent/`.

## Test fixture snapshots regenerated

Two stored snapshot files encode this repository's absolute filesystem path as part of a deterministic id
(`repositoryId = makeId("repository", repositoryRoot)`) and necessarily changed value when the repository
moved to a new path — this is expected, not a bug:

- `packages/engines/src/memory/__snapshots__/run-snapshot-concentrated-monorepo.snap.json` — `repositoryId`
  updated from the `...-mp6-...` hash to the `...-oram-...` hash.
- `packages/cli/src/report/__snapshots__/history-concentrated-monorepo.snap.txt` — same `repositoryId`
  string, in its rendered report form.

## Bonus fix: pre-existing CRLF snapshot issue resolved

The source repository carried 5 known, long-documented CRLF/LF snapshot mismatches (`missions`, `requests`,
`execute`, `execute-plan`, `recommend` CLI snapshot `.snap.txt` files, predating the `.gitattributes`
`eol=lf` rule added in Capability Sprint 12). Because this extraction used a plain filesystem copy rather
than a `git checkout` (which would have re-applied `.gitattributes` normalization), those 5 files were
normalized to LF directly in this repository. **This repository now has zero known snapshot failures**,
where the source repository still carries the 5 as accepted technical debt.

## Verification

- `npm install` — 13 packages added, 0 vulnerabilities.
- `npx tsx --test packages/engines/src/**/*.test.ts` — **170/170 passing**.
- `npx tsx --test packages/cli/src/**/*.test.ts` — **27/27 passing** (0 known failures, see above).
- `npm run build` — succeeds, produces `packages/cli/dist/bin.js` (159.6kb).
- `node packages/cli/dist/bin.js decide .` — runs the full 13-stage pipeline against this repository itself
  end-to-end and reports `SUCCESS`, with zero reference to any G-VAMS path or file.

## Remaining TODOs

- Decide on the `LICENSE` copyright holder (currently "ORAM Project Contributors") and confirm MIT is the
  intended license.
- `packages/cli/package.json`'s own `version` field still reads `0.0.0` (unchanged from the source
  repository) even though the new root `package.json` is versioned `0.1.0` — decide whether to align these.
- No git history was carried over (per Phase 10's instruction to create one clean initial commit) — if
  historical blame/log continuity is ever wanted, that would require a `git filter-repo`-based extraction
  from the original repository instead of a fresh `git init`, which was explicitly not requested here.
- `ROADMAP.md` enumerates the still-scaffolded pieces (`historical-context` engine, `pull-request`/
  `publisher` engines, real Providers, `apps/dashboard`, several CLI commands) — none of this is new
  migration debt, it was already future work in the source repository.
- The G-VAMS repository's own root `README.md` mini-PR (documenting that ORAM was extracted) is tracked
  separately — see that repository's `docs/adaptive-decision-pipeline-note` / new extraction-note branch.
