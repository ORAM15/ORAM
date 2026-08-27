# ORAM 2.0 — Recursive CI Test Discovery Checkpoint

**Date:** 2026-08-27  
**Scope:** CI validation reliability  
**Status:** Progressive implementation checkpoint

## Why this checkpoint matters

The current CI workflow invokes test files through shell glob patterns such as `packages/engines/src/**/*.test.ts`. Recursive glob expansion is shell-dependent and does not reliably enumerate every nested test file in the Ubuntu runner's default shell configuration. A validation workflow that silently omits tests is not a trustworthy correctness signal.

This checkpoint makes test discovery explicit and recursive before ORAM continues deeper into provider selection and asynchronous execution work.

## Implemented

- Kept the engine, Runtime, and CLI suites as independent matrix jobs with `fail-fast: false`.
- Kept the build as an independent job.
- Replaced recursive shell glob assumptions with `find` + null-delimited `xargs` test discovery.
- Preserved Node 20 and the existing workspace installation/build flow.
- Added no AI-provider dependency, credential, or runtime side effect.

## Why this is progressive

ORAM 2.0 depends on objective validation evidence. The previous CI work correctly separated validation surfaces, but test selection still relied on recursive glob behavior. This change closes that reliability gap so future provider-registry, async-provider, and safety-gate changes are evaluated against the repository's actual nested test suites.

## Preserved invariants

- `MemoryProvider` remains the deterministic safe path.
- Claude Code and Ollama remain optional rather than required dependencies.
- No hosted-provider credentials are introduced.
- No Runtime approval behavior changes.
- No filesystem, shell, Git, or GitHub side effects are introduced by ORAM runtime code.
- No autonomous repository mutation is introduced.

## Validation statement

The authoritative validation signal is the GitHub Actions run generated from this branch. The connector cannot execute the repository's local test suite, so this checkpoint does not claim that tests pass until CI reports the result.

## Next milestone

Use the improved validation signal to resolve any remaining baseline test failures, then introduce explicit provider-selection configuration at the Runtime composition root while retaining deterministic `MemoryProvider` as the safe default and keeping external providers optional.
