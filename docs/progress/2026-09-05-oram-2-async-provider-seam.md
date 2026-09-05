# ORAM 2.0 — 2026-09-05 Progress Checkpoint

## Milestone

Establish the additive asynchronous Provider execution seam required for network-backed providers without making any external AI provider a Core Runtime dependency.

## Implemented

- Added the `AsyncProvider` contract alongside the existing synchronous `Provider` interface.
- Added `ProviderExecutionEngine.runAsync()` for an explicitly supplied asynchronous provider.
- Added `runAllAsync()` with sequential plan execution so provider ordering remains deterministic at the orchestration layer.
- Updated the existing Ollama adapter to implement `AsyncProvider` without changing its transport behavior or making Ollama required.
- Exported the async contract and execution helper from the provider-execution public API.
- Added focused tests for response linkage, sequential execution, and failure propagation.

## Safety boundary

This checkpoint is intentionally additive. The existing synchronous `Provider` path remains unchanged, `MemoryProvider` remains the deterministic default, and `runAsync()` does not apply patches, mutate repositories, execute shell commands, commit Git changes, or publish to GitHub. The Runtime approval boundary is unchanged.

## Why this is the next bounded step

Sprint 21 already established a working Ollama transport, while the Provider contract remained synchronous. The ORAM 2.0 architecture also requires external providers to remain replaceable. An additive async seam lets network-backed providers participate without forcing an immediate breaking migration of the deterministic path.

## Validation status

The connector cannot execute the repository's local test suite. The focused tests were added but are not claimed as passing until GitHub Actions reports their result. No external provider, model, credential, or local Ollama installation is required by the new tests.

## Next step

Wire the async seam into Runtime provider composition and preserve the `AWAITING_APPROVAL` gate before any asynchronous external-provider execution. Then normalize timeout/failure/cancellation results at the Runtime boundary.
