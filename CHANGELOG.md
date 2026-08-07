# Changelog

All notable changes to ORAM are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Standalone `ORAM` repository, extracted from the original G-VAMS monorepo. See
  `docs/history/origin.md` and `docs/migration-report.md` for what moved and why.
- Full engine pipeline through the Adaptive Decision Engine: Repository Analysis, Engineering Knowledge,
  Engineering Reasoning, Engineering Planning, Engineering Missions, Implementation Requests, Execution
  Planning, Implementation Executor, Provider Execution, Validation, Recommendation, Reflection,
  Engineering Memory, Adaptive Decision.
- `oram` CLI covering `analyze`, `plan`, `missions`, `requests`, `execute-plan`, `execute`, `recommend`,
  `reflect`, `history`, `decide`, plus `help`/`version`.
- System A (`scripts/`), preserved as the original deterministic JavaScript pipeline this framework
  evolved from.

### Notes

This changelog starts at the point of extraction. For the detailed engineering history prior to this
point (capability sprints, architecture decisions, problems solved), see
`ORAM_PROJECT_EVOLUTION_REPORT.md`.
