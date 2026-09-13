# ORAM 2.0 — Public Provider Selection Contract

**Date:** 2026-09-01  
**Scope:** Runtime provider-selection boundary  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

The Runtime already has a provider registry, but the explicit provider-selection contract must be part of the package's supported public surface before RuntimeBuilder or other consumers can safely compose it. A provider-neutral contract that is only available through deep imports is not a complete boundary API.

## Implemented

- Add `ProviderSelectionConfig` with an optional stable `providerId`.
- Preserve deterministic `memory` as the safe default.
- Reject explicitly configured empty provider ids instead of silently selecting another provider.
- Resolve selected providers only through `ProviderRegistry`.
- Export the selection contract from `@oram/runtime`'s public barrel.
- Add focused tests that import the selection API through the public `./index` surface.

## Codex guidance incorporated

Codex previously identified a P2 issue on the earlier provider-selection PR: the new selection contract was not re-exported by `@oram/runtime`, leaving it effectively private to deep imports. This checkpoint addresses that specific review guidance without importing any concrete AI provider.

## Preserved invariants

- External providers remain optional.
- Deterministic `memory` remains the safe default.
- Provider selection never invokes a provider.
- Unknown providers fail closed through the registry.
- No credentials or dependencies are introduced.
- No Runtime approval behavior changes.
- No filesystem, shell, Git, or GitHub publishing side effects are introduced by selection.

## Validation

The focused test is designed to verify the public Runtime export and selection behavior. GitHub Actions remains the authoritative repository validation signal; this connector does not claim a passing result until CI reports it.

## Next milestone

Compose this public selection contract into `RuntimeBuilder` without importing concrete providers into Core Runtime, then continue the async Provider execution seam and approval-order verification.
