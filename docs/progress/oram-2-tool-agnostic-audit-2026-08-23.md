# ORAM 2.0 — Tool-Agnostic Development Environment Audit

**Date:** 2026-08-23  
**Scope:** Development workflow, provider assumptions, and repository boundaries  
**Status:** Reconnaissance complete; bounded implementation proposed

## Executive finding

ORAM's durable architecture is already substantially compatible with the new multi-tool AI-assisted engineering ecosystem. The repository specification explicitly defines interchangeable Providers, deterministic reasoning, human ownership of the repository, and a Runtime that mediates Provider dispatch. The immediate task is therefore **not** a wholesale rewrite. It is to identify where historical development choices have become actual code dependencies and remove only the assumptions that are proven to be architectural coupling.

## Evidence from the current repository

### Claude Code

- A real Claude Code adapter exists under the legacy `providers/claude/` path.
- The adapter isolates executable invocation, arguments, timeout, subprocess handling, and response parsing inside the adapter boundary.
- The current `packages/engines` remote-provider layer exposes `ClaudeProvider` only as a deliberate stub.
- No core Runtime lifecycle stage requires the `claude` executable.

**Classification:** optional provider/development infrastructure, not a core Runtime dependency.

### Ollama / local inference

- `packages/engines/src/provider-execution/providers/OllamaProvider.ts` contains a concrete local transport adapter for Ollama's Anthropic-compatible `/v1/messages` endpoint.
- The current `ProviderExecutionEngine` still defaults to deterministic `MemoryProvider`; Ollama is not the default execution path.
- The current `Provider` contract is synchronous, while the Ollama adapter performs asynchronous HTTP I/O.

**Classification:** optional provider implementation; the main architectural gap is the execution seam, not the existence of Ollama itself.

### Remote providers

- `RemoteProviders.ts` currently contains deliberate stubs for Claude, Gemini, and OpenAI.
- The provider abstraction is small and currently isolated from planning logic.
- The repository specification already names Provider interchangeability as a core principle.

**Classification:** the architecture is prepared for multiple providers, but the provider registry/configuration and async execution path need bounded evolution before real remote providers are wired in.

### Development agents

Antigravity, Jules, ChatGPT, Gemini, AI Studio, and similar tools are development workers rather than ORAM runtime components. No core implementation should encode assumptions about which interactive coding environment produced a commit.

**Classification:** workflow concern; keep outside the Runtime/Intelligence/Execution contracts.

## Dependency matrix

| Assumption | Evidence | Required action |
|---|---|---|
| Claude Code installed | Legacy adapter only | Keep optional; do not remove yet |
| Ollama running | Optional transport adapter | Keep optional; never require at startup |
| Specific local model | Ollama adapter option | Keep configurable; no model hard-code in core |
| Local GPU inference | No core dependency found | No action |
| Single AI provider | Provider abstraction exists | Strengthen registry/configuration |
| Synchronous provider I/O | `Provider.generate()` is synchronous | Bounded async seam is next code milestone |
| AI development tool | Not part of Runtime contracts | Document as workflow, not architecture |

## Bounded implementation proposal

The following changes are intentionally small and should be implemented in sequence:

1. **Provider contract:** introduce the smallest async-capable execution seam without immediately breaking the existing synchronous `MemoryProvider` contract.
2. **Provider registry/configuration:** make provider selection explicit and provider-agnostic; preserve deterministic `MemoryProvider` as the safe default.
3. **Failure semantics:** normalize unavailable provider, timeout, cancellation, malformed response, and transport errors into explicit execution outcomes.
4. **Reference adapters:** connect one hosted provider through the same contract before adding a collection of provider-specific features. Ollama remains an optional adapter rather than the architecture's center.
5. **Runtime verification:** prove that `AWAITING_APPROVAL` remains the gate before any external Provider execution.
6. **Only later:** consider streaming, provider-specific tool calling, or real repository mutation after the contract and evidence model are stable.

## Explicit non-changes

This audit does **not**:

- remove Claude Code support;
- remove Ollama support;
- make Gemini or OpenAI the new default;
- refactor the entire provider subsystem;
- introduce a new external dependency;
- authorize autonomous filesystem mutation;
- change the approval gate;
- claim that any hosted provider is already integrated end-to-end;
- treat Antigravity or Jules as ORAM runtime dependencies.

## Verification requirements for the next implementation PR

The next code PR should report concrete evidence for:

- existing synchronous Provider tests remaining green;
- async provider success and failure tests;
- provider selection without a mandatory external service;
- timeout/cancellation behavior;
- no provider execution before explicit approval;
- no repository mutation caused by Provider Execution itself;
- unchanged deterministic behavior when using `MemoryProvider`.

## Decision checkpoint

**Current milestone:** ORAM 2.0 tool-agnostic architecture reconnaissance.

**Next implementation milestone:** bounded async/provider-registry evolution.

The audit intentionally stops before broad refactoring. This keeps the new development-environment policy aligned with ORAM's existing rule: inspect first, identify concrete coupling, then make the smallest justified change.