# ORAM v3 Migration Plan

**ORAM — Orchestrated Repository Autonomous Manager**

Status: planning document. No code is changed by this document. Every claim below about "what exists today" is verified against the actual files in this repository as of this writing, not against aspirational documentation.

---

## 1. Current Reality

### 1.1 What currently exists

Two independent automation systems live in this one repository, alongside the G-VAMS ERP application itself (`frontend/`, `backend/`) which they were both bootstrapped inside of.

**System A — the deterministic engineering pipeline** (`scripts/autonomous-orchestrator.js` conducting 14 stages):

| Stage | File | Status |
|---|---|---|
| Repository Intelligence | `scripts/repository-intelligence.js` | Implemented, tested |
| Engineering Knowledge | `scripts/engineering-knowledge.js` | Implemented, tested |
| Historical Context Retriever | `scripts/historical-context-retriever.js` | Implemented, tested |
| Recommendation Engine | `scripts/recommendation-engine.js` | Implemented, tested |
| Adaptive Decision Engine (v2) | `scripts/adaptive-decision-engine.js` | Implemented, tested |
| Execution Planner | `scripts/execution-planner.js` | Implemented, tested |
| Implementation Request Engine | `scripts/implementation-request-engine.js` | Implemented, tested |
| Implementation Executor | `scripts/implementation-executor.js` | Implemented, but its only default provider (`stub-deterministic-v1`) never touches disk |
| Validation Engine | `scripts/validation-engine.js` | Implemented, tested |
| Reflection Engine | `scripts/reflection-engine.js` | Implemented, tested |
| Run History Manager | `scripts/run-history-manager.js` | Implemented, tested |
| Engineering Memory | `scripts/engineering-memory.js` | Implemented, tested |
| Pull Request Generator | `scripts/pull-request-generator.js` | Implemented, tested |
| GitHub Publisher Adapter | `scripts/github-publisher.js` + `publisher/github/client.js` | Implemented, tested, but never exercised outside dry-run in this repo |

Every stage is real: real logic, real `node:test` coverage, real JSON artifacts, verified against this actual repository's data. This is System A's core strength and the part of ORAM v3 with the least rework risk.

**System B — the GitHub Actions autonomous agent** (`.github/workflows/autonomous-evolution.yml` conducting a separate cycle):

| Component | File | Status |
|---|---|---|
| Context builder | `scripts/autonomous-agent-context.js` | Implemented, real |
| Gatekeeper (Input/Decision/Diff/Result gates) | `scripts/agent-gatekeeper.js` | Implemented, tested, real |
| Runtime Adapter (Gemini decision + OpenHands implementation) | `scripts/agent-runtime-adapter.js` | Implemented, real, gated behind manual activation (`AGENT_RUNTIME_MODE=openhands`, off by default and forced off on schedule) |
| Branch Publish | `scripts/agent-branch-publish.js` | Implemented, tested, real (invoked directly by the workflow) |
| Backlog Reconcile | `scripts/agent-backlog-reconcile.js` | Implemented, tested, real (its own workflow, `agent-backlog-reconcile.yml`) |
| Agent Cycle | `scripts/agent-cycle.js` | **Written, but dead code** — see 1.4 |

System B has produced one verified, real, human-merged pull request (`PR #38`, merge commit `777af5a6c...`), proving the Gemini-decision + OpenHands-implementation path genuinely works end to end when manually activated.

### 1.2 Which parts are implemented (high confidence, carry forward)

- All 14 System A engines' core deterministic logic (file walking, rule matching, scoring, artifact I/O).
- System B's four real gates in `agent-gatekeeper.js` (schema validation, scope enforcement, secret scanning, diff budget).
- System B's real Gemini decision call and real OpenHands subprocess invocation.
- The Provider Adapter pattern already prototyped in `implementation-executor.js` (a `PROVIDERS` registry + `normalizeProviderResult()` translating a provider-specific shape into one fixed contract) — this is the single most important piece of prior art for Section 7 below. It should be generalized, not reinvented.
- The "artifact chain" pattern itself: every System A stage reads exactly the upstream JSON it needs and writes exactly one JSON + one Markdown pair. This contract-per-stage discipline is worth preserving structurally in the new runtime, even though the physical file layout changes.

### 1.3 Which parts are duplicated

ORAM v3 exists specifically to remove these four duplications:

