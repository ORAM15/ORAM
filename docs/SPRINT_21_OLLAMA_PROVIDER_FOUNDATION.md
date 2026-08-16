# Capability Sprint 21 — Ollama Provider Foundation

## Purpose

Sprint 21 is the transition from deterministic provider simulation toward a real external AI execution path.

This change establishes the first concrete transport adapter for the locally verified development stack:

```text
ORAM provider adapter
        ↓
Ollama Anthropic-compatible API
        ↓
local model
```

## What this PR implements

- Adds `OllamaProvider` for Ollama's `/v1/messages` endpoint.
- Normalizes Anthropic message responses into ORAM's existing `LLMResponse` shape.
- Disables model thinking explicitly for this transport, matching the verified local Qwen3.5 integration behavior.
- Adds timeout handling and fail-closed HTTP/error handling.
- Adds deterministic mocked transport tests for successful response normalization, HTTP failure, and missing text content.
- Exports the adapter from the provider-execution package.

## What this PR deliberately does NOT implement

This is a provider transport foundation, not the complete autonomous implementation loop.

It does **not**:

- change the existing synchronous `Provider` interface;
- wire Ollama into `ProviderExecutionEngine` yet;
- modify repository files;
- apply generated patches;
- execute shell commands or tests on the target repository;
- create commits or pull requests automatically.

The existing Provider contract is synchronous while real Ollama execution is asynchronous. Keeping the new adapter isolated avoids a speculative breaking contract change. The next Sprint 21 step should evolve the execution seam deliberately and then inject this adapter into the Runtime approval-gated path.

## Verification basis

The local development investigation verified that the selected Ollama model can:

1. answer through Ollama normally;
2. answer through Ollama's Anthropic-compatible `/v1/messages` endpoint;
3. produce a structured Anthropic `tool_use` response.

Those checks are prerequisites for this adapter but are not themselves proof of real repository modification.

## Safety boundary

The adapter only communicates with the model endpoint and returns an `LLMResponse`. ORAM's human approval gate, validation stages, patch application, and publisher remain unchanged.
