# ORAM Specification v1

**ORAM — Orchestrated Repository Autonomous Manager**

Status: technical constitution. This document defines what ORAM *is*, in precise, load-bearing terms. It is not marketing copy and it is not a feature list — it is the vocabulary and contract every future ORAM package, command, and provider must agree with. Where a term or component already has a proven analog in this repository's existing System A/System B implementation, that analog is cited so this specification stays grounded in what has actually been built, not only in what is planned (see `ORAM_V3_MIGRATION_PLAN.md`).

---

## 1. Core Philosophy

1. **ORAM is a runtime, not a request-response tool.** A chatbot or coding assistant exists only for the duration of a conversation or a single edit. ORAM exists as a standing process with durable state about one repository: what it has observed, what it has tried, what worked, and what didn't. Every design decision in this document optimizes for that state persisting and compounding across runs, not for any single run being clever in isolation.

2. **Determinism first, generation second.** Every phase of the Engineering Lifecycle (Section 4) up to and including Planning is deterministic — no model call, no randomness, fully reproducible from the same repository state. Generation (an LLM or coding agent actually writing code) is isolated to exactly one phase (Execute) and is always mediated by a Provider (Section 6), never woven into the reasoning that decided *what* to do. This is not a stylistic preference; it is what makes an ORAM run auditable, replayable, and trustworthy enough that a human can approve it without re-deriving it from scratch. This principle is already proven in this repository — every one of System A's 14 engines is deterministic by explicit design, and that discipline is the single most valuable thing ORAM inherits from it.

3. **The human owns the repository. ORAM proposes.** ORAM's authority ends at a draft pull request. It never merges its own work, never pushes to a protected branch, and never treats "I completed the task" as equivalent to "this is ready for production." This mirrors System B's own constitution (`.agent/AUTONOMOUS_RULES.md`'s branch/PR rules) and is promoted here from one component's local policy to a platform-wide, non-negotiable invariant.

4. **One engineering objective at a time.** ORAM does not attempt to improve an entire codebase in one pass. Every run is scoped to exactly one Mission (Section 2) — a single, coherent, reviewable unit of change. Breadth comes from running repeatedly over time, not from one run trying to do everything.

5. **Providers are interchangeable; reasoning is not.** Which model or coding agent actually writes the diff is a configuration choice, swappable per run, per repository, or per team's constraints (cost, data residency, availability). The reasoning that selected *what* to work on is never delegated to a provider — it is ORAM's own deterministic responsibility, always. This is the architectural line that keeps ORAM a platform rather than a wrapper around any single AI vendor.

6. **Every claim is evidence-backed.** ORAM never asserts a result it cannot show the artifact for. "Validation passed" always means a specific Quality Gate produced a specific recorded PASS; "this file was affected" always traces to a specific upstream fact. This principle is inherited directly from System A's own established discipline (e.g. Recommendation Engine's rule that no field may introduce a fact not already present in its input) and is elevated here to apply to every layer of the platform, not just one engine.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Runtime** | The long-lived process that owns a run's Lifecycle, dispatches Engines and Providers, and mediates every Event and Artifact. The direct successor to `scripts/autonomous-orchestrator.js`'s `runOrchestration()`, generalized to not assume it lives inside the repository it operates on. See Section 5. |
| **Provider** | A pluggable, swappable implementer of one capability contract (most commonly `implement()`: turn a Work Order into a real code change). Direct generalization of the `PROVIDERS` registry already prototyped in `implementation-executor.js`. See Section 6. |
| **Work Order** | The concrete, provider-facing unit of executable work: affected files/modules, constraints, acceptance criteria, a validation checklist. Always belongs to exactly one Mission. Direct successor to `implementation-request.json`. |
| **Mission** | The engineering objective a run exists to pursue — created once an Opportunity is selected during Decide, carried through Plan (where its Work Order is produced), Execute, Validate, and Reflect. A Mission is the unit a human approves or rejects; a Work Order is the unit a Provider executes. v1 Missions always contain exactly one Work Order; this is a deliberate simplification, not a permanent limitation (see Section 11, Non-goals). |
| **Engineering Cycle** | One complete traversal of the Engineering Lifecycle (Section 4), Observe through Learn, for one Mission. A "run" in casual conversation always means one Engineering Cycle. |
| **Knowledge Store** | The durable, structured record of everything ORAM has learned about a repository across every Engineering Cycle it has ever run — unifies what are today two separate, non-interoperating stores: System A's `runs/` + `memory/engineering-memory.json`, and System B's `.agent/DEVELOPMENT_MEMORY.md` + `.agent/DAILY_DECISIONS.json`. Exactly one Knowledge Store exists per repository ORAM manages. |
| **Timeline** | The ordered sequence of Events (Section 7) produced by one Engineering Cycle. The Timeline is what `oram inspect`/`oram replay` render; it is the append-only ledger a Mission's entire history can be reconstructed from without re-executing anything. |
| **Artifact** | Any single, versioned, typed piece of output an Engine, Provider, or Gate produces (a JSON document, optionally paired with a rendered Markdown view). Every Artifact belongs to exactly one Engineering Cycle and is addressable by (`runId`, `stage`, `name`). Direct generalization of today's 28 known JSON/MD files produced across System A's 14 stages. |
| **Quality Gate** | A deterministic, non-negotiable checkpoint that evaluates evidence and returns PASS/FAIL/SKIPPED — never a fuzzy score used for a go/no-go decision. Unifies System A's Validation Engine rule set (`RULE-001`..`RULE-006`) and System B's four gatekeeper stages (Input/Decision/Diff/Result) into one shared concept with two families of instance (pipeline gates, agent-safety gates). |
| **Opportunity** | A candidate improvement identified during Reason, before any selection has occurred — direct successor to one entry in `recommendations.json`. An Opportunity becomes the basis of a Mission only once Decide selects it; most Opportunities identified in a given cycle are never selected. |

