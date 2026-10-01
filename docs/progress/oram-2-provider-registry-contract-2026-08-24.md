# ORAM 2.0 — Provider Registry Contract Checkpoint

**Date:** 2026-08-24  
**Scope:** Provider selection boundary and deterministic registry behavior  
**Status:** Bounded implementation checkpoint

## Why this checkpoint matters

The ORAM 2.0 architecture transition identified provider selection as a required seam between the deterministic Runtime and interchangeable AI execution backends. The repository already contains an `InMemoryProviderRegistry`, but its behavioral contract had no focused test coverage.

This checkpoint turns that architectural seam into an explicitly tested contract before provider configuration or hosted-provider wiring is expanded.

## Implemented

- Added focused tests for provider registration and stable-id resolution.
- Added duplicate-id protection coverage.
- Added fail-closed behavior coverage for unknown providers.
- Added capability-listing coverage without invoking provider execution.
- Kept the registry provider-agnostic: the tests use small in-memory doubles and do not require Claude Code, Ollama, Gemini, OpenAI, network access, or model availability.

## Architectural boundary preserved

This change does not:

- make any AI provider the default;
- require Ollama or a local model;
- remove Claude Code support;
- add hosted-provider credentials;
- change Runtime approval behavior;
- perform filesystem, shell, Git, or GitHub side effects;
- introduce autonomous repository mutation.

The deterministic registry remains a composition-layer concern. Provider-specific transport stays behind provider adapters.

## Next milestone

The next bounded implementation should introduce explicit provider-selection configuration at the Runtime composition root, while retaining deterministic `MemoryProvider` behavior as the safe default and keeping external providers optional.

## Validation statement

The connector created the focused test file but did not execute the repository's local test suite. CI/local execution must provide the authoritative pass/fail result. No test success is claimed by this checkpoint.
