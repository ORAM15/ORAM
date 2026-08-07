# @oram/plugins

The Plugin Model — see `docs/ORAM_SPECIFICATION_v1.md` Section 10.

## Responsibility

The registration/discovery contract that lets a third party extend ORAM at one of three seams without
modifying `@oram/runtime` itself:

1. **Provider plugins** — an additional `implement()`/`decide()` implementation, registered into
   `@oram/runtime`'s `ProviderRegistry`.
2. **Engine plugins** — an additional deterministic phase contributor (e.g. a language-specific Understand
   detector, or an organization-specific Opportunity rule alongside `recommendation-engine.js`'s existing
   four rules).
3. **Gate plugins** — an additional Quality Gate rule evaluated alongside the built-in validation rules.

## Explicit non-responsibilities

- A plugin can add capability; it can never remove or override a Core Runtime invariant (human-approval-
  required, fail-closed-on-unknown-provider) — those remain platform-level guarantees regardless of what is
  installed (`docs/ORAM_SPECIFICATION_v1.md` Section 10, final paragraph).
- This package does not itself implement any plugin — only the contract and loading mechanism.

## Status

Scaffolded (this README only). No plugin loading mechanism exists yet — not required before Milestone 3
(Provider system), which is the first Milestone with an actual second/third provider to justify a plugin
seam existing.
