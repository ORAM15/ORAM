# ORAM 2.0 — Independent Validation Checkpoint

**Date:** 2026-08-26  
**Scope:** CI validation architecture and provider-boundary verification  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

The current pull-request workflow executes the engine, Runtime, and CLI test suites as sequential steps in one job. When the engine suite fails, later Runtime and CLI validation is skipped, and the build is also skipped. That makes a provider-boundary change harder to evaluate because one unrelated or pre-existing failure can hide the status of the other validation surfaces.

The repository's current Provider Registry work is deliberately provider-agnostic: deterministic `MemoryProvider` behavior remains the safe path, while external providers stay optional. The CI system should expose each validation surface independently before the next provider-selection milestone is introduced.

## Implemented

- Split engine, Runtime, and CLI tests into an explicit matrix with `fail-fast: false`.
- Kept the build as an independent CI job.
- Preserved Node 20 and the existing `npm install` workflow.
- Preserved the existing test commands and did not add external AI-provider dependencies.

## What this changes operationally

A failing engine suite no longer prevents the Runtime provider-registry suite, CLI suite, or build from producing their own validation result.

The workflow still fails overall when a required job fails. This is an observability and validation-isolation improvement, not a mechanism for hiding failures.

## Why it is progressive

This checkpoint follows the ORAM 2.0 sequence:

1. tool/provider assumptions audited;
2. Provider Registry contract tested;
3. Runtime provider coverage added to CI;
4. CI validation made independently observable;
5. next: explicit provider-selection configuration and async execution semantics.

The change therefore improves the evidence system that must validate the upcoming provider abstraction work instead of introducing a provider-specific implementation prematurely.

## Preserved invariants

- `MemoryProvider` remains the deterministic safe path.
- No Claude Code, Ollama, Gemini, OpenAI, or other external provider is required.
- No credentials or secrets are introduced.
- No Runtime approval behavior changes.
- No filesystem, shell, Git, or GitHub side effects are introduced by ORAM runtime code.
- No autonomous repository mutation is introduced.

## Validation statement

GitHub Actions is the authoritative validation signal for this change. The previous CI run for PR #22 failed in the engine-test step and skipped the Runtime, CLI, and build steps. This checkpoint makes those suites independently observable so the next run can distinguish an engine failure from provider-boundary or build failures.

No passing result is claimed until the new workflow run reports it.

## Next milestone

After the independent validation signal is green, introduce explicit provider-selection configuration at the Runtime composition root while retaining deterministic `MemoryProvider` as the default and keeping external providers optional.
