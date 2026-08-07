# Security Policy

## Reporting a vulnerability

If you find a security issue in ORAM, please report it privately rather than opening a public issue.
Describe the affected package (`packages/engines`, `packages/cli`, `packages/runtime`, `scripts/`, etc.),
the impact, and reproduction steps. Allow time for a fix before any public disclosure.

## Scope notes specific to this project

- **Engines never execute arbitrary code or shell out.** If you find one that does, that is itself a
  security bug — see `docs/adr/0002-engine-runner.md` for the intended boundary.
- **Providers are the trust boundary.** `packages/providers/` (and System A's `providers/claude/`) are the
  only places a real external process (an AI provider, a subprocess) is invoked. Review changes there with
  extra scrutiny.
- **The GitHub Publisher** (`publisher/github/`, and any future `@oram/*` equivalent) is the only component
  that can push branches or open pull requests on a user's behalf. It defaults to dry-run; treat any change
  that alters that default as security-relevant.
