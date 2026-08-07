# Origin

ORAM did not start as an independent project. This document records where it came from and why it was
extracted into its own repository, for anyone encountering the codebase without that context.

## Started inside G-VAMS

ORAM began as internal automation for **G-VAMS**, an ERP/attendance system (`backend/` + `frontend/` in the
original monorepo). The goal at the time was narrow: give that one application an autonomous engineering
loop — a script that could look at the repository, propose a change, implement it, validate it, and open a
pull request, with a human reviewing the result.

That work produced what this repository still refers to as **System A**: a deterministic, JavaScript,
`node:test`-covered pipeline (`scripts/repository-intelligence.js` through `scripts/github-publisher.js`,
conducted by `scripts/autonomous-orchestrator.js`) and its own provider/publisher integrations
(`providers/claude/`, `publisher/github/`). Every stage in System A is real, tested code — not a prototype —
and is preserved here rather than rewritten from scratch, because its logic (file walking, rule matching,
scoring, artifact I/O) remains correct and directly informed the design of the engines that superseded it.

A second, related system — internally called System B, a GitHub Actions-triggered gatekeeper/agent loop —
was built specifically to evolve the G-VAMS application on a schedule. System B's configuration
(`PROJECT_VISION.md`, backlog files, workflow YAML tied to that repository's own CI) was inseparable from
G-VAMS itself, so it was **not** carried into this extraction; only the reusable engineering pipeline was.

## The turn: Phase 2K

The project's direction changed during what the original repository's history calls **Phase 2K**. Up to
that point, the automation's job was to serve one application. Phase 2K is the boundary after which the
question changed from *"how do we automate changes to G-VAMS"* to *"what would a deterministic engineering
intelligence framework look like if it had to work on any repository, not just this one."*

That reframing produced `ORAM_V3_MIGRATION_PLAN.md` (carried into this repository unchanged) — a plan to
replace System A's flat JavaScript pipeline with a typed, layered architecture: a Core Runtime
(`@oram/runtime`, `@oram/events`, `@oram/core`) driving a sequence of Intelligence-layer engines
(`@oram/engines`), fronted by a real CLI (`@oram/cli`). Thirteen-plus capability sprints followed this plan
stage by stage — Repository Analysis, Engineering Knowledge, Engineering Reasoning, Engineering Planning,
Engineering Missions, Implementation Requests, Execution Planning, the Implementation Executor, Provider
Execution, Validation, Recommendation, Reflection, Engineering Memory, and the Adaptive Decision Engine —
each one committed, tested, and reviewed independently rather than delivered as one large rewrite.

## Becoming ORAM

By the time the Adaptive Decision Engine landed, the `packages/` tree was a complete, self-contained
pipeline with no residual dependency on the G-VAMS application it started inside of — every engine consumes
only the outputs of the engine before it, and the one component that read repository-specific configuration
(Engineering Reasoning) read it generically, not from anything G-VAMS-specific. At that point the framework
had a name (**ORAM — Orchestrated Repository Autonomous Manager**) and an identity distinct from the
application that once hosted it.

This repository is the result of formalizing that separation: `packages/`, `apps/dashboard`, System A's
`scripts/`, `providers/`, `publisher/`, and ORAM's own documentation were extracted out of the original
G-VAMS monorepo into a standalone project. The original G-VAMS repository keeps its own copy of this
history intact (nothing there was deleted) and continues to function as before; it simply no longer hosts
ORAM's development going forward. See `docs/migration-report.md` for exactly what moved and how.

## Why this matters for readers of the code

A few things in this codebase only make sense with that history in mind:

- **Two pipelines exist on purpose.** `scripts/*.js` (System A) and `packages/engines/*` (the current
  framework) implement overlapping ideas because the second was designed *from* the first, not blind to it.
  System A is kept as working, tested reference material, not because it's still the recommended entry
  point — `packages/cli`'s `oram` command is.
- **"G-VAMS" still appears in some comments and ADRs.** Those references are historical fact (this is where
  a given constraint or decision came from), not a live dependency. Nothing in `packages/` imports from or
  requires a G-VAMS application to run.
- **The engine pipeline's shape (one engine, one input, one output, composed in sequence) is a direct
  descendant of System A's "artifact chain" convention** (each stage reads exactly the upstream JSON it
  needs, writes exactly one result), preserved deliberately because it proved itself over dozens of real
  runs before ORAM became independent.
