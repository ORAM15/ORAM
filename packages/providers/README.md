# @oram/providers

The Execution-layer Provider contract and its reference implementations — see
`docs/ORAM_SPECIFICATION_v1.md` Section 6 ("Provider Contract") for the authoritative interface.

## Responsibility

- The shared `Provider` interface (`id`, `capabilities()`, `implement()`, optional `decide()`/`validate()`)
  and its fixed, provider-agnostic result shape.
- Reference providers, each generalizing an existing, proven implementation:

| Provider (future) | Generalizes |
|---|---|
| `stub` | `stubProviderAdapter()` in `scripts/implementation-executor.js` |
| `claude-code` | `providers/claude/adapter.js` + `parser.js` + `prompt-builder.js` |
| `gemini-cli` | `directGeminiDecision()` in `scripts/agent-runtime-adapter.js` |
| `openhands` | `openhandsImplementation()` in `scripts/agent-runtime-adapter.js` |
| `local-model` | new — no existing analog |

## Explicit non-responsibilities

- Never decides *what* to work on — a Provider only ever receives an already-built Work Order and returns a
  result; planning logic belongs entirely to `@oram/engines`.
- Never bypasses the human-approval gate — that gate is enforced by `@oram/runtime`, before a Provider is
  ever invoked, not by the Provider itself.

## Status

Scaffolded (this README only). The `Provider` interface's preliminary shape currently lives inline inside
`packages/runtime/src/ProviderRegistry.ts` (with a TODO noting the move) purely so that package can compile
independently during scaffolding — it will relocate here once this package's own Milestone (3) begins. See
`ORAM_V3_MIGRATION_PLAN.md` Milestone 3.
