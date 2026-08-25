# ORAM 2.0 — CI Provider Contract Checkpoint

**Date:** 2026-08-25  
**Scope:** Provider registry verification and CI coverage  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

PR #21 established focused tests for the Runtime `InMemoryProviderRegistry`, but the repository CI workflow only executed engine and CLI test paths. The new Runtime provider contract therefore existed without being part of the default pull-request validation command.

This checkpoint closes that validation gap before provider-selection configuration is expanded.

## Implemented

- Added the Runtime provider-registry test suite to CI.
- Kept engine and CLI validation paths intact.
- Preserved deterministic `MemoryProvider` behavior as the safe default.
- Kept provider selection provider-agnostic; no Gemini, OpenAI, Ollama, or Claude Code dependency is introduced.

## Validation intent

The pull-request workflow should now execute:

1. engine tests;
2. Runtime tests;
3. CLI tests;
4. the workspace build.

A passing CI run is the authoritative validation signal. This checkpoint does not claim a pass until GitHub Actions reports one.

## Current blocker carried forward

PR #21 has a recorded CI failure in its engine-test step. The connector can identify the failing step but cannot retrieve the private Actions log output in this environment, so the underlying assertion failure cannot be truthfully diagnosed here. No speculative test change is made to mask that failure.

## Next milestone

Once CI is green, introduce explicit provider-selection configuration at the Runtime composition root while retaining deterministic `MemoryProvider` as the default and keeping external providers optional.