---

## 3. System Layers

ORAM is organized into four layers. Each layer may only depend on the layer(s) below it — this dependency direction is enforced by package boundaries (Section 3 of `ORAM_V3_MIGRATION_PLAN.md`), not just convention.

```
┌─────────────────────────────────────────────────────────────┐
│  EXPERIENCE                                                  │
│  CLI (packages/cli) · Dashboard (apps/dashboard) · SDK       │
│  (packages/sdk) — how a human or another program observes    │
│  and directs ORAM. Never contains engineering logic itself.  │
├─────────────────────────────────────────────────────────────┤
│  EXECUTION                                                    │
│  Providers (packages/providers) · Quality Gates ·            │
│  Publisher — the layer that actually changes state: writes   │
│  code, evaluates evidence, opens pull requests.               │
├─────────────────────────────────────────────────────────────┤
│  INTELLIGENCE                                                 │
│  Engines (packages/engines) · Knowledge Store (packages/      │
│  memory) — the deterministic reasoning layer: Observe         │
│  through Plan, and Learn. Never touches the network, never    │
│  invokes a Provider, never writes to the target repository.   │
├─────────────────────────────────────────────────────────────┤
│  CORE RUNTIME                                                 │
│  Runtime · Lifecycle · EventBus · ArtifactStore ·             │
│  ProviderRegistry · Logger (packages/runtime) — owns no       │
│  engineering opinions at all; only sequencing, state, and     │
│  observability.                                                │
└─────────────────────────────────────────────────────────────┘
```

The Core Runtime layer is deliberately "dumb" — it has no idea what a recommendation is, what a good pull request looks like, or which provider is best. That knowledge lives entirely in Intelligence and Execution. This separation is what makes it possible to eventually run ORAM against a codebase in a language none of today's engines understand: the Runtime doesn't change, only the Engines and Providers registered into it do.

---

## 4. Engineering Lifecycle

Nine phases, each mapped to the System A engine that already proves the phase works today:

| Phase | Question it answers | Existing proof |
|---|---|---|
| **Observe** | What does this repository actually contain? | `repository-intelligence.js` |
| **Understand** | What does that structure *mean*, engineering-wise (purpose, criticality, coupling)? | `engineering-knowledge.js` |
| **Reason** | Given everything tried before and everything understood now, what Opportunities exist? | `historical-context-retriever.js` + `recommendation-engine.js` |
| **Decide** | Of those Opportunities, which one is worth pursuing right now? | `adaptive-decision-engine.js` |
| **Plan** | What is the concrete, ordered Work Order for the selected Opportunity? | `execution-planner.js` + `implementation-request-engine.js` |
| **Execute** | Given human approval, have a Provider actually make the change. | `implementation-executor.js` (today: stub only — see Section 6) |
| **Validate** | Does what actually happened match what was approved? | `validation-engine.js` |
| **Reflect** | Should another attempt be made, and with what adjustment? | `reflection-engine.js` |
| **Learn** | Record this Engineering Cycle into the Knowledge Store for every future Reason phase to draw on. | `run-history-manager.js` + `engineering-memory.js` |

