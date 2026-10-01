# ORAM 2.0 — Provider ID Validation Checkpoint

**Date:** 2026-08-31  
**Scope:** Runtime Provider Registry input boundary  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

ORAM 2.0 treats provider selection as configuration and requires provider-specific implementations to remain behind a stable registry boundary. A registry that accepts empty or whitespace-padded identities can create ambiguous configuration and make fail-closed provider resolution less predictable.

## Implemented

- Reject empty provider ids during registration.
- Reject whitespace-only provider ids during registration.
- Reject provider ids with leading or trailing whitespace instead of silently normalizing them.
- Preserve existing duplicate-id and unknown-provider fail-closed behavior.
- Add focused tests for invalid and valid provider identities.

## Architectural meaning

Provider identity is now validated at the earliest Runtime registry boundary. This keeps provider selection deterministic and prevents malformed configuration from becoming a registered runtime capability.

The change remains provider-neutral: no Gemini, OpenAI, Ollama, Claude Code, or other provider is imported or required.

## Preserved invariants

- Deterministic provider behavior remains the safe path.
- External providers remain optional.
- Unknown providers still fail closed.
- No provider is invoked during registration.
- No credentials or dependencies are introduced.
- No Runtime approval behavior changes.
- No filesystem, shell, Git, or GitHub side effects are introduced by Runtime provider registration.

## Validation statement

Focused tests were added. The connector does not execute the local test suite; GitHub Actions is the authoritative validation signal for this pull request. No passing result is claimed until CI reports it.

## Next milestone

After this registry input boundary is validated, continue with explicit provider-selection composition at RuntimeBuilder and then the async Provider execution seam, while preserving the `AWAITING_APPROVAL` boundary.
