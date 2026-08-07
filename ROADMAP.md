# Roadmap

This reflects the state of the framework at the point of extraction into its own repository (see
`docs/migration-report.md`). It is a snapshot, not a commitment — priorities may change.

## Pipeline coverage

Real, tested, TypeScript engines exist through the full pipeline as of this snapshot: Repository Analysis,
Engineering Knowledge, Engineering Reasoning, Engineering Planning, Engineering Missions, Implementation
Requests, Execution Planning, the Implementation Executor, Provider Execution, Validation, Recommendation,
Reflection, Engineering Memory, and Adaptive Decision. See `packages/engines/README.md`'s status table for
the authoritative, per-engine detail.

## Not yet built

- **`historical-context`** — a "has ORAM seen a run like this before" engine. Prior art
  (`scripts/historical-context-retriever.js`, Jaccard-similarity based) existed on a local branch that
  predates the ORAM pivot and was never merged; it is not part of this repository. Would need to be
  rebuilt against the current `packages/engines` conventions, not ported as-is.
- **`pull-request` / `publisher` engines** — wrapping the pipeline's decision to open a PR
  (`scripts/pull-request-generator.js`) and actually pushing one (`publisher/github/client.js`,
  `scripts/github-publisher.js`) in a typed `@oram/engines` package, the same way `provider-execution` wraps
  a Provider today. Both scripts are preserved in this repository and are the intended starting point.
- **Real Providers.** `packages/engines/src/provider-execution/providers/` currently ships one working
  provider (`MemoryProvider`, deterministic canned responses) and three stubs (`ClaudeProvider`,
  `GeminiProvider`, `OpenAIProvider`) that throw `NotImplementedYetError`. System A's
  `providers/claude/adapter.js` is real, tested subprocess-invocation code and is the natural reference for
  implementing `ClaudeProvider` for real.
- **`apps/dashboard`.** Scaffolded only — a live view of pipeline state built against
  `packages/runtime`'s EventBus. Deliberately the last thing to build; see `apps/dashboard/README.md`.
- **Remaining CLI commands** (`init`, `run`, `validate`, `inspect`, `dashboard`, `doctor`, `replay`) are
  command architecture only today, printing `"Not implemented yet."` — see `packages/cli/README.md`'s
  Status section.
- **`packages/providers`, `packages/artifacts`, `packages/plugins`, `packages/sdk`** — scaffolded (README
  only), not yet implemented.

## Principles that constrain all of the above

- No engine calls an LLM, writes to disk, or talks to git/GitHub directly — that capability lives in
  Providers and the Runtime layer, never in an engine. See `CONTRIBUTING.md`.
- New engines are added one at a time, each with its own tests and snapshot fixtures, following the pattern
  every existing engine in `packages/engines/src/` already uses.