Observe, Understand, Reason, Decide, and Plan are always deterministic — no Provider is invoked, no network call is made, the same repository state always produces the same Opportunities and the same Mission. Execute is the only phase where generation happens, and it happens behind the Provider contract (Section 6), never inline. Validate, Reflect, and Learn are deterministic again, evaluating whatever the Provider produced against fixed rules, exactly as `validation-engine.js`'s rule set already does today.

A Reflect outcome of "retry recommended" re-enters at Execute (not at Plan) with a refined objective — this generalizes System A's existing iteration loop (`GVAMS_MAX_ITERATIONS`, today implemented as a loop inside `runOrchestration()`) into an explicit Lifecycle re-entry rather than an implicit function-local loop.

---

## 5. Runtime Responsibilities

The Runtime owns exactly five responsibilities. It must never grow a sixth without this document being revised first — scope creep here is the fastest way to turn ORAM back into a monolith.

1. **Lifecycle ownership.** Track which phase a given Engineering Cycle is in, enforce legal phase transitions, and expose that state to anything that asks (`oram inspect`, the dashboard). Direct generalization of `runOrchestration()`'s implicit control flow into an explicit, queryable state machine.
2. **Engine and Provider dispatch.** Invoke the correct Engine for a deterministic phase, or the correct Provider (resolved via the ProviderRegistry) for Execute — and isolate failures from either so that one broken Engine or Provider can never crash the Runtime itself. Direct generalization of `invokeProvider()`'s existing exception-isolation guarantee in `implementation-executor.js`.
3. **Event dispatch.** Publish a typed Event (Section 7) for every phase transition, every Artifact write, every Gate evaluation, and every Provider interaction. This is what lets everything above the Core Runtime layer observe a run without polling files.
4. **Artifact management.** Persist every Engine/Provider/Gate output as a versioned, run-scoped Artifact (Section 8), and serve it back for `oram inspect`/`oram replay` — independent of whatever state the target repository's working tree is in by the time someone asks.
5. **Logging.** Route all diagnostic output through one structured, per-stage log stream, rather than direct `console.log` calls scattered through business logic (as System A's engines do today).

Explicitly **not** a Runtime responsibility: any engineering rule (what makes a good recommendation, how risk is estimated), any Provider-specific behavior (how to talk to Claude Code vs. Gemini), and any UI concern (how a stage renders in the dashboard). Those belong to Intelligence, Execution, and Experience respectively.

---

## 6. Provider Contract

A Provider is anything that can turn a Work Order into a real, evidenced result. The contract is intentionally the smallest interface that both today's stub and a real coding agent can satisfy — directly generalized from the `stubProviderAdapter(request) → raw` / `normalizeProviderResult(raw) → normalized` pair already proven in `implementation-executor.js` and `providers/claude/parser.js`.

**Identity and capability.** Every Provider declares a stable `id` and a `capabilities()` result — at minimum, whether it can `implement()` a Work Order, and optionally whether it can also `decide()` (participate in Reason/Decide, the way System B's Gemini call does today) or `validate()` (offer supplementary evidence beyond the deterministic Quality Gates). This lets the Runtime negotiate instead of only failing closed on an unrecognized name, though failing closed remains the correct behavior for a truly unknown or misconfigured provider — that guarantee from `resolveProvider()` is preserved, not weakened.

**The result shape is fixed and provider-agnostic.** Every Provider's `implement()` call resolves to the same normalized shape regardless of what it wrapped internally: outcome status, modified files, tests executed/passed, warnings, errors, a human-readable summary, and optional provider-specific evidence for audit purposes. This is exactly today's `{status, modifiedFiles, testsExecuted, testsPassed, warnings, errors, executionSummary, providerEvidence}` contract — proven correct across a synthetic stub and a real Claude Code adapter already, and not something this specification changes.

**Providers never see planning, and planners never see providers.** A Work Order is a plain, serializable value. The Engine that produces it (Plan) has no reference to any Provider; the Runtime is the only thing that both knows the configured Provider and knows how to hand a Work Order to it. This is exactly the existing separation between `implementation-request-engine.js` and `implementation-executor.js` today, formalized as a platform rule rather than an incidental file boundary.

**Reference providers at launch:**

| Provider | Capability | Grounded in |
|---|---|---|
| `stub` | `implement()` only, fully simulated, zero external dependency | `stubProviderAdapter()` |
| `claude-code` | `implement()` via the real `claude` CLI | `providers/claude/adapter.js` (real code, not yet exercised for real — see migration plan Section 1.4) |
| `gemini-cli` | `decide()` proven; `implement()` to be added | `agent-runtime-adapter.js`'s `directGeminiDecision()` |
| `openhands` | `implement()` proven once, end to end, with a real merged PR | `agent-runtime-adapter.js`'s `openhandsImplementation()` |
| `local-model` | `implement()`, no hosted dependency | New — no existing analog |

A Provider failing, timing out, or throwing must never propagate as an uncaught exception into the Runtime — it always resolves to a normalized `failure` (or `blocked`, for capacity/policy reasons) result, exactly as `invokeProvider()` already guarantees today.

---

## 7. Event Model

Every Event carries a common envelope (`runId`, `timestamp`, `type`) plus a payload specific to its type. Events are the only channel through which the Experience layer learns anything about a running Engineering Cycle — no dashboard panel and no CLI command may read a Runtime's internal state directly.

| Event | Fires when | Generalizes |
|---|---|---|
| `RepositoryAnalyzed` | Observe completes | `repository-analysis.json` written |
| `KnowledgeBuilt` | Understand completes | `engineering-knowledge.json` written |
| `RecommendationsGenerated` | Reason completes | `recommendations.json` written (a set of Opportunities) |
| `MissionCreated` | Decide + Plan complete and a Work Order exists | `adaptive-decision.json` + `execution-plan.json` + `implementation-request.json` together |
| `ExecutionStarted` | The Runtime hands a Work Order to the resolved Provider | the moment `invokeProvider()` is called |
| `ExecutionFinished` | The Provider's result has been normalized | `execution.json` written |
| `ValidationCompleted` | Every Quality Gate for this Mission has evaluated | `validation.json` written |
| `ReflectionCompleted` | The retry/stop decision has been made | `reflection-report.json` written |
| `PRCreated` | The Publisher has produced (or, in dry run, simulated) a pull request | `pull-request.json` + `publish.json` written |

Events are additive-only across ORAM's lifetime — a future version may introduce new event types, but an existing event's payload shape is a stability guarantee once published, the same way an Artifact's schema is (Section 8).

---

## 8. Artifact Model

Every Artifact is addressed by the triple (`runId`, `stage`, `name`) and is always one of two kinds: a structured document (JSON, schema-versioned) or its rendered human-readable view (Markdown). This is a direct formalization of the pairing every System A engine already produces today (e.g. `repository-analysis.json` + `repository-analysis.md`) — nothing about that pairing changes, only where it physically lives.

Two properties every Artifact must have, neither of which today's implementation guarantees:

1. **Run-scoped storage, independent of the target repository's working tree.** Today, artifacts are written directly inside the analyzed repository (`repository-intelligence/`, `decision/`, etc.), which is why 14 separate `.gitignore` entries exist. An ORAM Artifact instead lives under the Runtime's own ArtifactStore (Section 5), so that a repository's own working tree is never mutated by the act of analyzing it, and a past run remains inspectable even after the repository has changed.
2. **Schema-versioned.** Every Artifact's JSON document declares which version of its shape it conforms to, so `oram replay` against an old run never has to guess whether a field it expects still means what it used to.

An Artifact is immutable once written — no stage ever rewrites another stage's Artifact, matching System A's existing discipline (every engine reads its upstream input, never mutates it) exactly.

---

## 9. Configuration Model

Configuration is one file per repository, `oram.config.json` (schema defined in `oram.config.schema.json` at the repository root — see Task 5 of the current implementation phase), covering five concerns:

1. **Providers** — which Providers are available, which is the default, and any provider-specific settings (never credentials themselves; those are always resolved from the environment or a secret manager, never written to config, generalizing System B's existing discipline of only referencing `secrets.GEMINI_API_KEY` by name, never inlining it).
2. **Execution policy** — whether human approval is required before Execute (default: yes, always, generalizing today's `EXECUTION_POLICY_DEFAULTS.requireHumanApproval`), and the maximum Reflect→Execute retry count (generalizing `GVAMS_MAX_ITERATIONS`).
3. **Quality Gates** — thresholds such as maximum changed files/lines per Mission (generalizing System B's `diff_thresholds` in `.agent/runtime/config.json`), and which gates are mandatory vs. advisory.
4. **Publishing** — dry-run default (generalizing `GITHUB_PUBLISH_DRY_RUN`), target remote, base branch.
5. **Artifacts and plugins** — where the ArtifactStore persists data for this repository, and which third-party Plugins (Section 10) are enabled.

Configuration is always explicit and version-controlled per repository — ORAM never infers execution policy from context, and never silently changes behavior based on an environment variable a user didn't know to set. This directly addresses a real gap identified during the System A/B review: today's behavior is scattered across a dozen environment variables (`EXECUTION_APPROVED`, `EXECUTION_PROVIDER`, `GVAMS_MAX_ITERATIONS`, `GITHUB_PUBLISH_DRY_RUN`, `AGENT_RUNTIME_MODE`, ...) that a user has to already know exist. One schema-validated file replaces all of them.

---

## 10. Plugin Model

A Plugin is a package that extends ORAM at one of three seams, without modifying the Runtime itself:

1. **A Provider plugin** registers an additional `implement()`/`decide()` implementation (Section 6) — this is how a team adds support for an in-house model or agent without a PR against ORAM's own repository.
2. **An Engine plugin** contributes an additional deterministic phase contributor — for example, a language-specific Understand detector beyond the JavaScript/TypeScript-oriented one that exists today, or an organization-specific Opportunity rule alongside `recommendation-engine.js`'s existing four rules.
3. **A Gate plugin** contributes an additional Quality Gate rule (Section 2) — for example, an organization's own compliance check evaluated alongside the built-in validation rules.

Every Plugin declares which seam(s) it extends and is loaded through the ProviderRegistry (for Provider plugins) or an equivalent registry per seam — never through ad hoc `require()`s scattered through Runtime code. A Plugin can add capability; it can never remove or override a Core Runtime guarantee (Section 5) such as human-approval-required or fail-closed-on-unknown-provider — those remain platform invariants regardless of what is installed.

---

## 11. Non-goals

Explicitly out of scope for ORAM v1, stated here so no future contributor accidentally treats their absence as a bug:

- **Multi-repository or multi-Mission concurrency within one Runtime instance.** v1 targets exactly one repository and one active Engineering Cycle per Runtime process. Running ORAM across many repositories means running many Runtime instances, not one Runtime coordinating many.
- **Autonomous merging.** ORAM never merges its own pull request, under any configuration. This is a Core Philosophy invariant (Section 1.3), not a missing feature.
- **Multi-Work-Order Missions.** A Mission always carries exactly one Work Order in v1 (Section 2). Splitting one large Opportunity into a sequence of smaller, dependent Work Orders is a plausible v2 direction, not a v1 commitment.
- **Autonomous scheduling by default.** Any recurring/cron-triggered execution remains opt-in and, when enabled, still respects the human-approval gate for Execute — generalizing System B's existing posture (`AUTONOMOUS_RULES.md`'s branch/PR rules; scheduled runs currently forced to a disabled runtime mode) rather than relaxing it.
- **Non-Git version control systems.** ORAM v1 assumes Git and a GitHub-shaped remote (branch, pull request). Other VCS/forge support is a future Provider-style extension point, not a v1 requirement.
- **A hosted, multi-tenant ORAM service.** v1 is a local, single-user CLI/runtime. Nothing in this specification precludes a future hosted version, but no component of v1 should assume one exists yet (see the EventBus's in-process-only note in the runtime skeleton).

---

*This specification is the technical constitution referenced by `ORAM_V3_MIGRATION_PLAN.md`. Where the two disagree, this document — being narrower and more precisely worded — governs terminology and contracts; the migration plan governs sequencing and file layout.*
