# @oram/providers

The Execution-layer Provider contract and its reference implementations — see
`docs/ORAM_SPECIFICATION_v1.md` Section 6 ("Provider Contract") for the authoritative interface.

## Responsibility

- The shared Provider contract (`id`, `capabilities()`, `implement()`, optional `decide()`/`validate()`)
  and its fixed, provider-agnostic result shape.
- Provider adapters that translate a bounded ORAM Work Order into an evidenced execution result.
- Provider-specific transport, authentication/configuration, timeout/cancellation behavior, and response
  normalization.

A Provider is a replaceable execution worker. It is not the source of ORAM's engineering decisions.

## Provider-neutral architecture

ORAM 2.0 must not require a particular AI vendor or local model. The intended relationship is:

```text
ORAM Runtime
     |
     v
Provider Registry / Selection
     |
     v
Provider contract
     |
     +---- hosted provider adapter
     +---- optional coding-agent adapter
     +---- optional local-model adapter
     +---- deterministic in-memory provider
```

Claude Code, Ollama, Gemini, OpenAI, OpenHands, and future backends are implementation choices behind this
boundary. Their APIs, executables, credentials, and response formats must not leak into deterministic
planning or Runtime core logic.

Development tools are a separate concern. Antigravity, Jules, ChatGPT, Gemini, AI Studio, and Claude Code
may be used to develop ORAM, but using a tool during development does not make that tool an ORAM runtime
dependency.

## Reference providers

| Provider | Status | Role |
|---|---|---|
| `memory` | Current deterministic path | Safe/default execution for deterministic tests and existing runtime behavior |
| `claude-code` | Optional/legacy adapter | Provider-specific Claude Code CLI integration |
| `gemini-cli` | Optional/planned | Gemini-backed execution behind the common contract |
| `openhands` | Optional/planned | Coding-agent execution behind the common contract |
| `local-model` | Optional/planned | Local inference without making a specific local runtime mandatory |

The repository may retain useful provider adapters even when they are not the default. The rule is
**optional, not removed**: no provider is required merely because it exists in the repository.

## Safety boundary

Providers never decide what ORAM should work on. They receive an already-built Work Order and return a
normalized result. The Runtime owns the lifecycle and human-approval gate; a Provider must never bypass
`AWAITING_APPROVAL`.

A provider failure, timeout, cancellation, or unavailable external service must become an explicit execution
outcome rather than an uncaught Runtime failure. Provider-specific evidence may be preserved for audit, but
core ORAM artifacts must remain provider-neutral.

## Development rules

When adding or changing a Provider:

1. Inspect the existing contract and Runtime composition seam first.
2. Keep transport/authentication/response parsing inside the adapter.
3. Do not add the provider as an unconditional Runtime dependency.
4. Add focused tests for success, malformed responses, unavailable service, timeout/cancellation, and the
   normalized result shape as the adapter becomes executable.
5. Do not claim external-provider validation unless the provider was actually exercised.

## Status

The package remains scaffolded while the preliminary Provider interface lives in
`packages/runtime/src/ProviderRegistry.ts`. The ORAM 2.0 provider-selection work is intentionally being
introduced at the Runtime composition boundary before this package is promoted into the canonical Provider
implementation package. See `ORAM_V3_MIGRATION_PLAN.md` Milestone 3.
