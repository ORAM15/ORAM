/**
 * @oram/engines public entry point. Phase 3 introduces this package's first real member,
 * repository-analyzer -- every other Engineering Lifecycle phase (Understand/Reason/Decide/Plan/Learn)
 * remains scaffolded (README only, per this package's own README.md) until a future phase migrates it,
 * one at a time, the same way (see docs/adr/0002-engine-runner.md for why "one engine at a time" is the
 * deliberate pace).
 */
export * from "./repository-analyzer";
export * from "./engineering-knowledge";
export * from "./engineering-reasoning";
export * from "./engineering-planning";

/**
 * engineering-missions' own `Mission` is engineering-planning's `Mission` plus graph fields (`dependencyIds`,
 * `order`) -- a genuinely different type with the same natural name, so it's re-exported here as
 * `MissionNode` to avoid an ambiguous collision with engineering-planning's `Mission` above (a blind
 * `export *` would silently drop the colliding binding rather than error). See
 * ./engineering-missions/index.ts's own header comment for the full rationale.
 */
export type { MissionDependency, MissionGraph, Mission as MissionNode } from "./engineering-missions";
export { buildMissionGraph, createEngineeringMissionsEngine } from "./engineering-missions";

export * from "./implementation-requests";

export * from "./execution-planning";

export * from "./implementation-executor";

export * from "./provider-execution";

export * from "./validation";

export * from "./recommendation";

export * from "./reflection";

export * from "./memory";

export * from "./adaptive-decision";