1. **Two decision engines.** `scripts/decision-engine.js` (v1, frozen) and `scripts/adaptive-decision-engine.js` (v2, the one actually wired into the pipeline) both exist. v2 was forced to also emit v1's exact output shape (`buildCompatDecision()`) purely so six unrelated test fixtures that still spawn `decision-engine.js` directly wouldn't break. This is technical debt from incremental delivery, not a design decision — v3 should have exactly one decision component.
2. **Two "provider" abstractions.** System A has `PROVIDERS` in `implementation-executor.js` (`stub-deterministic-v1`, lazily-loaded `claude-code-v1`). System B has its own, differently-shaped `runtime_mode` concept in `agent-runtime-adapter.js` (`disabled` / `openhands`, with Gemini hard-wired as the decision half). These do not share an interface, a config schema, or a result contract. A "Provider" in ORAM must mean one thing.
3. **Two "memory" subsystems.** System A has `runs/RUN-NNNNNN/` (Run History Manager) + `memory/engineering-memory.json` (Engineering Memory) — structured JSON, one file format. System B has `.agent/DEVELOPMENT_MEMORY.md` (prose) + `.agent/DAILY_DECISIONS.json` (a different JSON schema) — and, as documented in 1.4, this second one isn't even being written to in practice. Two systems trying to answer the same question ("what has this automation done before, and what worked?") in two incompatible formats.
4. **Two Git-publishing implementations.** System A has `publisher/github/client.js` (`createBranch`/`commitChanges`/`pushBranch`/`createDraftPullRequest`, dry-run by default). System B has `agent-branch-publish.js` plus inline `git`/`gh` shell commands directly in the workflow YAML. Both solve "open a PR for an autonomous change" independently.

### 1.4 Which parts are experimental / not to be trusted as-is

- **`providers/claude/adapter.js` (`claude-code-v1`).** Real code, but never the default provider, never invoked by any CI workflow, and there is no evidence in this repository of it ever running against a real `claude` binary. Treat as a prototype, not a shipped integration.
- **OpenHands / Gemini activation in System B.** Real and has run once successfully, but only via manual, human-triggered `workflow_dispatch` with hand-set repository variables — not a standing, always-on capability. `.agent/README.md` itself is stale on this point (it still says "the only implemented mode is disabled," which was true in an earlier phase but is no longer accurate).
- **`scripts/agent-cycle.js` is dead code today.** It contains the only code that appends to `DEVELOPMENT_MEMORY.md` and `DAILY_DECISIONS.json` (`appendMemory()`, `updateDecisions()`), but the real workflow never calls this script — it only runs `node --check` against it for a syntax check, then inlines equivalent-but-separate logic directly in YAML. Proof: the one real merged cycle's commit (`777af5a6c...`) never touched either memory file; `DAILY_DECISIONS.json` still reads `"cycles": []` today. This script has zero test coverage and should not be assumed to work — verify or rewrite it during unification, don't just relocate it.
- **Historical Context Retriever's similarity scoring** is functionally correct but has had almost no real run history to prove itself against (Jaccard overlap across single-digit numbers of archived runs). Keep the algorithm, but don't present it in ORAM's marketing as "battle-tested."
- **The Autonomous Engineer Dashboard** (`frontend/src/pages/AutonomousEngineer.js`) visualizes only 3 of the 14 System A stages (Repository Intelligence, Engineering Knowledge, Recommendations) and nothing from System B. It is an early prototype of the idea in Section 8, not a dashboard to extend incrementally.

### 1.5 Which parts should be deprecated

