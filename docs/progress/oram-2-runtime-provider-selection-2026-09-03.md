# ORAM 2.0 — Runtime Provider Selection Composition

**Date:** 2026-09-03  
**Scope:** Runtime composition boundary  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

The Runtime already owns the ProviderRegistry, and the deterministic `memory` provider is now available on the progressive provider branch. The next bounded architectural step is to make provider choice an explicit composition concern without coupling Core Runtime to any external AI vendor.

## Implemented

- Add a provider-neutral `ProviderSelectionConfig` with an optional stable `providerId`.
- Preserve deterministic `memory` as the safe default.
- Resolve the selected provider through `ProviderRegistry` during `RuntimeBuilder.build()`.
- Fail before a Runtime is returned when the configured provider is empty or unknown.
- Preserve caller-supplied registries as authoritative; the builder never silently injects `memory` into an override registry.
- Export the selection contract from `@oram/runtime`.
- Add focused RuntimeBuilder tests for default selection, explicit registered-provider selection, unknown-provider failure, and override-registry preservation.

## Preserved invariants

- No concrete external AI provider is imported into Core Runtime.
- Ollama and Claude Code remain optional.
- Provider selection performs no provider execution.
- `AWAITING_APPROVAL` remains unchanged.
- No filesystem, shell, Git, GitHub, credential, or autonomous repository mutation behavior is introduced by selection.

## Validation

The connector does not execute the local test suite. GitHub Actions is the authoritative validation signal. No passing result is claimed until CI reports it.

## Dependency note

This checkpoint is intentionally stacked on the deterministic-provider composition checkpoint represented by PR #30. It should be merged after that prerequisite or rebased onto an equivalent `master` state containing the same provider registration contract.

## Next milestone

After this composition boundary is validated, introduce the async Provider execution seam and ensure provider failure/timeout/cancellation remains normalized and the human approval gate stays ahead of external execution.
