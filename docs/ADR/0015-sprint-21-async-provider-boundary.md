# ADR 0015 — Sprint 21 Async Provider Boundary

## Status

Proposed for Capability Sprint 21 implementation.

## Context

ORAM's current `Provider` contract is synchronous:

```ts
export interface Provider {
  generate(prompt: PromptArtifact): LLMResponse;
}
```

`ProviderExecutionEngine.run()` therefore executes each plan step synchronously through the Provider abstraction. The shipped default is `MemoryProvider`, which is deterministic and has no external side effects.

Sprint 21 has already established a concrete `OllamaProvider` transport for Ollama's local Anthropic-compatible `/v1/messages` endpoint. Real HTTP inference is inherently asynchronous, so directly changing `Provider.generate()` from `LLMResponse` to `Promise<LLMResponse>` would be a breaking contract change across the existing deterministic path.

The Runtime already provides the safety boundary needed before Provider Execution: the full pipeline pauses at `AWAITING_APPROVAL`, and Provider Execution only continues after explicit approval. The Sprint 21 provider evolution must preserve that boundary.

## Decision

Evolve Provider Execution through an **additive asynchronous seam** rather than replacing the existing synchronous `Provider` contract in one step.

The intended target shape is:

```text
ExecutionPlan
    |
    v
ProviderExecution boundary
    |
    +--------------------+
    |                    |
    v                    v
Provider             AsyncProvider
MemoryProvider       OllamaProvider
(sync)               (async)
    |                    |
    +---------+----------+
              v
       ProviderExecutionResult
              |
              v
          Validation
              |
              v
      existing approval /
      publishing boundaries
```

The asynchronous path should:

1. preserve the existing prompt and response artifact shapes;
2. await real provider I/O without blocking the execution loop;
3. keep deterministic `MemoryProvider` behavior unchanged;
4. normalize provider failures into explicit failed execution rather than fabricating a patch;
5. remain behind the existing Runtime approval gate;
6. support cancellation/timeout handling at the transport boundary;
7. avoid streaming-specific changes to core artifacts until streaming requirements are demonstrated.

## Explicit non-decisions

This ADR does **not**:

- replace `Provider.generate()` yet;
- make `MemoryProvider` asynchronous merely for symmetry;
- wire Ollama directly into the Runtime;
- introduce autonomous filesystem mutation;
- bypass `AWAITING_APPROVAL`;
- add retry/backoff policy before provider failure semantics are tested;
- claim that a successful model response is a valid repository patch;
- introduce streaming into `PatchArtifact` without a concrete artifact contract.

## Required implementation sequence

The next implementation should be bounded to the following order:

1. Define the smallest async-provider contract needed by the execution seam.
2. Add focused unit tests for successful async response propagation and provider failure.
3. Add an async execution path that consumes the existing `ExecutionPlan` and produces the existing result/artifact types.
4. Keep the synchronous path and `MemoryProvider` tests green.
5. Add Ollama integration at the new seam using the already-established transport adapter.
6. Verify the real Runtime approval gate still prevents Provider Execution before approval.
7. Only then consider streaming, cancellation refinement, or a unified sync/async abstraction.

## Rationale

An additive seam gives Sprint 21 a real migration path from deterministic simulation to local-model execution without silently changing the meaning of existing synchronous interfaces. It also keeps the safety boundary ahead of the first real external-provider execution, rather than discovering approval problems after integration.

The key invariant is:

> A provider becoming asynchronous must change transport mechanics, not ORAM's safety semantics.

## Verification criteria

Sprint 21 async-provider work is not complete until all of the following are demonstrated:

- existing synchronous Provider tests remain green;
- async provider tests pass without Ollama running;
- Ollama transport tests pass against an injected fetch implementation;
- provider HTTP failure produces a controlled failure;
- missing/invalid response content fails closed;
- Runtime remains `AWAITING_APPROVAL` before Provider Execution;
- approved execution can reach Provider Execution exactly once;
- no provider failure is represented as a successful patch;
- no filesystem/git/GitHub side effect is introduced by Provider Execution itself.
