# Contributing to ORAM

## Ground rules

- **Deterministic by design.** Engines under `packages/engines/` must not call an LLM or depend on
  non-deterministic input. If a change needs AI-driven reasoning, it belongs in a Provider
  (`packages/providers/`), not an engine.
- **One engine, one direction of dependency.** An engine may depend on `@oram/runtime`'s types and on the
  engines before it in the pipeline. `@oram/runtime` must never import from `@oram/engines`. See
  `docs/adr/0002-engine-runner.md`.
- **No engine writes to the filesystem or a database.** State lives in the artifacts a stage returns; the
  Runtime layer (`@oram/runtime`) is the only place that persists anything.
- **Every public function is documented** with a short comment explaining *why*, not what — the code
  already says what.

## Development workflow

```bash
npm install
npx tsx --test packages/engines/src/**/*.test.ts
npx tsx --test packages/cli/src/**/*.test.ts
npm run build
```

1. Branch from `main`.
2. Make your change, matching the existing style in the package you're touching — read a sibling engine
   before adding a new one.
3. Add or update tests under the same package (`node:test` via `tsx`, no other test runner is used here).
4. Update the relevant `README.md` (`packages/engines/README.md` or `packages/cli/README.md`) if you added
   or changed a public command or engine.
5. Open a pull request against `main`.

## AI-assisted development workflow

When working with AI agents or AI-assisted tooling, follow the intended development loop:

1. Read `AGENTS.md` and existing project documentation.
2. Inspect before changing.
3. Make a bounded change.
4. Run the relevant validation/tests.
5. Inspect the diff.
6. Commit/push through the normal Git workflow and use a PR for review.

AI agents are assistants, not architectural authorities. Human maintainers retain ownership of design decisions and code review. Secrets and sensitive credentials must never be committed to the repository.

## Reporting bugs / proposing engines

Open an issue describing the repository behavior you observed (or want ORAM to detect) and, if you're
proposing a new engine, which upstream artifact(s) it would consume and what it would produce — see any
`packages/engines/src/<engine>/analysis/types.ts` for the shape that convention expects.

## Code of conduct

Participation in this project is governed by `CODE_OF_CONDUCT.md`.