| File | Reason | Disposition |
|---|---|---|
| `scripts/decision-engine.js` | Superseded by Adaptive Decision Engine; kept alive only for test fixtures | Delete once fixtures are migrated (Milestone 0) |
| `scripts/agent-cycle.js` | Dead code, zero test coverage, not invoked in production | Delete or fully rewrite as part of unification — do not port forward as-is |
| `scripts/gvams-cli.js` | Thin router with no command parity to the real pipeline (no plan/validate/inspect/replay); tied to the old "GVAMS" name | Superseded entirely by the new `oram` CLI (Section 6) |
| `frontend/src/pages/AutonomousEngineer.js` + `frontend/src/components/autonomousEngineer/*` + `frontend/scripts/sync-autonomous-data.js` | Partial, static-file-copy prototype; wrong app entirely (lives inside the target repo's own frontend) | Superseded by `apps/dashboard` (Section 8); do not extend in place |
| `.agent/` directory as a whole | An entire parallel state/config system specific to System B and to this one target repo | Its *concepts* (constitution/rules, protected paths, backlog) migrate into ORAM's runtime config; the directory itself does not belong inside a repo-agnostic tool |
| Root `README.md` | Currently 2 bytes — effectively no documentation | Replaced by real product docs under `docs/` (Section 3) |
| `.agent/README.md` | Stale (describes a superseded phase) | Delete once its accurate content is merged into new docs |

---

## 2. Product Vision

ORAM is not a chatbot, not a coding assistant, and not an AI wrapper. **ORAM is an Engineering Operating System**: a persistent runtime a developer installs once and points at any Git repository, which then runs a repeatable, auditable engineering workflow — analyze, plan, propose, execute (via a pluggable provider), validate, and open a pull request — while keeping a human as the sole authority over what actually merges.

The distinction that matters: a chatbot answers questions in a session and forgets. A coding assistant executes one instruction at a time inside an editor. **ORAM runs a standing pipeline against a repository's real state, remembers every run it has ever made against that repository, and treats "propose a change" as a first-class, inspectable, replayable artifact** — not a transient conversation.

### User journey, install to PR

1. `npm install -g oram` — one global install, no repo-specific setup required yet.
2. `oram init` (run inside any git repo) — ORAM fingerprints the repository, creates a local `.oram/` state directory (config + artifact cache), and asks which provider(s) are available (Claude Code, Gemini CLI, OpenHands, a local model, or "analysis only, no execution").
3. `oram run` — the full pipeline executes: repository analysis → engineering knowledge → historical context → recommendations → decision → execution plan → a **Work Order** (the renamed, provider-agnostic successor to `implementation-request.json`).
4. ORAM pauses at the human-approval gate exactly like today's `EXECUTION_APPROVED` gate, but through a real CLI prompt/dashboard action instead of an environment variable a user has to know to set.
5. On approval, the selected **Provider** executes the Work Order (a real code change, not a stub) — via Claude Code, Gemini CLI, OpenHands, or a local model, all behind one interface.
6. Validation runs deterministically against the actual diff the provider produced.
7. If approved, ORAM opens a **draft pull request** through one unified Git/GitHub publishing path (dry-run by default, exactly like today, but a single implementation instead of two).
8. The developer reviews and merges the PR the same way they would review any colleague's PR — ORAM never merges its own work.

Every step above produces an inspectable JSON+Markdown artifact, replayable via `oram replay`, and visible in `oram dashboard` — this is what "Engineering Operating System" means in practice: the system's own history is a first-class product surface, not a debugging side effect.

---

## 3. Repository Restructure

```
oram/                                  (the ORAM product's own repository — separate from any target repo)
├── packages/
│   ├── runtime/                       # the ORAM Runtime (Section 5) — lifecycle, event bus, artifact store
│   │   └── src/
│   │       ├── orchestrator.ts        # successor to scripts/autonomous-orchestrator.js
│   │       ├── lifecycle/
│   │       ├── events/
│   │       └── artifacts/
│   │
│   ├── engines/                       # the 14 deterministic System A stages, one sub-package per stage
│   │   └── src/
│   │       ├── repository-intelligence/   # from scripts/repository-intelligence.js
│   │       ├── engineering-knowledge/     # from scripts/engineering-knowledge.js
│   │       ├── historical-context/        # from scripts/historical-context-retriever.js
│   │       ├── recommendation/            # from scripts/recommendation-engine.js
│   │       ├── decision/                  # from scripts/adaptive-decision-engine.js (decision-engine.js retired)
│   │       ├── execution-planner/         # from scripts/execution-planner.js
│   │       ├── work-order/                # from scripts/implementation-request-engine.js (renamed concept)
│   │       ├── validation/                # from scripts/validation-engine.js
│   │       ├── reflection/                # from scripts/reflection-engine.js
│   │       ├── run-history/               # from scripts/run-history-manager.js
│   │       ├── engineering-memory/        # from scripts/engineering-memory.js
│   │       ├── pull-request/              # from scripts/pull-request-generator.js
│   │       └── publisher/                 # unifies scripts/github-publisher.js + publisher/github/client.js
│   │                                       #   + System B's agent-branch-publish.js into ONE Git publishing path
│   │
│   ├── providers/                     # the Provider Architecture (Section 7)
│   │   └── src/
│   │       ├── contract/              # the shared Provider interface + result schema
│   │       ├── stub/                  # today's stub-deterministic-v1 — kept for tests/demos, clearly labeled
│   │       ├── claude-code/            # from providers/claude/adapter.js + parser.js + prompt-builder.js
│   │       ├── gemini-cli/             # new — generalized from agent-runtime-adapter.js's Gemini call
│   │       ├── openhands/              # generalized from agent-runtime-adapter.js's OpenHands invocation
│   │       └── local-model/            # new — Ollama/local inference target
│   │
│   ├── gates/                         # System B's deterministic safety gates, generalized and repo-agnostic
│   │   └── src/
│   │       ├── input-gate/             # from agent-gatekeeper.js "input"
│   │       ├── decision-gate/          # from agent-gatekeeper.js "decision"
│   │       ├── diff-gate/              # from agent-gatekeeper.js "diff"
│   │       └── result-gate/            # from agent-gatekeeper.js "result"
│   │
│   ├── memory/                        # the ONE unified memory subsystem (retires the two duplicated ones)
│   │   └── src/
│   │       ├── run-log/                # structured run history (successor to runs/ + DAILY_DECISIONS.json)
│   │       └── engineering-memory/     # aggregated learnings (successor to memory/engineering-memory.json
│   │                                    #   + DEVELOPMENT_MEMORY.md, now one schema, one writer)
│   │
│   ├── cli/                           # the `oram` command (Section 6) — supersedes scripts/gvams-cli.js
│   │   └── src/commands/
│   │       ├── init.ts / run.ts / analyze.ts / plan.ts / execute.ts
│   │       └── validate.ts / inspect.ts / dashboard.ts / doctor.ts / replay.ts
│   │
│   ├── sdk/                           # programmatic API for embedding ORAM outside the CLI
│   │   └── src/                       #   (e.g. a future GitHub App, VS Code extension, CI action)
│   │
│   └── artifacts/                     # typed schemas + (de)serializers for every artifact ORAM produces
│       └── src/schemas/               #   repository-analysis, engineering-knowledge, recommendations,
│                                       #   decision, execution-plan, work-order, execution-result,
│                                       #   validation-result, reflection-report, pull-request, publish-result
│
├── apps/
│   └── dashboard/                     # the real dashboard app (Section 8) — replaces the prototype entirely
│       └── src/
│
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── providers.md
│   ├── cli-reference.md
│   └── migration/                     # this plan and its successors live here long-term
│
└── examples/
    └── g-vams-erp/                    # G-VAMS itself becomes ORAM's first EXAMPLE target repository —
                                        #   it is demoted from "the repo ORAM lives inside" to "a repo
                                        #   ORAM can be pointed at," proving repo-independence from day one
```

**The single most important structural decision in this section:** ORAM's own source code must stop living inside the G-VAMS repository. Today, `path.resolve(__dirname, "..")` in nearly every engine assumes "the repo root is one directory above `scripts/`" — i.e., every engine assumes it *is* the repository it's analyzing. That assumption is the actual architectural blocker to "point ORAM at any Git repository," more than any missing feature. Section 5 designs the runtime change that removes it; this section's job is to make sure the *repository layout* stops reinforcing the assumption too.

---

## 4. System Unification

### 4.1 Reusable components (carry forward, adapt interface only)

- All 14 System A engines' internal logic — the *rules* (module detection keywords, scoring formulas, validation rules, retry logic) are good and proven; only their I/O (hardcoded relative paths, `fs` calls against a fixed repo root) needs to become runtime-injected instead of module-scope-computed.
- `agent-gatekeeper.js`'s four gate functions — genuinely reusable as-is, just generalized to not assume `.agent/`-specific paths.
- The Provider Adapter pattern from `implementation-executor.js` (`PROVIDERS` registry, `normalizeProviderResult()`) — this becomes the template for Section 7's formal interface.
- `publisher/github/client.js`'s four Git operations (`createBranch`/`commitChanges`/`pushBranch`/`createDraftPullRequest`) — this becomes the ONE Git publishing implementation; `agent-branch-publish.js`'s logic is reconciled into it rather than kept parallel.

### 4.2 Duplicated logic to collapse (see 1.3 for full detail)

| Duplication | Resolution |
|---|---|
| `decision-engine.js` vs `adaptive-decision-engine.js` | Keep only the adaptive one; migrate the six dependent test fixtures to use it directly |
| Two provider concepts (`PROVIDERS` registry vs `runtime_mode`) | One `packages/providers` contract (Section 7); Gemini and OpenHands become providers behind it, not a separate code path |
| Two memory systems (`runs/`+`memory/` vs `.agent/DEVELOPMENT_MEMORY.md`+`DAILY_DECISIONS.json`) | One `packages/memory` schema and writer; retire the Markdown-prose format in favor of structured JSON with a rendered Markdown *view*, not a separate source of truth |
| Two Git-publishing paths (`publisher/github/client.js` vs `agent-branch-publish.js` + inline YAML) | One `engines/publisher` package; CI workflows call it the same way the CLI does |

### 4.3 Obsolete files (delete, not migrate)

`scripts/decision-engine.js`, `scripts/decision-engine.test.js` (after fixture migration), `scripts/agent-cycle.js` (no test to migrate — rewrite fresh if the lifecycle concept is still wanted), `scripts/gvams-cli.js`, `frontend/src/pages/AutonomousEngineer.js` and its component tree, `frontend/scripts/sync-autonomous-data.js`, `.agent/README.md`.

### 4.4 Migration order

1. **Freeze System A's engine logic; extract its pure functions** (no I/O) into `packages/engines/*/src/logic.ts`, leaving path/env resolution behind temporarily as thin adapters. This is the lowest-risk first move — it changes nothing observable.
2. **Build `packages/artifacts`** (typed schemas for every JSON shape already in production) — this makes every subsequent step type-checked instead of shape-guessed.
3. **Build `packages/runtime`'s orchestrator** around the extracted engine logic, replacing `spawnSync` subprocess chaining with in-process calls through the new event bus (Section 5) — this is where "repo root" becomes a runtime parameter instead of a `path.resolve(__dirname, "..")` constant.
4. **Build `packages/providers`'s contract**, port `stub-deterministic-v1` and `claude-code-v1` into it first (lowest risk, no live external dependency required for the stub), then generalize System B's Gemini/OpenHands calls into the same contract.
5. **Retire `decision-engine.js`** once its fixtures point at the adaptive engine directly.
6. **Unify the publishing path and the memory subsystem** (4.2) — these are the two riskiest merges since they touch CI-facing behavior; do them only after 1-4 are stable and tested.
7. **Build the CLI** (`packages/cli`) as the new front door, then delete `gvams-cli.js` and the old `.agent/`-specific scripts once the CLI's `oram doctor` can prove parity.
8. **Build the dashboard app** last, once the runtime emits the events it needs (Section 5) — building it earlier against today's flat JSON files would just recreate today's 3-of-14-stage prototype.

---

## 5. Runtime Design

The ORAM Runtime is the one long-lived process/library that every other package depends on. It owns five responsibilities:

### 5.1 Lifecycle

A run is an explicit state machine, not an implicit sequence of subprocess exit codes:

```
CREATED → ANALYZING → PLANNING → AWAITING_APPROVAL → EXECUTING → VALIDATING → REFLECTING → PUBLISHING → COMPLETE
                                        │                                          │
                                        └──────────────► ABORTED ◄─────────────────┘
```

This directly generalizes `runOrchestration()`'s existing stage sequence (today: Repository Intelligence → ... → GitHub Publisher, with a hardcoded loop around Executor/Validation/Reflection) — the phases are the same real phases already proven in System A; what changes is that the runtime *owns* the state explicitly (queryable via `oram inspect`) instead of it living only inside one function's local variables until a `run.json` is written at the very end.

### 5.2 Provider loading

At `ANALYZING`/`PLANNING` time, no provider is needed (these stages are and remain deterministic, non-AI — this is a product promise worth keeping, not just an implementation detail). At `EXECUTING` time, the runtime resolves a provider by capability negotiation: it asks the configured provider "can you implement a Work Order with these constraints?" before committing to it, rather than today's fail-closed-on-unknown-name lookup (`resolveProvider()` in `implementation-executor.js`) — that fail-closed behavior is kept as the *fallback*, but capability negotiation is added so `oram run` can say "Claude Code isn't configured, falling back to Gemini CLI" instead of just erroring.

### 5.3 Event dispatch

Every stage transition, every artifact write, every gate decision emits a typed event on an in-process event bus (`RunStarted`, `StageEntered`, `ArtifactWritten`, `GateEvaluated`, `ProviderInvoked`, `ProviderResultReceived`, `RunCompleted`). This is the single architectural addition that makes the dashboard (Section 8) and `oram inspect`/`oram replay` (Section 6) possible without polling files on disk — today's orchestrator has no equivalent; its only "event" is a captured stdout string per stage.

### 5.4 Artifact management

Every artifact (today: 28 known JSON/MD files scattered across 14 gitignored top-level directories) becomes a versioned, run-scoped record: `~/.oram/runs/<run-id>/<stage>.json`, with the *current* target repo's own working tree completely untouched by intermediate artifacts (today, `repository-intelligence/`, `decision/`, `execution-plan/`, etc. all live inside the analyzed repo itself, requiring 14 separate `.gitignore` entries). This is what makes `oram replay <run-id>` meaningful: replaying a run should never depend on the target repo still being in the exact state it was analyzed in.

### 5.5 Logging

Structured, per-run, per-stage logs (today: `stdout`/`stderr` are captured as truncated strings inside `run.json` — a reasonable start, kept as the schema's foundation) — extended so every log line carries a stage id and timestamp usable by both `oram run`'s live terminal output and the dashboard's Logs panel from the same underlying stream.

### 5.6 Execution

The actual "run a provider against a Work Order" responsibility — directly generalizing `invokeProvider()`'s existing isolation guarantee (a provider throwing can never crash the runtime; it becomes a normalized `failure` result) — this guarantee is exactly right today and should be preserved verbatim, not redesigned.

---

## 6. CLI Design

| Command | Purpose | Inputs | Outputs |
|---|---|---|---|
| `oram init` | Fingerprint the current repo, create `.oram/config.json`, detect/configure available providers | Interactive prompts (or `--yes` for defaults) | `.oram/config.json`, a printed summary of detected language/stack (reusing Repository Intelligence's own detectors as a preview) |
| `oram run` | Execute the full pipeline end to end, pausing at the approval gate | Optional `--provider`, `--goal`, `--max-iterations` (direct successors to today's `EXECUTION_PROVIDER`/`GVAMS_GOAL`/`GVAMS_MAX_ITERATIONS` env vars) | A run id; live stage-by-stage terminal output; artifacts under `~/.oram/runs/<id>/` |
| `oram analyze` | Run only Repository Intelligence + Engineering Knowledge + Historical Context (read-only, no provider needed) | none required | Repository/engineering-knowledge/historical-context reports, human-readable in the terminal |
| `oram plan` | Run Recommendation → Decision → Execution Planner, stop before any Work Order is created | Optional `--recommendation <id>` to force a selection | An execution plan, printable and diffable |
| `oram execute` | Run the previously-planned Work Order through the configured provider | Requires an existing plan from `oram plan`/`oram run`; `--approve` flag replaces today's `EXECUTION_APPROVED=true` env var with a real, auditable CLI flag | Execution result + patch summary |
| `oram validate` | Run Validation (+ Reflection) against the most recent execution | none required beyond an existing execution result | Validation report; retry recommendation if rejected |
| `oram inspect` | Query the state of a run: current stage, event history, any artifact's contents | `<run-id>` (defaults to latest) | Formatted state/event/artifact view — this is what makes the Section 5 event bus visible without a UI |
| `oram dashboard` | Launch the local dashboard app (Section 8) against `.oram/` state | Optional `--port` | Opens a browser to the running dashboard |
| `oram doctor` | Verify installation health: are required providers reachable, is git/gh available, is the repo a valid target | none | Pass/fail checklist — direct successor to `gvams-cli.js`'s existing `runDoctor()`, generalized beyond just checking that script files exist |
| `oram replay` | Re-render a past run's full report from its archived artifacts, without re-executing anything | `<run-id>` | The same report `oram inspect` would show live, reconstructed purely from storage — proving Section 5.4's artifact durability |

No command requires the user to know `scripts/autonomous-orchestrator.js` exists — every one of the above is implemented as a thin wrapper calling into `packages/runtime` and `packages/engines`, never spawning a script by file path.

---

## 7. Provider Architecture

### 7.1 The contract

A Provider implements a small, capability-based interface — direct generalization of today's `stubProviderAdapter(request) => rawResult` / `normalizeProviderResult(raw) => normalized` pair in `implementation-executor.js`, which already proves the right shape (a provider returns *its own* raw shape, translated by one shared normalizer — this is kept, not replaced):

```ts
interface Provider {
  readonly id: string;                    // "claude-code" | "gemini-cli" | "openhands" | "local-model" | "stub"
  capabilities(): ProviderCapabilities;    // { canImplement, canDecide, canValidate, requiresApproval }
  implement(workOrder: WorkOrder): Promise<ProviderResult>;   // the only method every provider must have
  decide?(context: DecisionContext): Promise<DecisionResult>; // optional — only Gemini-style providers implement this
}
```

The `ProviderResult` shape is exactly today's normalized execution contract (`status`, `modifiedFiles`, `testsExecuted`, `testsPassed`, `warnings`, `errors`, `executionSummary`, `providerEvidence`) — this schema has already proven itself across a stub and a real Claude Code adapter; it does not need to change, only to be formally shared via `packages/artifacts` instead of redefined per-provider.

### 7.2 Decoupling from planners

Planners (`packages/engines/execution-planner`, `packages/engines/work-order`) never import a provider. They produce a `WorkOrder` — a plain data object — and the *runtime* is the only thing that both knows which provider is configured and knows how to hand a `WorkOrder` to it. This is exactly today's separation between `implementation-request-engine.js` (never imports a provider) and `implementation-executor.js` (the only file that does) — the discipline already exists in System A and should be named and enforced explicitly, not reinvented.

### 7.3 The four providers

| Provider | Generalizes from | Notes |
|---|---|---|
| **Claude Code** | `providers/claude/adapter.js` + `parser.js` + `prompt-builder.js` | Already shaped correctly (subprocess + stdin prompt + marker-delimited JSON result block); needs a real, tested execution before ORAM claims it as supported, not just present |
| **Gemini CLI** | `agent-runtime-adapter.js`'s `directGeminiDecision()` | Currently hard-coded as System B's *decision* half only; generalize so Gemini can also serve as an `implement()` provider for teams without OpenHands access |
| **OpenHands** | `agent-runtime-adapter.js`'s `openhandsImplementation()` | Already the most proven real path (one successful merged PR); port its safety machinery (delta budget, lockfile-churn restoration) into the shared provider contract rather than leaving it OpenHands-specific |
| **Local Models** | New | An Ollama-style local inference target for teams that can't send code to a hosted API — same `implement()` contract, no decision-half required |

The `stub` provider is kept permanently, not as a placeholder to be embarrassed about, but as ORAM's documented "dry-run everything" mode for CI smoke tests and first-time `oram run --provider stub` demos with zero external dependencies.

---

## 8. Dashboard Vision (UX only — no implementation)

A single-page, always-live view of ORAM's state for the current repository. Six panels:

**Pipeline.** A horizontal stepper of all lifecycle phases (5.1), each step showing PASS/FAIL/RUNNING/SKIPPED — a visual generalization of today's `run.md` stage table, but live via the event bus instead of a static post-hoc report.

**Current Stage.** A detail panel for whichever stage is active right now: what it's reading, what it will write, elapsed time — sourced from `StageEntered`/`ArtifactWritten` events.

**Work Orders.** A list of every Work Order ORAM has ever drafted for this repo (successor to `implementation-request.json`, but plural and historical, not singular and overwritten) — each showing its goal, affected files, size/risk, and current status (draft / approved / executing / done).

**Validation.** The rules table from today's `validation.json` (`RULE-001`..`RULE-006`), rendered as pass/fail chips, plus the validation score trend across this repo's run history — a chart, not just a number.

**PR.** The most recent pull request ORAM opened for this repo, its real GitHub URL and status (open/merged/closed) once published — pulling live GitHub state, not just the locally-generated `pull-request.json`.

**Engineering Health.** A repo-level summary combining today's Repository Intelligence + Engineering Knowledge output — per-module criticality/complexity/risk, technical-debt indicator counts, trending over time as more runs accumulate. This is the panel that should feel most like "an operating system dashboard" rather than "a build log."

**Artifacts.** A file browser over every JSON/Markdown artifact any run has produced — replacing today's experience of manually finding `execution-plan/execution-plan.json` in fourteen different gitignored folders.

**Logs.** The structured per-stage log stream (5.5), filterable by stage and severity, with a "replay this run" button that hands off directly to `oram replay`.

---

## 9. First-Time User Experience

```
$ npm install -g oram

added 1 package in 2s

$ cd my-project
$ oram init

  ORAM — Orchestrated Repository Autonomous Manager

  Fingerprinting repository...
    ✓ Detected: JavaScript / TypeScript, React, Express
    ✓ Detected package managers: npm (frontend/, backend/)
    ✓ Detected 6 logical modules: Authentication, Attendance, Faculty, Student, Admin, Reports

  Provider setup — how should ORAM implement approved changes?
    > Stub (simulate only, no real changes) — good for a first run
      Claude Code (requires `claude` CLI)
      Gemini CLI (requires GEMINI_API_KEY)
      OpenHands (requires provider credentials)
      Skip — analysis only, no execution

  ✓ Created .oram/config.json
  ✓ ORAM is ready. Run `oram run` to start your first cycle.

$ oram run

  [1/9] Repository Intelligence......... done (312ms)
  [2/9] Engineering Knowledge........... done (48ms)
  [3/9] Historical Context.............. done (no prior runs found)
  [4/9] Recommendations................. done — 4 candidate improvements found
  [5/9] Decision........................ done — selected #1 "Extract Authentication logic"
  [6/9] Execution Plan................... done — 6 steps, estimated 6.5h, Low risk

  ── Work Order ready for review ──
    Extract Authentication logic into smaller units
    Affected files: 10        Estimated risk: Low        Estimated effort: 6.5h

    Approve and execute with provider "stub"?  [y/N] y

  [7/9] Execution........................ done — provider: stub (simulated)
  [8/9] Validation....................... approved (score 100/100)
  [9/9] Draft Pull Request............... skipped (dry run — no real GitHub changes made)

  Run complete: RUN-000001
  View the full report:  oram inspect RUN-000001
  Open the dashboard:    oram dashboard
```

The bar this is written to match: `git init`/`docker init`/`vercel` — short, confirmatory, never silent, always tells the user the next command to type. No environment variable is ever required to be "known" by the user (`EXECUTION_APPROVED`, `GVAMS_MAX_ITERATIONS`, etc. all become CLI flags or interactive prompts). No file path (`scripts/anything.js`) ever appears in output.

---

## 10. Migration Roadmap

### Milestone 0 — Repository cleanup
- Delete `scripts/decision-engine.js`/`.test.js` after migrating its six dependent fixtures to `adaptive-decision-engine.js`.
- Delete `scripts/agent-cycle.js` (dead code, zero coverage) — decide separately whether its lifecycle concept is rebuilt fresh inside the new runtime.
- Fix or delete `.agent/README.md`'s stale claims.
- Replace the empty root `README.md` with a real product overview.
- **Exit criteria:** full existing regression suite still green; no orphaned/contradictory documentation remains.

### Milestone 1 — CLI
- Stand up `packages/cli` with `oram init`/`oram doctor` first (lowest risk — no pipeline execution involved).
- `oram analyze`/`oram plan` next, thinly wrapping the *existing* System A scripts via subprocess (no runtime rewrite required yet) — proves the CLI shell before the runtime rewrite lands.
- **Exit criteria:** a user can run `oram init && oram analyze` against G-VAMS with zero knowledge of `scripts/`.

### Milestone 2 — Runtime
- Extract engine logic into `packages/engines` (pure functions, no I/O).
- Build `packages/runtime`'s lifecycle state machine and event bus (Section 5).
- Re-point the CLI's `oram run`/`oram execute`/`oram validate`/`oram inspect` at the runtime instead of subprocess-spawning scripts.
- **Exit criteria:** `oram run` produces byte-for-byte equivalent artifacts to today's `autonomous-orchestrator.js`, proven by a parity test suite.

### Milestone 3 — Provider system
- Formalize the `Provider` interface (Section 7); port `stub` and `claude-code` first.
- Generalize System B's Gemini/OpenHands calls into the same interface; retire the separate `runtime_mode` concept.
- **Exit criteria:** `oram run --provider <any>` works identically for all four providers from the CLI's point of view.

### Milestone 4 — Dashboard
- Build `apps/dashboard` against the runtime's event bus (not against flat JSON files) — this ordering is deliberate; building it earlier would just reproduce today's 3-of-14-stage prototype.
- **Exit criteria:** all eight panels in Section 8 are live and reflect a real `oram run` end to end.

### Milestone 5 — Repository-independent ORAM
- Remove every remaining `path.resolve(__dirname, "..")`-style assumption that ORAM's own code lives inside the target repository.
- Move G-VAMS into `examples/g-vams-erp` as ORAM's first proof of repo-independence.
- Validate `oram init && oram run` against a second, unrelated example repository with no G-VAMS-specific code path anywhere in the runtime.
- **Exit criteria:** ORAM has never once, anywhere in its own source, referenced "G-VAMS," "Authentication module," or any other fact specific to this one application.

---

*This document is the master blueprint for ORAM v3. No code has been changed to produce it. Every "current reality" claim above is traceable to a specific file in this repository; every recommendation builds on what is proven to work today rather than discarding it.*
