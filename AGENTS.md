# AGENTS.md

## Project

ORAM (Orchestrated Repository Autonomous Manager) is a deterministic engineering-intelligence framework. The supported implementation is the TypeScript workspace under `packages/`; `scripts/` is retained as working reference material for the earlier System A lineage.

## Source of truth

- Treat the repository, tests, and current documentation as authoritative for implementation behavior.
- Do not invent architecture or capabilities that are not present in the codebase.
- Preserve deterministic behavior and explicit safety boundaries.

## Architecture

- `packages/` contains the current framework, including core, events, runtime, engines, CLI, and related scaffolding.
- `apps/dashboard` is the dashboard application.
- `scripts/` contains the original System A pipeline and is reference/prior-art unless a task explicitly targets it.
- `docs/` contains specifications, ADRs, presentation material, history, and migration documentation.

Before modifying an area, inspect its existing implementation, tests, and relevant documentation.

## Development workflow

1. Inspect the repository and relevant documentation before changing code.
2. State a bounded plan for non-trivial work.
3. Make the smallest coherent change that satisfies the task.
4. Preserve existing public interfaces unless the task explicitly requires a breaking change.
5. Run focused tests first, then the relevant broader checks.
6. Inspect the final diff for unintended changes.
7. Report what changed, what was tested, failures, and remaining uncertainty.

## Determinism and safety

- Do not introduce an LLM into a deterministic decision path without an explicit architectural decision.
- Do not weaken or bypass the `AWAITING_APPROVAL` safety boundary.
- Do not fabricate successful execution, publishing, validation, or GitHub operations.
- Do not turn dry-run behavior into side-effecting behavior without explicit task scope and review.
- Treat provider execution, publishing, filesystem mutation, shell execution, and external integrations as safety-sensitive boundaries.

## Testing

- Add or update tests for behavior changes.
- Prefer deterministic tests with explicit fixtures and assertions.
- Do not replace real validation with mocked success merely to make a test pass.
- Do not claim a test passed unless it was actually executed.

## Dependencies and configuration

- Avoid unnecessary dependencies.
- Do not commit secrets, API keys, tokens, `.env` files, credentials, or generated private data.
- Update lockfiles only when dependency changes require it.
- Follow the repository's existing package-manager/workspace conventions.

## Git and PRs

- Keep changes focused and reviewable.
- Never rewrite shared history or force-push unless explicitly requested.
- Do not merge a PR merely because it is syntactically valid; review the diff and relevant checks first.
- Do not make unrelated cleanup changes in the same task.

## Agent behavior

AI agents are implementation assistants, not architectural authorities. For ambiguous, destructive, security-sensitive, or externally side-effecting work, stop and request human direction. When a task can be completed safely and locally, proceed within the repository's existing conventions.
