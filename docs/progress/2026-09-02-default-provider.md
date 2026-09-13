# ORAM 2.0 — September 2, 2026 Progress Checkpoint

## Milestone

Make the advertised deterministic `memory` provider an actual Runtime composition default.

## Verified problem

The provider-selection direction documented `memory` as the safe default, but `RuntimeBuilder` constructed an empty `InMemoryProviderRegistry` when no registry override was supplied. That made the default provider id resolvable in name only: a default-built registry contained no provider with id `memory`.

This checkpoint addresses that concrete boundary gap without selecting or importing any external AI provider.

## Implemented

- Added `DeterministicMemoryProvider` implementing the Runtime Provider contract.
- Registered it automatically only when `RuntimeBuilder` creates its own default registry.
- Preserved `withProviderRegistry()` as the explicit override seam; supplied registries are not mutated by the builder.
- Exported the deterministic provider from `@oram/runtime`'s public barrel.
- Added focused tests for identity, capabilities, and simulation-only execution behavior.

## Safety and architectural invariants

- `memory` performs no network, filesystem, shell, Git, or GitHub operation.
- External providers remain optional.
- Runtime remains independent of Gemini, OpenAI, Ollama, Claude Code, and other concrete AI tools.
- A caller-supplied ProviderRegistry remains authoritative and is not silently populated.
- This change does not alter `AWAITING_APPROVAL` or autonomous repository mutation behavior.

## Next bounded step

Compose the explicit provider-selection contract into `RuntimeBuilder`/runtime execution so configuration can select a registered provider without introducing concrete provider dependencies into Core Runtime, then continue the async Provider seam and approval-order verification.
