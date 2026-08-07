# @oram/sdk

The programmatic API for embedding ORAM outside of `@oram/cli` — e.g. a future GitHub App, VS Code
extension, or CI action that wants to start/observe a run without shelling out to the `oram` binary.

## Responsibility

A stable, versioned wrapper around `@oram/runtime`'s `Runtime` interface, intended for consumers who need
the same capabilities as the CLI (`start`, `approve`, `abort`, inspecting Events/Artifacts) but from inside
another Node process rather than a terminal.

## Explicit non-responsibilities

- No new capability beyond what `@oram/runtime` already exposes — the SDK is a consumption surface, not a
  second implementation of runtime behavior.
- No CLI-specific concerns (argument parsing, terminal formatting) — those stay in `@oram/cli`.

## Status

Scaffolded (this README only). No code exists yet. Not required by any Milestone before Milestone 4; likely
to begin alongside or after the dashboard app, which is expected to be this package's first real consumer.
