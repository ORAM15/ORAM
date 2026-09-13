# ORAM 2.0 — Explicit Provider Selection Checkpoint

**Date:** 2026-08-28  
**Scope:** Runtime provider-selection boundary  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

ORAM 2.0 must not make Claude Code, Ollama, Gemini, OpenAI, or any other AI backend a required architectural dependency. The repository already has an injectable `ProviderRegistry`; this checkpoint turns provider choice into an explicit, provider-neutral Runtime configuration contract.

## Implemented

- Added `ProviderSelectionConfig` with an optional stable `providerId`.
- Added `DEFAULT_PROVIDER_ID = "memory"` so the deterministic safe path remains the default.
- Added fail-closed validation for explicitly configured empty provider ids.
- Added `selectProvider()` that resolves only through the existing `ProviderRegistry`.
- Added focused tests for default selection, explicit selection, empty-id rejection, registry resolution, and unknown-provider failure.
- Added no concrete provider imports and no external AI dependency.

## Architectural meaning

Provider selection is now represented as a small composition-boundary concern rather than being coupled to a provider implementation. The selection module does not know how Gemini, OpenAI, Ollama, Claude Code, or another provider works. It only knows that a registered provider has a stable id.

This is intentionally an additive seam. It does not yet wire a provider into the full Runtime execution lifecycle, and it does not change the existing approval gate or repository mutation behavior.

## Preserved invariants

- `MemoryProvider` remains the intended deterministic safe default.
- External providers are optional.
- No provider is invoked during selection.
- Unknown providers fail closed.
- No credentials or secrets are introduced.
- No filesystem, shell, Git, or GitHub side effects are introduced.
- `AWAITING_APPROVAL` remains unchanged.

## Validation statement

The new tests were added but this connector does not execute the repository's local test suite. GitHub Actions is the authoritative validation signal for the pull request; no passing result is claimed until CI reports it.

The previous recursive-CI checkpoint had build, Runtime, and CLI jobs passing while the engine suite failed. This PR is intentionally scoped to the next provider-selection milestone and does not mask that baseline engine issue.

## Next milestone

After this contract is validated, connect explicit provider selection to the Runtime composition root, then introduce the async Provider execution seam while retaining the deterministic default and preserving the approval boundary.
