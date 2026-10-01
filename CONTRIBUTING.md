# Contributing to ORAM

## Ground rules

- **Deterministic by design.** Engines under `packages/engines/` must not call an LLM or depend on non-deterministic input. If a change needs AI-driven reasoning, it belongs in a Provider (`packages/providers/`), not an engine.
- **One engine, one direction of dependency.** An engine may depend on `@oram/runtime`'s types and on the engines before it in the pipeline. `@oram/runtime` must never import from `@oram/engines`. See `docs/adr/0002-engine-runner.md`.
- **No engine writes to the filesystem or a database.** State lives in the artifacts a stage returns; the Runtime layer (`@oram/runtime`) is the only place that persists anything.
- **Every public function is documented** with a short comment explaining *why*, not what — the code already says what.
- **Providers are replaceable.** Claude Code, Ollama, Gemini, OpenAI, and other AI backends are optional adapters, not required development or runtime assumptions.
- **Human approval remains a safety boundary.** Do not bypass `AWAITING_APPROVAL` or introduce autonomous repository mutation as a side effect of an otherwise bounded change.

## Development workflow

```bash
npm install
npm test
npm run build
```

For focused package validation:

```bash
npx tsx --test packages/runtime/src/**/*.test.ts
npx tsx --test packages/engines/src/**/*.test.ts
npx tsx --test packages/cli/src/**/*.test.ts
```

1. Branch from `master`.
2. Inspect the current implementation, relevant architecture documentation, and recent history before changing it.
3. Make a bounded change, matching the existing style in the package you're touching — read a sibling implementation before adding a new one.
4. Add or update tests under the same package (`node:test` via `tsx`, no other test runner is used here).
5. Update the relevant README when a public command or engine contract changes.
6. Run the relevant validation that the environment supports and record the actual result.
7. Inspect the diff for correctness, security, and accidental scope expansion.
8. Open a pull request against `master`.

## AI-assisted development workflow

When working with AI agents or AI-assisted tooling, follow the intended development loop:

1. Read the repository's `AGENTS.md` when present and existing project documentation.
2. Inspect before changing.
3. Classify assumptions as runtime/code dependencies, development-workflow dependencies, optional adapters, or documentation-only assumptions.
4. Make the smallest requirement-driven change.
5. Run the relevant validation/tests.
6. Inspect the diff and security implications.
7. Open a focused PR for review.

AI agents are assistants, not architectural authorities. Human maintainers retain ownership of design decisions, security, correctness, and final merge decisions. Secrets and sensitive credentials must never be committed to the repository.

## Provider/tool independence

ORAM's development ecosystem is intentionally tool-agnostic. ChatGPT may be used for architecture and strategy; Gemini and Gemini Notebooks for research; Google AI Studio for model experimentation; Antigravity for interactive implementation; Jules for bounded asynchronous GitHub work; and GitHub as the canonical technical source of truth. Claude Code and local Ollama may be used when useful, but ORAM must remain functional without either.

Do not introduce vendor-specific dependencies merely because one development tool was historically used. Provider-specific transport, authentication, and response parsing belong behind provider adapters.

## Validation and evidence

AI-generated code is not trusted automatically. Every meaningful implementation must eventually be tested, diff-reviewed, and security-reviewed where appropriate. GitHub Actions is the authoritative CI signal for pull requests.

Never claim a test, build, provider call, or deployment succeeded unless it was actually executed and the result is available. If validation is unavailable, say so explicitly in the PR.

## Reporting bugs / proposing engines

Open an issue describing the repository behavior you observed (or want ORAM to detect) and, if you're proposing a new engine, which upstream artifact(s) it would consume and what it would produce — see any `packages/engines/src/<engine>/analysis/types.ts` for the shape that convention expects.

## Code of conduct

Participation in this project is governed by `CODE_OF_CONDUCT.md`.
