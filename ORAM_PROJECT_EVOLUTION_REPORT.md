# ORAM Project Evolution Report
## Complete Engineering History After Phase 2K

*Prepared as a forensic reconstruction from git history, pull requests, commits, source code, architecture decision records, and package documentation in this repository. Every claim below is traceable to a specific commit, PR, branch, or file — cited inline. Where a fact could not be verified from repository evidence, it is explicitly marked as inference.*

---

## 1. Executive Summary

This repository began as **G-VAMS ERP**, a school-management application (`frontend/`, `backend/`), and grew an increasingly elaborate autonomous-engineering automation layer on top of itself across roughly 40 pull requests spanning Phases 2A through 2K. **Phase 2K** — the last phase before the events this report covers — hardened that automation's runtime-report/diff consistency, backlog lifecycle, and lockfile-churn safety (PRs #30–#40, culminating in PR #40, commit `160fd92`, merged 2026-07-24T09:08:53Z).

Immediately after Phase 2K, the project did **not** pivot right away. Instead, over the next 36 hours (2026-07-24 through 2026-07-25), development raced to *finish* the original automation system — a fourteen-stage, script-based pipeline ("System A") — building out Repository Intelligence, Engineering Knowledge, a Dashboard, Decision, Implementation Request, Implementation Executor, Validation, Pull Request Generator, GitHub Publisher, and an Autonomous Orchestrator conducting all of it (PRs #41–#50), plus a Reflection Engine (PR #51) and several more engines built as local branches that were never merged (Historical Context Retriever, Adaptive Decision Engine v2, Execution Planner, Run History Manager, Engineering Memory — see §2).

Then, on **2026-07-26**, everything changed in a single, deliberate commit: `669c1fd`, *"feat: add ORAM v1 execution runtime and intelligence engines"* (PR #52). This commit is the pivot this report is named for. It introduced:

- A brand-new `packages/*` npm workspace, structurally separate from `scripts/*.js`.
- **ORAM** — *Orchestrated Repository Autonomous Manager* — a from-scratch architectural identity, governed by a written technical constitution (`docs/ORAM_SPECIFICATION_v1.md`) and a detailed migration blueprint (`ORAM_V3_MIGRATION_PLAN.md`).
- A layered Core Runtime (`@oram/runtime`): `Lifecycle`, `EventBus`, `ArtifactStore`, `ProviderRegistry`, `Logger`, `RuntimeContext`, `RuntimeBuilder`, `EngineRunner` — already internally at what its own comments call "Phase 4" (a declarative, data-driven workflow engine, `@oram/core`'s `ENGINEERING_WORKFLOW`).
- The first real Intelligence-layer engine, `repository-analyzer`, in two forms: a legacy-wrapping adapter and a genuinely new, repository-agnostic, native TypeScript implementation.
- Four Architecture Decision Records (`docs/adr/0001`–`0004`) documenting *why* each runtime seam exists.

From that pivot forward, the project has proceeded as a disciplined, one-capability-at-a-time buildout of a twelve-stage Intelligence pipeline, each stage its own `@oram/engines` sub-package, each shipped with its own CLI command, renderer, and test suite. As of this report (`main` at commit `650800c`, 2026-08-03), the pipeline runs unbroken from **Repository Analysis** through **Reflection**:

```
Repository Analysis → Engineering Knowledge → Engineering Reasoning → Engineering Planning
  → Engineering Missions → Implementation Requests → Execution Planning → Implementation Executor
  → Provider Execution → Validation → Recommendation → Reflection
```

Twelve real engines. Ten real CLI commands. 172 tests across the workspace (167 passing outright; 5 fail only due to a pre-existing, now-fixed Windows line-ending artifact — see §9, §11). Roughly 12,500 lines of TypeScript in `packages/`. Zero AI calls anywhere in the pipeline except behind an explicitly isolated, currently-stubbed Provider seam. This report reconstructs, in order, how that came to be.

---

## 2. The Transition

### 2.1 What stopped, and why

Two independent automation systems had accumulated inside the G-VAMS repository by the end of Phase 2K, a fact the project's own planning document states plainly:

> "Two independent automation systems live in this one repository, alongside the G-VAMS ERP application itself (`frontend/`, `backend/`) which they were both bootstrapped inside of." — `ORAM_V3_MIGRATION_PLAN.md` §1.1

**System A** — a deterministic, script-based, fourteen-stage engineering pipeline (`scripts/autonomous-orchestrator.js` conducting `repository-intelligence.js` → `engineering-knowledge.js` → `historical-context-retriever.js` → `recommendation-engine.js` → `adaptive-decision-engine.js` → `execution-planner.js` → `implementation-request-engine.js` → `implementation-executor.js` → `validation-engine.js` → `reflection-engine.js` → `run-history-manager.js` → `engineering-memory.js` → `pull-request-generator.js` → `github-publisher.js`).

**System B** — a GitHub Actions autonomous agent (`.github/workflows/autonomous-evolution.yml`) with its own context builder, gatekeeper, Gemini/OpenHands runtime adapter, branch publisher, and backlog reconciler — the system that produced the *actual* Phase 2 lineage of PRs (#1–#38), including one genuinely real, human-merged autonomous PR (#38).

The migration plan identifies four concrete duplications between them (§1.3): two decision engines (`decision-engine.js` v1 vs `adaptive-decision-engine.js` v2), two provider abstractions (System A's `PROVIDERS` registry vs System B's `runtime_mode`), two memory subsystems (`runs/`+`memory/` vs `.agent/DEVELOPMENT_MEMORY.md`+`DAILY_DECISIONS.json`), and two Git-publishing implementations (`publisher/github/client.js` vs `agent-branch-publish.js` + inline workflow YAML).

But duplication wasn't the deciding problem — it was **architectural**. Every one of System A's fourteen engines computed its own repository root via `path.resolve(__dirname, "..")` at module load time:

> "The single most important structural decision in this section: ORAM's own source code must stop living inside the G-VAMS repository. Today, `path.resolve(__dirname, "..")` in nearly every engine assumes 'the repo root is one directory above `scripts/`' — i.e., every engine assumes it *is* the repository it's analyzing. That assumption is the actual architectural blocker to 'point ORAM at any Git repository,' more than any missing feature." — `ORAM_V3_MIGRATION_PLAN.md` §3

This is the single sentence that explains the entire transition. A pipeline that can only ever analyze the repository it lives inside is a script collection, not a product. Everything that follows in this report is, structurally, the working-out of that one sentence.

### 2.2 The unfinished sprint: racing to complete System A (2026-07-24 → 2026-07-25)

Before the pivot, the project did not abandon System A abruptly — it tried to *finish* it first. In the 36 hours immediately after Phase 2K's last merge (PR #40, `160fd92`, 2026-07-24T09:08:53Z), ten more PRs landed against the legacy `scripts/*.js` architecture, each adding one more of System A's fourteen planned stages:

| PR | Merged | Title | Stage completed |
|---|---|---|---|
| #41 | 07-24 10:04 | Add Repository Intelligence v1 | Observe |
| #42 | 07-24 10:18 | Add Engineering Knowledge Engine v1 | Understand |
| #43 | 07-24 11:02 | Add Autonomous Engineer Dashboard v1 | (visualization prototype) |
| #44 | 07-24 11:35 | Add Decision Engine v1 | Decide |
| #45 | 07-24 11:50 | Add Implementation Request Engine v1 | Plan |
| #46 | 07-24 12:04 | Add Implementation Executor v1 (+ Claude Code Provider Adapter v1) | Execute |
| #47 | 07-24 14:23 | Add Validation Engine v1 | Validate |
| #48 | 07-24 14:42 | Add Pull Request Generator v1 | Publish |
| #49 | 07-24 15:48 | Add GitHub Publisher Adapter v1 | Publish |
| #50 | 07-24 15:49 | Add Autonomous Engineering Orchestrator v1 ("conductor for all 9 stages") | (integration) |
| #51 | 07-25 10:12 | Add Reflection Engine v1 | Reflect |

By PR #51, System A had a real conductor and nine of its fourteen planned stages wired end to end, plus a real (if never-live-fired) Claude Code provider adapter. Work continued past #51 on local branches that **never reached a pull request**: `feature/historical-context-retriever-v1` (`9c493f2`, 07-25), `feature/adaptive-decision-engine-v2` (`bc8fbc3`, 07-25), `feature/execution-planner-v1` (`65dda67`, 07-25), `feature/run-history-manager-v1` (`cb15af4`, 07-25), `feature/engineering-memory-v1` (`a9950cc`, 07-25), and `feature/gvams-cli-v1` (`b3827c9`, 07-24). All six branches still exist in this repository's ref list today, dangling — verifiable via `git branch --all --contains <commit>`, `git merge-base --is-ancestor`.

**A forensic detail worth recording precisely:** PR #51 (Reflection Engine v1) genuinely *was* merged into `main` by GitHub — but its merge commit, `d6f1da0`, is **not an ancestor of the current `main`** (`git merge-base --is-ancestor d6f1da0 main` → `NOT ANCESTOR`). The pivot commit `669c1fd`'s sole parent is `b051182` (PR #50's merge commit) — one PR *behind* where GitHub's own merged-PR history says `main` actually was. In other words: at the moment the ORAM rewrite began, whoever authored `669c1fd` branched from a `main` that had not yet caught up to PR #51's merge, and that branch went on to supersede `main` entirely. PR #51's Reflection Engine v1 — and every uncommitted engine on the six dangling branches above — was quietly orphaned, not deleted, not reverted: simply left behind by history moving on. This is why `scripts/reflection-engine.js`, `scripts/adaptive-decision-engine.js`, `scripts/execution-planner.js`, `scripts/historical-context-retriever.js`, `scripts/run-history-manager.js`, and `scripts/engineering-memory.js` are all referenced by name throughout `ORAM_V3_MIGRATION_PLAN.md` (written to describe "current reality") yet do not exist in this repository's working tree today (`ls scripts/*.js` — 39 files, none of those six names present; only `decision-engine.js`, `implementation-executor.js`, `validation-engine.js`, `recommendation-engine.js`, `pull-request-generator.js`, `github-publisher.js`, `repository-intelligence.js`, `engineering-knowledge.js` survive from System A's roster).

This is not a defect in this report's evidence — it is itself the single most concrete piece of evidence *for* the transition's motivation. The team was one PR away from a fully wired fourteen-stage pipeline and chose, deliberately, to set it aside and start over on better foundations rather than finish it. Section 1.2 of the migration plan explicitly instructs the opposite of throwing this work away — "All 14 System A engines' core deterministic logic... carry forward" — and indeed every subsequent ORAM engine's own source comments (see §5, §11) repeatedly cite the corresponding legacy script by name, either as a wrapped dependency (Sprint 1) or as an explicitly-considered-and-rejected alternative ("Deliberately NOT built on `scripts/X.js`... this is a new, repository-agnostic sibling").

### 2.3 The pivot commit

`669c1fd`, *"feat: add ORAM v1 execution runtime and intelligence engines"* (PR #52, merged 2026-07-26T10:14:55Z), is the single commit that constitutes the architectural transition. Its diff introduced, in one shot:

- The `packages/*` npm workspace (`package.json` `"workspaces": ["packages/*"]`).
- `docs/ORAM_SPECIFICATION_v1.md` — the ORAM "technical constitution": Core Philosophy (six numbered principles — determinism-first, human-owns-the-repository, one-Mission-at-a-time, providers-are-interchangeable, evidence-backed claims), Terminology, the four-layer System Layers diagram (Experience / Execution / Intelligence / Core Runtime), the nine-phase Engineering Lifecycle, Runtime Responsibilities, the Provider Contract, and the Event Model.
- `ORAM_V3_MIGRATION_PLAN.md` — the full forensic audit of System A/B (§1 above) and the repository restructure, runtime design, CLI design, provider architecture, dashboard vision, and five-milestone roadmap that every subsequent sprint has, in practice, followed.
- `@oram/runtime`'s foundational set, already internally layered across what its own file comments retroactively label Phase 1 through Phase 4 (see §4): `Lifecycle.ts` (the `CREATED → ... → COMPLETE` state machine), `EventBus.ts`, `ArtifactStore.ts`, `ProviderRegistry.ts`, `Logger.ts`, `RuntimeContext.ts`, `RuntimeBuilder.ts`, `EngineRunner.ts`, `Runtime.ts`, and a `run/` sub-module (`Run`, `RunContext`).
- `@oram/core` — a deliberately tiny package containing only `StepId`/`Workflow` type definitions and one data constant, `ENGINEERING_WORKFLOW`.
- `@oram/events` — the `OramEvent` discriminated union (nine v1 members).
- `@oram/engines`'s first real member: `repository-analyzer`, shipped as **two** parallel implementations — `LegacyRepositoryAnalyzerAdapter` (wrapping the still-untouched, still-real `scripts/repository-intelligence.js` verbatim) and `RepositoryAnalyzerEngine`/`buildRepositoryAnalysis()` (a genuinely new, native TypeScript, repository-agnostic implementation with no `scripts/*.js` dependency at all).
- Four Architecture Decision Records, `docs/adr/0001` through `0003` (0004 followed later, post–Phase 3 — see §7), documenting the `RuntimeBuilder`, `EngineRunner`/`EngineDescriptor`, and `RuntimeContext` designs.

Everything built since — ten more capability sprints, one CLI command per pipeline stage, every engine documented in §5 — is a direct, traceable continuation of the blueprint this single commit laid down.

---

## 3. Timeline

All dates from `git log --pretty=format:"%h|%ad|%s" --date=short` and `gh pr list --state merged`. "PR" is omitted where no PR exists (several sprints in this repository's own working session were committed directly to `main`, or squash-merged into a single, later-dated docs commit — noted explicitly).

| # | Date | Milestone | Result | PR | Major files | Outcome |
|---|---|---|---|---|---|---|
| — | 2026-07-24 09:08 | **Phase 2K completes** | Backlog lifecycle + stale re-selection prevention hardened | #40 | `scripts/agent-backlog-reconcile.js` | Last Phase 2K PR |
| — | 2026-07-24 10:04 | Maintenance note | Docs housekeeping | #39 | `docs/MAINTENANCE_NOTE.md` | — |
| — | 2026-07-24 10:04–15:49 | **System A completion sprint** | Repository Intelligence, Engineering Knowledge, Dashboard, Decision, Implementation Request, Implementation Executor (+Claude adapter), Validation, PR Generator, GitHub Publisher, Autonomous Orchestrator | #41–#50 | `scripts/*.js` (10 files) | Nine of fourteen System A stages wired end to end |
| — | 2026-07-25 10:12 | Reflection Engine v1 | Iteration/retry loop added to Orchestrator | #51 | `scripts/reflection-engine.js` | **Merged, then orphaned by the pivot** (§2.2) |
| — | 2026-07-24–25 (unmerged) | Historical Context, Adaptive Decision v2, Execution Planner, Run History, Engineering Memory, GVAMS CLI v1 | Local branches only | none | `feature/*-v1` branches | **Never merged; dangling today** |
| **Pivot** | 2026-07-26 10:14 | **ORAM v1 Runtime + Intelligence** | `packages/*` workspace; Core Runtime (Phases 1–4 internally); `repository-analyzer` (real, two implementations); ADRs 0001–0003; both specification docs | #52 | `packages/runtime/*`, `packages/core/*`, `packages/events/*`, `packages/engines/src/repository-analyzer/*`, `docs/ORAM_SPECIFICATION_v1.md`, `ORAM_V3_MIGRATION_PLAN.md` | **The architectural transition** |
| Sprint 1 | 2026-07-27 | Engineering Reasoning + CLI demo | `engineering-knowledge`, `engineering-reasoning` real engines; first `oram analyze` demo | none (direct commit `10f9299`) | `packages/engines/src/engineering-{knowledge,reasoning}/*` | Observe→Understand→Reason complete |
| — | 2026-07-27 | Dev-env fix | Restore local `oram analyze` workflow | none (`5ac1560`) | tooling | — |
| Sprint 2 | 2026-07-29 | Engineering Planning | `engineering-planning` engine; `oram plan` | none (`4010366`) | `packages/engines/src/engineering-planning/*`, `packages/cli/src/commands/plan.ts` | Plan phase complete |
| Sprint 4.5 | 2026-08-02 (session) | CLI packaging | Real `bin`/`npm link`, `--help`/`--version`, dispatcher table, friendly errors | folded into #53 | `packages/cli/{package.json,src/index.ts,src/errors.ts}` | `oram` becomes a real installable CLI |
| Sprint 5 | 2026-08-02 (session) | Engineering Missions | `MissionGraph`, `oram missions` | folded into #53 | `packages/engines/src/engineering-missions/*` | Mission dependency graph introduced |
| Sprint 6 | 2026-08-02 (session) | Implementation Requests | `ImplementationRequestSet`, `oram requests` | folded into #53 | `packages/engines/src/implementation-requests/*` | Execution-ready requests |
| Sprint 7 | 2026-08-02 (session) | Execution Planning | `ExecutionPlanSet`, `oram execute-plan` | folded into #53 | `packages/engines/src/execution-planning/*` | Deterministic step templates |
| Sprint 8 | 2026-08-02 (session) | Implementation Executor | `MemoryAdapter`/`RealAdapter`, `oram execute` (supersedes stub) | folded into #53 | `packages/engines/src/implementation-executor/*` | Simulated execution, zero side effects |
| Sprint 9 | 2026-08-02 (session) | Provider Execution | `PromptArtifact`→`LLMResponse`→`PatchArtifact`; `MemoryProvider` | **#53** (squash: "docs: improve Implementation Executor documentation") | `packages/engines/src/provider-execution/*` | First AI-request-shaped (but non-AI) layer |
| Sprint 10 | 2026-08-03 | Validation | Six deterministic patch-structure rules; `ValidationReport` | none (direct commit `afa121c`, later rebased onto `main`) | `packages/engines/src/validation/*` | First stage that inspects patch content |
| Sprint 11 | 2026-08-02–03 | Recommendation | `Recommendation` per `ValidationIssue`; `oram recommend` | **#54** | `packages/engines/src/recommendation/*`, `packages/cli/src/commands/recommend.ts` | Actionable guidance from validation |
| Sprint 12 | 2026-08-03 | Reflection | Batch-level `ReflectionReport`; `oram reflect`; `.gitattributes` fix | **#55** (squash) | `packages/engines/src/reflection/*`, `.gitattributes` | Pipeline reasons about its own output |

**Note on PR #53:** its title, *"docs: improve Implementation Executor documentation,"* undersells its contents — the merge commit `6f9dfbc` (and the local commit `6659913` that preceded the rebase described in §8) actually carries the entire `engineering-missions` → `provider-execution` buildout (Sprints 5–9), five full pipeline stages, committed together and pushed under a documentation-sounding branch name (`docs/implementation-executor-readme`) because that was the active branch at the moment those changes were finally committed. This is disclosed here because a reader relying on PR titles alone would significantly undercount this project's actual PR-#53-era output.

---

## 4. Runtime Evolution

`@oram/runtime`'s own source comments are unusually explicit about its own history, retroactively labeling four internal phases — all of which shipped in the single pivot commit `669c1fd`, meaning "Phase 1" through "Phase 4" describes *design layering*, not separate merges:

### Phase 1 — Interfaces only
Five Core Runtime interfaces defined with exactly one reference implementation each: `EventBus`/`InMemoryEventBus`, `ArtifactStore`/`FileSystemArtifactStore`, `ProviderRegistry`/`InMemoryProviderRegistry`, `Logger`/`BufferedLogger`, `Runtime`/`OramRuntime`. No composition root yet — nothing yet decided *where* these get wired together (ADR 0001, §7).

### Phase 2 — RuntimeBuilder, EngineRunner, RuntimeContext, Lifecycle, placeholder engines
- **`RuntimeBuilder`** (ADR 0001) becomes the one Composition Root: fluent `with*()` overrides (`withEventBus`, `withLogger`, `withArtifactStore`, `withProviderRegistry`), `build()` defaulting anything unsupplied to the v1 reference implementation.
- **`Lifecycle`** (`Lifecycle.ts`) becomes a real, explicit state machine: `CREATED → ANALYZING → PLANNING → AWAITING_APPROVAL → EXECUTING → VALIDATING → REFLECTING → PUBLISHING → COMPLETE`, with `ABORTED` reachable from any non-terminal phase and a `REFLECTING → EXECUTING` retry edge (a design choice directly generalizing System A's `GVAMS_MAX_ITERATIONS` loop into an explicit Lifecycle re-entry rather than an implicit function-local loop).
- **`EngineRunner` + `EngineDescriptor<TOutput>`** (ADR 0002) becomes the one place that "runs one engine: time it, log it, persist its output, publish the event, isolate its failure" — reused for every phase instead of each phase hand-rolling that five-step sequence.
- **`RuntimeContext`** (ADR 0003) becomes the single dependency-injection bag — `{ repositoryRoot, config, logger, eventBus, artifactStore, providerRegistry }` — built once per run by one pure factory function, `createRuntimeContext()`, and threaded explicitly everywhere. `repositoryRoot` always comes from the caller, never from `__dirname` — this field alone is what makes ORAM capable of analyzing a repository other than its own (§2.1's central problem, solved).
- Four **placeholder engines** (`observePlaceholder`, `understandPlaceholder`, `reasonPlaceholder`, `planPlaceholder`) prove `Runtime.start()`'s shape end to end — through a real `EngineRunner`, `FileSystemArtifactStore`, and `InMemoryEventBus` — using simulated (`simulated: true`), structurally-plausible data, before any real engine logic is extracted from `scripts/*.js`.

### Phase 3 — Real engine injection without breaking layering
`PhaseEngineOverrides` (ADR 0002) is added as `OramRuntime`'s optional, additive second constructor parameter — `{ observe?, understand?, reason?, plan? }`, each an `EngineDescriptor<unknown>`. This is how the *real* `repository-analyzer` engine gets substituted for `observePlaceholder()` **without** `Runtime.ts` importing `@oram/engines` — a hard import would invert `docs/ORAM_SPECIFICATION_v1.md` §3's frozen dependency direction (Core Runtime may depend only on layers *below* it; Intelligence sits above it). `RuntimeBuilder.withObserveEngine()` is the fluent seam a caller uses to supply the override. ADR 0002 explicitly rejects three easier-looking alternatives (inline sequencing per phase, letting each Engine call `ArtifactStore`/`EventBus` itself, and a hard `@oram/engines` import) in favor of this Dependency Inversion approach.

### Phase 4 — Declarative workflow (`@oram/core`) and a `Run` object
- `Runtime.start()` stopped hardcoding its own Observe→Understand→Reason→Plan sequence and instead loops over `@oram/core`'s `ENGINEERING_WORKFLOW.steps` — a plain `StepId[]` constant (`["observe", "understand", "reason", "plan"]`). This is the narrow, deliberately-scoped first implementation of ADR 0004's recommendation (§7) — only the declarative-sequence part; no `Stage`/phase-grouping type, no registry, no plugin support, no dynamic workflow selection, all explicitly deferred.
- A `Run` object (`packages/runtime/src/run/run.ts`, `run-context.ts`) is now constructed per run alongside the existing `RunLifecycle`, carrying immutable execution input (`RunContext`: `repositoryRoot` + `workflowId`, deliberately *not* merged with `RuntimeContext`) and a coarse started/finished/status summary, plus every `EngineRunner.run()` call's returned `Artifact<unknown>` (via `Run.addArtifact()`). Neither `Run` nor the `runs` map is exposed on the public `Runtime` interface — purely internal bookkeeping.

### What remains explicitly unimplemented
`approve()` and `RunHandle.wait()` both throw `"not implemented yet"` — both require a real `EXECUTING` phase (a Provider actually being invoked), which the Runtime itself has never been wired to (the pipeline built in §5 runs entirely *outside* the Runtime today — see §11's "CONCRETE LIMITATION" pattern). This is a load-bearing, honestly-disclosed gap, not an oversight: every one of the twelve engines in §5 is invoked directly by its CLI command, never through `Runtime.start()`.

---

## 5. Intelligence Pipeline Evolution

Every sub-package below lives at `packages/engines/src/<name>/`, follows an identical file layout (`analysis/types.ts`, `analysis/build-*.ts` or `analysis/rules.ts`, `<Stage>Engine.ts`, `index.ts`, `<stage>.test.ts`, `__snapshots__/`), and satisfies the same `EngineDescriptor` contract so it can — in principle — be wired into `@oram/runtime` via `PhaseEngineOverrides`/`RuntimeBuilder`, even though today every one is invoked directly by its CLI command instead (§4, §11).

### 5.1 Repository Analysis (Capability Sprint 1, Milestone 1 — pivot commit)
**Why:** the foundation every later stage depends on; the first engine built repository-agnostically from day one. **Input:** a filesystem path. **Output:** `RepositoryAnalysis` — an evidence/confidence-scored shape (each fact carries a `Detection<T>` with a confidence score and supporting evidence), richer than the legacy `repository-analysis.json`. **Two implementations** satisfy the identical `EngineDescriptor` contract: `LegacyRepositoryAnalyzerAdapter` (wraps `scripts/repository-intelligence.js` verbatim, unmodified) and `RepositoryAnalyzerEngine`/`buildRepositoryAnalysis()` (native TypeScript, zero `scripts/*.js` dependency). Either can be wired in as the `observe` engine via `RuntimeBuilder.withObserveEngine()`.

### 5.2 Engineering Knowledge (Capability Sprint 1, Phase 2)
**Why:** turn raw repository facts into engineering *meaning* — subsystems, dependency relationships, an architecture/tech-stack narrative, evidence-based strengths/risks/debt/missing-practice findings. **Input:** `RepositoryAnalysis` only. **Output:** `EngineeringKnowledge`. Deliberately **not** built on `scripts/engineering-knowledge.js` — that legacy script consumes the *legacy* `repository-analysis.json` shape (its `detectedModules`/school-ERP keyword concept), which the new, repository-agnostic `RepositoryAnalysis` simply doesn't produce.

### 5.3 Engineering Reasoning (Capability Sprint 1, Phase 3, MVP)
**Why:** apply fixed, deterministic rules to Knowledge and surface evidence-based Findings — no LLM, no prioritization between Findings (that's Planning's job). **Input:** `EngineeringKnowledge` only (never `RepositoryAnalysis` directly — a discipline every later stage repeats: consume only the *immediately prior* stage's output). **Output:** `Finding[]` via exactly 5 deterministic rules. No legacy-script predecessor exists for this stage at all.

### 5.4 Engineering Planning (Capability Sprint 2)
**Why:** aggregate Findings into actionable Missions. **Input:** `Finding[]`. **Output:** `Mission[]`, each with one `MissionTask` per matching Finding, via exactly 3 deterministic mapping rules. No scheduling/dependency-ordering between Missions yet — that's the next stage's job.

### 5.5 Engineering Missions (Capability Sprint 5)
**Why:** turn a flat `Mission[]` into an executable graph. **Input:** `EngineeringPlan`. **Output:** `MissionGraph` — the same Missions, now carrying `dependencyIds`/`order` plus `MissionDependency` edges and a topological `executionOrder`. Dependency rule: a single linear chain over the plan's own existing Mission order — honestly disclosed as a default, not a discovered real-world dependency (no richer signal exists yet). **Naming note:** this package's own `Mission` (with graph fields) collides in name with `engineering-planning`'s `Mission` — resolved at the top barrel via `export type { Mission as MissionNode }`, disclosed in both files' own header comments.

### 5.6 Implementation Requests (Capability Sprint 6)
**Why:** turn each Mission into an execution-ready specification. **Input:** `MissionGraph`. **Output:** `ImplementationRequestSet`, exactly one `ImplementationRequest` per Mission, carrying Target Subsystems (extracted from `MissionTask` description text via a fixed regex — a disclosed text heuristic, not free-text scraping of uncontrolled prose), Acceptance Criteria, Constraints, Estimated Effort, Expected Impact. `implementationTargets[].files` is always `[]` — never guessed.

### 5.7 Execution Planning (Capability Sprint 7)
**Why:** convert requests into deterministic, ordered step templates. **Input:** `ImplementationRequestSet`. **Output:** `ExecutionPlanSet`, exactly one `ExecutionPlan` per request, each a sequence of `ExecutionStep`s over nine possible `ExecutionAction`s (`CREATE_BRANCH`, `CREATE_FILE`, `MODIFY_FILE`, `DELETE_FILE`, `RUN_TESTS`, `RUN_LINTER`, `RUN_FORMATTER`, `COMMIT`, `OPEN_PULL_REQUEST`). Steps are templates only — **nothing executes** at this stage. Two disclosed limitations inherited from upstream gaps: step content dispatches on `request.title` text (Mission's `kind` was never carried through Sprint 6), and plan dependencies are, again, a linear-chain default.

### 5.8 Implementation Executor (Capability Sprint 8)
**Why:** actually *run* an `ExecutionPlan`'s steps — but only in simulation. **Input:** one `ExecutionPlan`. **Output:** `ExecutionResult` (per-step `ExecutionStepResult`s, an `ExecutionStatus`, logs, and at most one `ExecutionFailure`). Every action dispatches to a `GitAdapter`/`FileAdapter`/`CommandAdapter`, each with two implementations: `MemoryAdapter` (the default — deterministic, zero side effects, always SUCCESS) and `RealAdapter` (every method throws `NotImplementedYetError`, unconditionally, never the default). The only "decision" this engine makes is a fixed rule: stop and skip the rest once one step fails. Deliberately **not** built on the real, functional `scripts/implementation-executor.js` (which has genuine `EXECUTION_APPROVED`-gated Provider execution) — this is a new, non-executing sibling, not a migration.

### 5.9 Provider Execution (Capability Sprint 9)
**Why:** model what an AI-assisted change would look like *without ever making one* — the layer immediately before any real code change could happen. **Input:** one `ExecutionPlan`. **Output:** `ProviderExecutionResult` — per step, a `PromptArtifact` → `Provider.generate()` → `LLMResponse` → `PatchArtifact` (an unparsed, unvalidated container: `unifiedDiff` is the raw response text, verbatim). `MemoryProvider` (default) returns deterministic canned responses keyed off a self-controlled `"Action: X"` prompt-line format; `ClaudeProvider`/`GeminiProvider`/`OpenAIProvider` all throw the *same* `NotImplementedYetError` class reused, read-only, from Sprint 8's `RealAdapter`.

### 5.10 Validation (Capability Sprint 10)
**Why:** the first stage that actually looks at patch *content* — via lightweight, deterministic, plain-text structural checks only (no AST, no compilation, no execution). **Input:** one `PatchArtifact`. **Output:** `ValidationReport` (`passed`, a `score` 0–100, `ValidationIssue[]`). Six rules: empty patch, placeholder diff (detects the literal `PLACEHOLDER` marker `MemoryProvider` itself writes), diff too large (>20,000 chars), missing file headers, invalid (mismatched-count) unified diff header, duplicate hunks. Against real `MemoryProvider` output, every patch is honestly flagged `WARNING` for containing `PLACEHOLDER` — and still `passed: true`, since `passed` only cares about `ERROR`-severity issues. Deliberately **not** built on the real, functional `scripts/validation-engine.js` (which cross-checks `implementation-request.json`/`execution.json`/`patch-summary.json` off disk).

### 5.11 Recommendation (Capability Sprint 11)
**Why:** turn each Validation issue into an actionable, human-readable suggestion. **Input:** a whole `ValidationResult`. **Output:** `RecommendationSet` — exactly one `Recommendation` per `ValidationIssue`, via a fixed `title → template` lookup table (6 known titles + an honest generic fallback). `priority` is carried 1:1 from the source issue's own `severity` — never a separately invented ranking; `confidence` is a fixed number per template. Deliberately **not** built on the real `scripts/recommendation-engine.js` (which reads `engineering-knowledge.json`, a completely different upstream shape).

### 5.12 Reflection (Capability Sprint 12 — current)
**Why:** reason over a *whole batch* of Validation + Recommendation output together — the first stage in this pipeline that does not transform one upstream item into one downstream item, but summarizes an entire run. **Input:** a whole `ValidationResult` **and** a whole `RecommendationSet`. **Output:** one `ReflectionReport` (`findings`, `summary`, `retryRecommended`, `overallScore`, `confidence`). Six fixed rules (`checkValidationClean`, `checkCriticalValidationFailures`, `checkMinorQualityIssues`, `checkLargeIssueVolume`, `checkMultipleRecommendations`, `checkConfidenceReducedByErrors`), each a pure function of a small, precomputed stats object, each firing at most once. `overallScore` starts at 100 and subtracts a fixed amount per finding by severity (`ERROR` 25, `WARNING` 10, `INFO` 2) — notably including the *positive* "Validation clean" finding (itself `INFO`), so a fully clean batch scores 98, never 100, a literal (not accidental) consequence of the spec's own scoring rule. `retryRecommended` is true when Validation contains an `ERROR` issue *or* `overallScore` drops below 80 (deliberately not 70 — with today's 6 rules, the maximum non-error deduction reachable is 22, so a lower threshold would make the score-based half of that OR condition permanently unreachable). Unlike every prior stage, `@oram/events`' `ReflectionCompletedEvent` was a genuine, purpose-built fit (its `retryRecommended` field maps directly) rather than a stretched reuse of `RecommendationsGeneratedEvent`. No legacy `scripts/reflection-engine.js` exists in the current tree (§2.2) — this is a new capability, not a migration, despite the coincidental name match to the orphaned PR #51.

### Pipeline-wide disciplines proven across all twelve stages
- **Identity Preservation:** every emitted object gets a stable id via `makeId(kind, value)` (`repository-analyzer/analysis/identity.ts`) — the same input always produces the same id, verified by an explicit "identity is deterministic" test in every stage's suite.
- **Never guess:** unknown data is always `[]`/`null`/a disclosed fallback, never fabricated (`implementationTargets[].files`, `PatchArtifact.language: "unknown"`, Recommendation's `DEFAULT_TEMPLATE`, Reflection's honest stats-driven summary even when zero rules fire).
- **Naming-collision discipline:** every barrel-export collision (Mission vs Mission, Severity vs ValidationSeverity vs RecommendationSeverity vs ReflectionSeverity) resolved by explicit rename or a deliberately separate type name, never silently shadowed — `export *` would otherwise silently drop a colliding binding.

---

## 6. CLI Evolution

`packages/cli`'s `oram` command supersedes `scripts/gvams-cli.js` entirely (a decision made explicit in `ORAM_V3_MIGRATION_PLAN.md` §1.5). Dispatch is a single flat lookup table (`COMMANDS: Record<string, CommandHandler>`), not a switch statement — chosen specifically to avoid the "long switch statement" anti-pattern, with flag aliases (`--help`/`-h`, `--version`/`-v`) resolved through the same table before the same lookup runs.

| Command | Introduced | Purpose | Real or stub |
|---|---|---|---|
| `init` | pivot (scaffolded) | Fingerprint repo, create `.oram/config.json` | Stub — prints "Not implemented yet." |
| `run` | pivot (scaffolded) | Full pipeline via Runtime | Stub |
| `analyze` | pivot / Sprint 1 | Repository Analysis → Knowledge → Reasoning | **Real** |
| `plan` | Sprint 2 | ...through Engineering Planning | **Real** |
| `missions` | Sprint 5 | ...through Engineering Missions (Mission Graph) | **Real** |
| `requests` | Sprint 6 | ...through Implementation Requests | **Real** |
| `execute-plan` | Sprint 7 | ...through Execution Planning | **Real** |
| `execute` | Sprint 8 (supersedes an earlier heavier-vision stub) | ...through the Implementation Executor | **Real** |
| `recommend` | Sprint 11 | ...through Provider Execution → Validation → Recommendation | **Real** |
| `reflect` | Sprint 12 | ...through Recommendation → Reflection | **Real** |
| `validate` | pivot (scaffolded) | Validate + Reflect against most recent Execute | Stub — unrelated to the `validation` *engine* package (a naming coincidence, explicitly noted) |
| `inspect` / `dashboard` / `doctor` / `replay` | pivot (scaffolded) | Query state / launch dashboard / health check / re-render a past run | All stubs |
| `help` / `version` | Sprint 4.5 | Standard flags | **Real** |

**Example usage** (from `packages/cli/README.md`):
```bash
oram analyze .
oram plan .
oram missions .
oram requests .
oram execute-plan .
oram execute .
oram recommend .
oram reflect .
oram --help
oram --version
```

**Renderer evolution:** every real command's console report is built by a pure function in `packages/cli/src/report/render*.ts`, sharing primitives from `report/shared.ts` — `RULE_DOUBLE`/`RULE_SINGLE` (52-character rules), `renderPipelineDiagram()` (a boxed ASCII flow diagram of every stage up to the current command, literally growing one box per sprint), `renderRepositorySection()`, `renderKnowledgeSection()`, `statLine()` (dot-leader-aligned statistics). Each new command's report is one more section grafted onto the last (`renderRecommendationsReport.ts` added a Recommendations section to `renderExecutionReport.ts`'s shape; `renderReflectionReport.ts` added Findings/Summary/Retry Recommendation/Overall Score/Confidence to that). Every renderer is directly unit-testable (pure function, explicit `elapsedMs` parameter) and has an end-to-end CLI snapshot test comparing full terminal output against a stored `.snap.txt` file.

**User experience improvements over the sprints:** friendly, consistent error handling (`printCliError()` — "Error: ...\nUsage: ..." for every real command) landed in Sprint 4.5, replacing raw stack traces; real `npm link`-able packaging (esbuild bundle, root `bin` field) landed the same sprint, so `oram` became a genuinely installable global command rather than something only reachable via `npx tsx packages/cli/src/bin.ts`.

---

## 7. Architecture Decisions

| ADR | Problem | Decision | Alternatives considered | Benefit | Tradeoff |
|---|---|---|---|---|---|
| **0001** RuntimeBuilder | Nothing decided *where* four Core Runtime dependencies get wired into an `OramRuntime` | One Composition Root, `RuntimeBuilder`, with fluent `with*()` overrides, all optional | (1) `OramRuntime` constructs its own defaults inline; (2) a single factory function with no override seam; (3) a general-purpose DI container | One place decides which concrete class backs which interface; the override seam was proven useful again almost immediately (`withObserveEngine()`) | `build()` must be remembered/updated for every new dependency — no compiler-enforced checklist |
| **0002** EngineRunner | Every legacy engine handles its own timing/logging/output-writing; no single place owns "run one engine" | `EngineRunner` + `EngineDescriptor<TOutput>` generic contract; `PhaseEngineOverrides` as an additive constructor param for real-engine injection | (1) inline the run/log/write/publish sequence per phase; (2) let each Engine call ArtifactStore/EventBus itself; (3) hard-import `@oram/engines` into `Runtime.ts` | Proven twice (synthetic placeholders, then a real legacy-wrapped engine) with identical code; System Layers direction stays true in the source tree, not just on paper | `EngineDescriptor` is duplicated (not yet imported from its eventual home package); only 4 of 9 Lifecycle phases have an override seam |
| **0003** RuntimeContext | Every legacy engine computes its repo root from `__dirname` at module load — a hidden global | One plain, immutable `RuntimeContext` interface, built once per run by a pure factory, threaded explicitly everywhere; `repositoryRoot` always caller-supplied | (1) module-level singletons; (2) one parameter per dependency instead of a bag; (3) a class with methods | This is precisely what let the real `repository-analyzer` receive "which repo" as data instead of an assumption; trivially testable with no module state to reset | `config: unknown` remains untyped pending `@oram/artifacts`; no `runId` on the context (a minor asymmetry with `EngineRunner.run()`'s separate `runId` param) |
| **0004** Pipeline vs. Direct Execution | `start()` is six lines of hardcoded imperative sequencing; `PhaseEngineOverrides` can only *replace* a fixed slot, never add one; `oram analyze` needs a narrower entry point than `start()` can express; the spec promises "Engine plugins" with no mechanism to add one | **Proposed** (architecture review only — no code accompanied this ADR at authoring time): model a `Pipeline` as an ordered list of `Stage`s (DATA), each naming a `LifecyclePhase` and an ordered `EngineDescriptor[]` | (implicit: keep `start()` as hardcoded control flow indefinitely) | Closes two concrete, already-existing gaps without inventing new ones; a `Pipeline` is plain JSON-serializable data — more portable to a standalone `oram` repo | Where should `Pipeline`/`Stage` types live; should a Stage's engines ever run in parallel; should `PhaseEngineOverrides` be deprecated once `withPipeline()` exists — all explicitly left open |

**Later evidence that ADR 0004 was partially adopted:** `Runtime.ts`'s own "PHASE 4 STATUS" comment (§4) confirms the narrow, declarative-sequence-only portion of this proposal *was* implemented — `@oram/core`'s `ENGINEERING_WORKFLOW` — while explicitly noting no `Stage`/phase-grouping type, registry, or plugin support was added. This is a rare, verifiable instance of an architecture review directly producing a scoped, traceable follow-up change (rather than either being ignored or over-implemented).

---

## 8. Git Evolution

**Major feature branches after Phase 2K:** `feature/repository-intelligence-v1` through `feature/reflection-engine-v1` (System A completion, §2.2, PRs #41–#51); six further `feature/*-v1`/`-v2` branches that never merged (§2.2); `feat/oram-runtime-and-intelligence-v1` (the pivot, PR #52); `docs/implementation-executor-readme` (the branch that, despite its name, carried Sprints 5–9's entire engine buildout into PR #53); `feature/sprint-11` (PR #54); `feature/sprint-12` (PR #55, squash-merged, deleted post-merge — the pattern this report's own authoring session used, see below).

**Merged pull requests since Phase 2K:** #39–#55 inclusive — 17 PRs (one of which, #51, was later orphaned from `main`'s ancestry, §2.2).

**Important individual commits (non-PR):**
- `10f9299` "Complete ORAM Engineering Reasoning and CLI demo" — committed directly to `main`, no PR.
- `5ac1560` "fix: restore working local dev environment for `oram analyze`" — direct commit.
- `4010366` "feat: add Engineering Planning engine and oram plan command" — direct commit.
- `afa121c` "feat: add Validation Engine (Capability Sprint 10)" — committed to a local branch, then **rebased** onto `origin/main` after a discovered divergence (see below), pushed directly (no PR).

**A notable repository-hygiene incident, self-corrected within this report's own authoring session:** partway through Sprint 10, the local `main` branch was discovered to be missing all of Sprints 5–9's work — that work existed only on `origin/docs/implementation-executor-readme` (one commit, `6659913`/`6f9dfbc`, ahead of the local `main` tip). The fix was a clean `git merge --ff-only origin/docs/implementation-executor-readme`. Later, before pushing Sprint 10's own work, `main` and `origin/main` were found to have **diverged by exactly one commit each** — `6659913` (local, a direct commit) and `6f9dfbc` (remote, the same content squash-merged via PR #53) were content-identical (`git diff` empty, tree hashes equal) but different commit objects. Resolution: `git rebase origin/main`, which Git's own patch-id detection correctly recognized as "already applied" and silently dropped, replaying only the genuinely new Sprint 10 commit on top — a textbook-clean resolution requiring no manual conflict handling.

**Squash-merge convention (Sprints 11–12):** both of the most recent capability sprints followed an identical, disciplined workflow — commit, push a `feature/sprint-N` branch, open a PR, wait for CI (Vercel preview checks), squash-and-merge, delete the remote branch, fast-forward local `main`, create `feature/sprint-(N+1)`. This is now the repository's de facto standard contribution flow for ORAM capability work, distinct from System A/B's earlier direct-to-main and agent-branch conventions.

**Repository organization changes:** the introduction of `packages/*` as an npm workspace is itself the single largest organizational change in this report's window — before the pivot, all automation lived in `scripts/*.js` (flat, CommonJS, no package boundaries); after, it lives in ten independently-versioned `@oram/*` packages (`core`, `events`, `runtime`, `engines`, `cli`, `artifacts`, `providers`, `sdk`, `plugins`, plus the app-level `README.md`) each with their own `package.json`, `tsconfig.json`, and README. `.gitignore` gained `packages/*/dist/` (Sprint 4.5); `.gitattributes` was introduced for the first time in this repository's history in Sprint 12 (§9, §11).

---

## 9. Testing Evolution

**Test runner:** `node:test` exclusively (`npx tsx --test <files>`) — no Jest, no Mocha, chosen for zero additional dependencies, consistent with this project's broader hand-rolled-over-framework preference (also visible in the CLI's dispatcher, §6).

**Snapshot testing, two tiers:**
1. **Engine-level JSON snapshots** (`packages/engines/src/*/__snapshots__/*.snap.json`) — the full output object for the `concentrated-monorepo` fixture, with timestamps/timestamp-derived ids normalized to `"<normalized>"` before comparison.
2. **CLI-level plain-text snapshots** (`packages/cli/src/report/__snapshots__/*.snap.txt`) — the exact console output for the same fixture, with only the "Execution Time" line regex-normalized.

**Deterministic testing discipline:** every engine's test suite includes an explicit **identity determinism** test — running the same input twice must produce byte-identical ids — a direct consequence of the `makeId(kind, value)` convention (§5) being load-bearing, not incidental.

**Fixture strategy:** a shared `__fixtures__/` directory (originating in `repository-analyzer`, reused by every downstream stage) provides `concentrated-monorepo` (the "richest" fixture — the one that reliably produces non-empty output at every stage) plus four **zero-result** fixtures (`web-app`, `clean-architecture`, `python-fastapi`, `minimal`) — every stage's test suite explicitly verifies "zero in, zero out, never a fabricated result" against all four.

**Smoke tests:** every stage's test suite includes one test that runs the *entire* pipeline up to that stage against **this actual repository** (found via walking up from the test file until `scripts/repository-intelligence.js` is located) — proving the pipeline doesn't crash on real-world input, not just synthetic fixtures.

**Regression discipline example:** Phase 3's Repository Analyzer wrapper was verified byte-for-byte identical to legacy output before being trusted — the same discipline ADR 0004 explicitly proposes reapplying to any future `start()` rewrite (§7).

**Coverage growth (illustrative, not exhaustive):** engines package alone: 2,692 lines of test code across `packages/engines/src/**/*.test.ts` today (25 test files workspace-wide, 17 stored snapshots). Per-sprint test counts recorded in this session's own history: Sprint 9 — 13 tests; Sprint 10 — 17 tests; Sprint 11 — 13 engine + 3 CLI; Sprint 12 — 20 engine + 3 CLI. Full-workspace run at the time of this report: **172 tests, 167 passing.**

**A known, now-partially-fixed test infrastructure issue:** this repository had no `.gitattributes` file for its entire history until Sprint 12. On Windows checkouts (`core.autocrlf=true`), committed `.snap.txt` files were silently rewritten to CRLF, mismatching the LF strings each `renderX.test.ts` produces at runtime — a false failure, not a functional regression, that had quietly affected the `missions`/`requests`/`execute`/`execute-plan`/`recommend` CLI snapshot tests since Sprint 5 without anyone diagnosing the root cause until Sprint 12's "mini contribution" (§11) traced it and added a targeted `text eol=lf` rule for `packages/cli/src/report/__snapshots__/*.snap.txt`, protecting every *future* snapshot (including `reflect`'s own) from the same fate. The five already-affected files were deliberately left unmodified (out of scope for that fix) and remain a known, explicitly-tracked, non-blocking failure class today.

---

## 10. Documentation Evolution

**Root-level:** the original root `README.md` was, per the migration plan itself, "currently 2 bytes — effectively no documentation" (§1.5) at the time of writing; it has since been replaced with real product documentation. `ORAM_V3_MIGRATION_PLAN.md` (§2) is the single most load-bearing planning document in this repository's history — every subsequent architectural decision in this report traces back to one of its ten sections.

**Specification:** `docs/ORAM_SPECIFICATION_v1.md` — the "technical constitution," explicitly *not* marketing copy, defining Core Philosophy, Terminology, System Layers, the nine-phase Engineering Lifecycle, Runtime Responsibilities, Provider Contract, and Event Model, each entry citing the exact legacy script it generalizes from (e.g., "Observe... `repository-intelligence.js`") — grounding every forward-looking claim in something already proven to work.

**Architecture Decision Records:** four ADRs (§7), a format introduced for the first time alongside the pivot — each following an unusually rigorous structure (Context / Decision / Alternatives Considered / Consequences, split Positive vs. Negative/Open) that no prior documentation in this repository used.

**Presentation materials:** `docs/presentation/` (`architecture.md`, `architecture.png`/`.svg`, `demo-script.md`, `README-demo.md`, `teacher-questions.md`) — evidence of at least one external-facing demonstration or review event, predating this report's window but still current.

**Package READMEs:** every `@oram/*` package carries its own `README.md` with a `## Status` section, updated every single sprint with a dated "Capability Sprint N (current)" paragraph — `packages/engines/README.md` is the most actively maintained document in the repository, containing a running per-sub-package table (currently 12 real + several honestly-marked `(future)` rows still pointing at their un-migrated legacy scripts) plus one detailed status paragraph per sprint, each disclosing exact design tradeoffs (e.g., why a given `@oram/events` event type was reused rather than invented, §5.9–5.12).

**Pipeline diagrams:** first appear as literal ASCII box diagrams inside `ORAM_V3_MIGRATION_PLAN.md` §5.1 (the Lifecycle state machine) and grow, sprint over sprint, inside the CLI's own `renderPipelineDiagram()` output (§6) — the diagram a user sees in their terminal running `oram reflect .` today is a direct visual descendant of the ASCII diagram first sketched in the migration plan.

**This document** (`ORAM_PROJECT_EVOLUTION_REPORT.md`) is the first document in this repository attempting a complete, chronological, evidence-correlated narrative spanning the entire post-Phase-2K period — prior documentation is either forward-looking (the migration plan, the spec) or narrowly scoped to one decision (an ADR) or one package (a README).

---

## 11. Problems Solved

| Sprint | Problem | Root cause | Solution | Files changed | Impact |
|---|---|---|---|---|---|
| Pivot | Engines can only ever analyze the repository they live inside | `path.resolve(__dirname, "..")` computed at module load in every legacy engine | `RuntimeContext.repositoryRoot`, always caller-supplied; new engines take a path parameter, never compute one | `packages/runtime/src/RuntimeContext.ts`, `packages/engines/src/repository-analyzer/*` | Repository-independence, the transition's central goal (§2.1), structurally solved for every engine written since |
| Pivot | No single place decides which concrete class backs which Core Runtime interface | Four interfaces, no composition root | `RuntimeBuilder` (ADR 0001) | `packages/runtime/src/RuntimeBuilder.ts` | Every consumer depends on one seam, never a concrete class |
| Pivot | Runtime needed to inject a real engine without inverting System Layers | `@oram/runtime` may not depend on `@oram/engines` | `EngineDescriptor` shape + `PhaseEngineOverrides` (ADR 0002) | `packages/runtime/src/{EngineRunner,Runtime}.ts` | Real engines substitutable with zero frozen-interface changes |
| Sprint 5 | New `Mission` type (with graph fields) collides by name with an existing `Mission` | Two genuinely different concepts, same natural name | Explicit `export type { Mission as MissionNode }` at the barrel, rather than a silent `export *` drop | `packages/engines/src/index.ts` | No ambiguous/silently-broken export anywhere in the barrel |
| Sprint 7 | Step-template dispatch needs `Mission.kind`, which was never carried through Sprint 6 | Upstream data gap discovered mid-design | Dispatch on `request.title` instead — a small, fully-known, fixed set of exact strings | `packages/engines/src/execution-planning/analysis/rules.ts` | Deterministic dispatch preserved without reaching back into a protected upstream package |
| Sprint 8 | CLI wanted `oram execute .`, but that name already belonged to a stub with a different, heavier, future-Provider-gated vision | Naming collision between the demo command needed now and the documented future command | Supersede the stub, explicitly disclose the original vision as a still-pending TODO in the new file's own header | `packages/cli/src/commands/execute.ts` | The original vision is preserved as documentation, not silently discarded |
| Sprint 9 | `RecommendationsGeneratedEvent.topOpportunityId` is typed `number \| null`, but every id in this pipeline is a string | A pre-existing event schema assumption, unmet by the new pipeline | `topOpportunityId: null`, always — reused honestly rather than type-coerced or fabricated | `packages/engines/src/*/​*Engine.ts` (every stage since Sprint 6) | Consistent, honest event emission across six stages despite an imperfect schema fit |
| Session, pre-Sprint-10 | Sprints 5–9's work missing from local `main` | An earlier fast-forward/checkout moved `main` back to a commit predating the squash-merged branch | `git merge --ff-only origin/docs/implementation-executor-readme`, then a clean rebase once a one-commit divergence was separately discovered | (git state only) | No work lost; discovered and fixed before Sprint 10 shipped |
| Sprint 10 | Deciding what "score" means for a patch with only positive/neutral findings | No pre-existing convention | Fixed per-severity deduction table applied uniformly, including the positive "clean" finding — an explicit, literal reading of the spec rather than an invented carve-out | `packages/engines/src/{validation,reflection}/analysis/build-*.ts` | A fully clean batch scores 98, not 100 — surprising but intentional and documented, in both Validation and, later, Reflection |
| Sprint 12 | Five (later, discovered to have grown from four) CLI snapshot tests were failing on this machine for no code-related reason | No `.gitattributes` in this repository's entire history; Windows `core.autocrlf` rewrote committed `.snap.txt` files to CRLF | Added `.gitattributes` forcing `text eol=lf` for `packages/cli/src/report/__snapshots__/*.snap.txt` | `.gitattributes` (new) | Protects every future snapshot from the same bug; the five pre-existing false failures remain, explicitly tracked, not silently hidden |

---

## 12. Remaining Technical Debt

**Known limitations, disclosed in-repository (not inferred):**
- Every `<Stage>Engine.ts`'s `EngineDescriptor` factory recomputes the **entire** upstream pipeline from `context.repositoryRoot` by default, because `EngineDescriptor.run(context)` receives no `runId` and therefore cannot read a prior stage's actual persisted artifact for *this specific run*. Deterministic, so the result is identical, but wasteful — extra CPU on every invocation. A `loadX` override parameter exists on every factory as an escape hatch, but nothing in the CLI uses it (every CLI command also recomputes from scratch, directly, never through `@oram/runtime` at all — see below).
- **The Runtime and the Intelligence pipeline are not actually wired together.** Every real CLI command (`analyze` through `reflect`) calls `@oram/engines`' pure functions directly; none go through `Runtime.start()`, `EngineRunner`, `ArtifactStore`, or `EventBus`. The Runtime's own README states this outright: "This package does not yet call, wrap, or replace `scripts/autonomous-orchestrator.js`... Real engine logic is only ever extracted in Phase 3" — and even Phase 3's real extraction (repository-analyzer) is only provably wired into `Runtime.start()` via a regression test, never via the CLI a user actually runs.
- `Runtime.approve()` and `RunHandle.wait()` are unimplemented — both require a real `EXECUTING` phase, which requires a real Provider, which does not exist (every Provider beyond `MemoryProvider` throws `NotImplementedYetError` unconditionally).
- `RuntimeContext.config` is typed `unknown`, pending `@oram/artifacts` (still README-only) providing a real generated type to check against.
- `EngineDescriptor` (in `@oram/runtime`) and the eventual real `Provider` interface (`ProviderRegistry.ts`) are still minimal shapes duplicated inside `@oram/runtime` rather than imported from their eventual home packages — an intentional, explicitly `TODO`-marked short-term debt.
- Several `@oram/events` event types are reused for stages they don't perfectly fit (`RecommendationsGeneratedEvent` for Missions/Requests/Execution-Planning/Executor/Provider-Execution/Recommendation — six stages sharing one event type never designed for five of them), each occurrence explicitly disclosed in that stage's own `EngineDescriptor` factory comment as a "CONCRETE LIMITATION," never silently glossed over.
- Five CLI snapshot tests fail today purely due to the pre-`.gitattributes` CRLF history (§9, §11) — a known, tracked, non-functional issue, not evidence of a code regression.

**Intentional simplifications:**
- Every "dependency" between Missions/Requests/Execution Plans is a single linear chain over the upstream array's own existing order — explicitly disclosed as an honest default, never a discovered real-world dependency, in three separate sprints (5, 7, and implicitly 6).
- v1 Missions always contain exactly one Work Order (per `docs/ORAM_SPECIFICATION_v1.md`'s own Terminology section) — "a deliberate simplification, not a permanent limitation."
- `MemoryAdapter`/`MemoryProvider` are the only defaults anywhere in the pipeline — real git, real filesystem writes, and real AI calls are all, currently, unconditionally-throwing stubs.

**Deferred work (from `ORAM_V3_MIGRATION_PLAN.md`'s own roadmap, §10, still pending as of this report):**
- Milestone 3 (Provider system): formalize the four-provider contract for real, port `stub`/`claude-code` first, generalize Gemini/OpenHands from System B into the same interface.
- Milestone 4 (Dashboard): `apps/dashboard` does not yet exist in `packages/` or `apps/` — only the deprecated System-A-era prototype (`frontend/src/pages/AutonomousEngineer.js`, itself marked for removal) exists today.
- Milestone 5 (Repository-independent ORAM): G-VAMS has not yet been moved to `examples/g-vams-erp`; ORAM's own source still lives inside the G-VAMS repository, not a standalone one.
- `packages/artifacts`, `packages/providers`, `packages/sdk`, `packages/plugins` are all present as directories (confirmed via `ls packages/`) but contain no `src/` — README-only scaffolding, exactly as `@oram/engines`' own top-of-file comment describes for every not-yet-migrated Engineering Lifecycle phase.
- ADR 0004's `Pipeline`/`Stage` model remains only partially adopted (§4, §7) — no registry, no plugin support, no parallel-stage execution.

---

## 13. Current Architecture

```
+---------------------------------------------------------------+
|  EXPERIENCE                                                    |
|  CLI (packages/cli) . Dashboard (not yet built) . SDK          |
|  (not yet built)                                                |
+---------------------------------------------------------------+
|  EXECUTION                                                      |
|  Providers (stub only -- MemoryProvider/MemoryAdapter) .       |
|  Quality Gates . Publisher (not yet built)                      |
+---------------------------------------------------------------+
|  INTELLIGENCE                                                   |
|  Engines (packages/engines, 12 real sub-packages) .              |
|  Knowledge Store (not yet built)                                 |
+---------------------------------------------------------------+
|  CORE RUNTIME                                                   |
|  Runtime . Lifecycle . EventBus . ArtifactStore .                |
|  ProviderRegistry . Logger (packages/runtime) -- built, but      |
|  not yet actually invoked by the CLI's real commands             |
+---------------------------------------------------------------+
```

**The Intelligence pipeline, as it exists and runs today (every arrow verified working, end to end, against this actual repository as of Sprint 12):**

```
Repository
    |
    v
Repository Analysis        (buildRepositoryAnalysis)
    |
    v
Engineering Knowledge      (buildEngineeringKnowledge)
    |
    v
Engineering Reasoning      (buildEngineeringReasoning)
    |
    v
Engineering Planning       (buildEngineeringPlan)
    |
    v
Engineering Missions       (buildMissionGraph)
    |
    v
Implementation Requests    (buildImplementationRequests)
    |
    v
Execution Planning         (buildExecutionPlans)
    |
    v
Implementation Executor    (executeAll -- MemoryAdapter, simulated)
    |
    v
Provider Execution         (runProviderExecutionAll -- MemoryProvider, simulated)
    |
    v
Validation                 (validateAll -- 6 structural rules)
    |
    v
Recommendation             (buildRecommendationSet -- 1 per ValidationIssue)
    |
    v
Reflection                 (buildReflectionReport -- batch-level, retryRecommended/overallScore/confidence)
```

Every stage above is invoked **directly**, in a straight-line function-call chain, by whichever CLI command runs it (each command re-runs the whole chain from `Repository Analysis` up to its own stage). None of it currently flows through `@oram/runtime`'s `Lifecycle`/`EventBus`/`ArtifactStore` — that integration is real, tested in isolation, and explicitly not yet connected to the pipeline above (§12).

---

## 14. Current Capabilities

**CLI:** ten real commands (`analyze`, `plan`, `missions`, `requests`, `execute-plan`, `execute`, `recommend`, `reflect`, `help`, `version`), each producing a deterministic, human-readable console report; genuinely `npm link`-able as a global `oram` binary.

**Runtime:** a fully-specified, unit-tested Core Runtime layer — Lifecycle state machine, event bus, filesystem-backed artifact store, provider registry, structured logger, a builder-based composition root, and a declarative (if minimal) workflow engine — proven correct in isolation, not yet load-bearing for any user-facing command.

**Engines:** twelve real, deterministic, no-AI Intelligence-layer engines, each independently tested, each following an identical architectural template.

**Pipeline:** an unbroken, twelve-stage analyze→understand→reason→plan→execute→validate→recommend→reflect chain, runnable end to end against any filesystem path via `oram reflect <path>`.

**Provider support:** a formal `Provider` interface (`providers/types.ts` inside `provider-execution`) with one real implementation (`MemoryProvider`, deterministic, zero AI calls) and three unconditionally-stubbed real-provider classes (`Claude`, `Gemini`, `OpenAI`) sharing one `NotImplementedYetError` type.

**Validation:** six deterministic, plain-text structural patch checks, scored and gated (`passed`/`score`), never touching AST or execution.

**Reflection:** batch-level meta-reasoning over an entire Validation + Recommendation run, producing a retry recommendation, an overall score, and a confidence rating — the closest thing this pipeline has today to "should I trust this run."

**Testing:** 172 workspace tests (167 passing; 5 known, tracked, non-functional CRLF artifacts), 17 stored snapshots (JSON at the engine level, plain text at the CLI level), deterministic-identity tests and real-repository smoke tests at every stage.

**Developer workflow:** a documented, repeatable, sprint-numbered contribution cadence (branch → implement → test → document → PR → squash-merge → delete branch → fast-forward `main` → next branch) — demonstrably followed for at least the last two capability sprints (§8).

**Git workflow:** clean feature-branch-per-sprint discipline, squash merges, systematic branch cleanup, and — as of Sprint 12 — a `.gitattributes` safeguard against a real, previously-undiagnosed cross-platform bug class.

---

## 15. Future Roadmap

**Already implemented:**
- The full twelve-stage deterministic Intelligence pipeline (§13).
- The Core Runtime's five responsibilities, in isolation (§4).
- A ten-command CLI, nine of which are real.
- A `Provider` contract shape with one working reference implementation.

**Partially implemented:**
- **Provider architecture** — the contract exists and is exercised by tests, but only one provider (`MemoryProvider`) actually does anything; the three others are deliberate, permanent-until-implemented stubs.
- **Event model** — nine event types are defined and several are actively emitted by `EngineDescriptor.buildEvent()` implementations, but no code anywhere subscribes to them yet (`EventBus` has publishers, no consumers).
- **Pipeline-as-data (ADR 0004)** — only the narrow declarative-sequence portion (`@oram/core`'s `ENGINEERING_WORKFLOW`) shipped; no `Stage`/registry/plugin model yet.
- **Artifact persistence** — `FileSystemArtifactStore` is real and tested, but nothing in the user-facing pipeline (§13) writes through it; every CLI command's output lives only in a terminal, never in `.oram/runs/<id>/`.

**Planned (stated explicitly in `ORAM_V3_MIGRATION_PLAN.md`, not yet started):**
- `packages/gates` (deterministic Quality Gate generalization of System B's four gatekeeper stages).
- `packages/memory` (the unified Knowledge Store, retiring System A's `runs/`+`memory/` and System B's `.agent/`-prefixed files).
- `packages/providers`'s real Claude Code / Gemini CLI / OpenHands / local-model implementations.
- `apps/dashboard`, built against the event bus (deliberately deferred until the event bus has real subscribers to build against).
- Moving G-VAMS itself into `examples/g-vams-erp` as ORAM's first proof of repository-independence.

**Logical future work (inferred from the current architecture, not stated outright anywhere — flagged as inference):**
- Wiring the twelve-stage pipeline in §13 into `@oram/runtime`'s `Lifecycle`/`EngineRunner`/`ArtifactStore`, so a CLI command becomes "call `Runtime.start()`" rather than "call twelve pure functions directly" — the single largest remaining integration gap this report identified (§12).
- A thirteenth stage, **Publish** (Pull Request generation), is the one Engineering Lifecycle phase from `docs/ORAM_SPECIFICATION_v1.md` §4 with no `@oram/engines` counterpart yet, despite a real, functional legacy `scripts/pull-request-generator.js` + `scripts/github-publisher.js` already existing to migrate from — the same "deliberately not built on it" pattern established for Validation/Recommendation/Reflection would apply directly.
- A **Run History** / **Engineering Memory** pair of engines (`@oram/engines/run-history`, `@oram/engines/engineering-memory`), both still marked `(future)` in `packages/engines/README.md`'s own table, are the two remaining rows separating today's twelve-stage pipeline from System A's original fourteen.
- Formal `runId`-aware artifact loading for every `EngineDescriptor`'s default `loadX` parameter, closing the "recompute the entire pipeline every time" limitation disclosed identically in every stage since Sprint 5 (§12).

---

## 16. Statistics

*All figures below are measured directly against the repository at commit `650800c` (2026-08-03) unless noted; "estimated" is used only where the underlying tool itself only approximates (e.g., line counts via `wc -l`).*

| Metric | Value |
|---|---|
| Lines of TypeScript in `packages/` (excl. tests) | ~9,800 (12,505 total incl. tests) |
| Lines of test code in `packages/engines/` alone | 2,692 |
| Lines of TypeScript in `packages/cli/` | 2,021 |
| Lines of TypeScript in `packages/runtime/` | 1,343 |
| npm workspace packages (`packages/*`) | 10 (`core`, `events`, `runtime`, `engines`, `cli`, `artifacts`, `providers`, `sdk`, `plugins`, + root) |
| Packages with real (non-README-only) implementation | 5 (`core`, `events`, `runtime`, `engines`, `cli`) |
| Real `@oram/engines` sub-packages (Intelligence-layer engines) | 12 |
| `(future)`-marked engine rows still pointing at un-migrated legacy scripts | 8 (`historical-context`, `decision`, `execution-planner`\*, `work-order`\*, `run-history`, `engineering-memory`, `pull-request`, `publisher`) — \*two of these are effectively fulfilled under different names (`execution-planning`, `implementation-requests`) |
| Real CLI commands | 10 (`analyze`, `plan`, `missions`, `requests`, `execute-plan`, `execute`, `recommend`, `reflect`, `help`, `version`) |
| Stub/scaffolded CLI commands | 7 (`init`, `run`, `validate`, `inspect`, `dashboard`, `doctor`, `replay`) |
| Test files (`*.test.ts`, workspace-wide) | 25 |
| Total tests (workspace-wide, this session's final run) | 172 (167 passing) |
| Stored snapshots (JSON + plain-text) | 17 |
| Legacy `scripts/*.js` files still present | 39 |
| Merged PRs after Phase 2K (through this report) | 17 (#39–#55) |
| PRs merged but orphaned from `main`'s ancestry | 1 (#51) |
| Feature branches built but never merged | 6 (`historical-context-retriever-v1`, `adaptive-decision-engine-v2`, `execution-planner-v1`, `run-history-manager-v1`, `engineering-memory-v1`, `gvams-cli-v1`) |
| Commits between Phase 2K and current `main` | ~148 |
| Merge commits in that range | ~12 |
| Architecture Decision Records | 4 |
| Documentation files under `docs/` | 20 |
| Days from Phase 2K's last PR to the ORAM pivot | 2 |
| Days from the pivot to this report | 8 |

---

## 17. Final Assessment

**Architecture maturity: High for the Intelligence layer, moderate overall.** The twelve-stage pipeline is genuinely well-architected — layered, deterministic, evidence-traceable, and internally consistent across every one of its twelve independently-built sub-packages. The Core Runtime is equally well-designed in isolation. The gap between them (§12, §13) is the project's single most consequential piece of unfinished business: today's architecture is best described as "two mature systems, not yet joined," rather than one mature system.

**Modularity: Strong.** The `packages/*` workspace boundary, the identical per-engine file template, the `EngineDescriptor` contract, and the disciplined "consume only the immediately-prior stage's output" rule together produce a codebase where a new engineer can predict a new sub-package's shape before opening it.

**Maintainability: Strong, unusually so for a fast-moving research/prototype codebase.** Every disclosed limitation, every rejected alternative, every naming-collision resolution is documented *in the code itself*, not in a separate wiki a future reader would need to find. The ADR discipline (§7) and the sprint-by-sprint README status paragraphs (§10) mean the *why* behind nearly every decision in this report survives independently of this report.

**Scalability: Proven for one dimension (pipeline depth), unproven for others.** Adding a thirteenth stage is now a well-worn, low-risk operation (twelve successful repetitions prove it). Adding a second *kind* of pipeline (ADR 0004's `Pipeline`/`Stage` model), a second real Provider, or genuine multi-repository/multi-run concurrency are all still open questions with no implementation to evaluate.

**Extensibility: Good in design, not yet exercised in practice.** `PhaseEngineOverrides`, `RuntimeBuilder`'s `with*()` seams, and the `EngineDescriptor` contract are all textbook extension points — but as of this report, exactly one real engine (`repository-analyzer`) has ever actually been substituted through them; every other of the twelve engines bypasses the Runtime entirely (§12).

**Testing quality: Strong and consistent.** Every stage ships unit tests, a determinism test, multiple zero-result fixture tests, a real-repository smoke test, and a stored snapshot — a template applied without exception across all twelve engines. The one weak point (§9, §11) is a cross-platform line-ending issue that went undiagnosed for seven sprints before being correctly traced and fixed in an eighth — itself a reasonable data point on this team's debugging discipline once the right question was finally asked.

**Repository organization: Good, with honest visible seams.** The coexistence of a modern `packages/*` workspace, 39 legacy `scripts/*.js` files, an entire `.github/workflows/`-based second automation system (System B), and multiple pre-Phase-2K `PHASE_2C2_*.md` documents in `docs/` is not tidy — but it is *honestly* untidy: nothing pretends the legacy system doesn't exist, and every new engine's own header comment states plainly whether or how it relates to what came before.

**Developer experience: Strong for contributors working within the established pattern; moderate for anyone arriving cold.** The per-sprint cadence, consistent file templates, and rich in-code documentation make the *next* sprint easy. A newcomer, however, must reconcile the migration plan's forward-looking claims (§2.3), the specification's constitutional language, twelve engines' worth of ADR-adjacent disclosures, and the still-visible legacy system before the shape of "what ORAM actually does today" becomes clear — this report exists specifically to shorten that path.

**Overall engineering maturity: A deliberately-paced, evidence-disciplined rewrite, roughly 40% of the way to its own stated destination.** The project has proven, twelve times over, that it can add one more deterministic pipeline stage cleanly, safely, and with full test coverage. It has not yet proven it can close the Runtime/Pipeline integration gap, ship a real (non-stub) Provider, or survive contact with a second target repository. Both the maturity and the honesty about what remains are, themselves, load-bearing evidence for this final judgment — a codebase this consistently willing to document its own gaps is one where "40% of the way there" is a credible, trustworthy number rather than an optimistic guess.

---

*This report is a point-in-time forensic reconstruction as of commit `650800c` on `main` (2026-08-03), authored from repository evidence during the same working session that produced Capability Sprint 12. It was not committed to the repository automatically — see the accompanying message for next steps.*
