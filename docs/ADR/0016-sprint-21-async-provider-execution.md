# ADR 0016 — Sprint 21 Async Provider Execution

## Status

Implemented as the first code step following ADR 0015.

## Decision

ORAM now exposes an additive `AsyncProvider` contract and an `AsyncProviderExecutionEngine` alongside the existing synchronous `Provider` and `ProviderExecutionEngine`.

The asynchronous execution path:

1. builds the same `PromptArtifact` used by the synchronous path;
2. awaits the provider response for each execution step in order;
3. builds the existing `PatchArtifact` from that response;
4. returns the existing `ProviderExecutionResult` shape;
5. propagates provider failures instead of fabricating a successful result.

`MemoryProvider` and the existing synchronous runtime path remain unchanged.

## Ollama boundary

`OllamaProvider` now explicitly implements `AsyncProvider`. It remains transport-only: it communicates with Ollama's local Anthropic-compatible endpoint and does not mutate the repository, apply patches, run commands, publish changes, or bypass runtime approval.

## Non-decisions

This change does not:

- replace the synchronous `Provider` contract;
- wire Ollama directly into Runtime;
- introduce autonomous filesystem or GitHub mutation;
- change the `AWAITING_APPROVAL` safety boundary;
- add retries or streaming;
- claim that model output is a valid repository patch.

## Verification target

Focused tests cover successful asynchronous artifact propagation, provider failure propagation, ordered multi-plan execution, empty plan sets, and consumption of an asynchronous provider response without requiring Ollama to be running.

The next bounded step is to connect the existing Ollama transport to this async seam behind the already-established runtime approval boundary, with integration tests using an injected fetch implementation before any live local-model execution is allowed.
