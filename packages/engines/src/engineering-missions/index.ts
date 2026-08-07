/**
 * This package's own `Mission` (./analysis/types.ts) is engineering-planning's `Mission` plus graph fields
 * (`dependencyIds`, `order`) -- a genuinely different, wider type with the same natural name, not a
 * duplicate. @oram/engines' top-level barrel (../index.ts) re-exports it as `MissionNode` to avoid an
 * ambiguous collision with engineering-planning's own `Mission` export; within this package's own files
 * (and for anyone importing directly from here) it stays named `Mission`, matching this Sprint's own spec.
 * `Priority`/`EstimatedEffort`/`MissionTask` are NOT re-exported here -- they are unchanged pass-throughs
 * from engineering-planning, already available from there; re-exporting identical types under two names
 * would be redundant, not useful.
 */
export type { Mission, MissionDependency, MissionGraph } from "./analysis/types";

export { buildMissionGraph } from "./analysis/build-mission-graph";
export { createEngineeringMissionsEngine } from "./EngineeringMissionsEngine";
