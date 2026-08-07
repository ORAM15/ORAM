/**
 * buildMissionGraph() — the single entry point turning an already-computed EngineeringPlan's Missions into a
 * MissionGraph (./rules.ts assigns dependencies + order), assembling one MissionGraph (./types.ts).
 */

import type { EngineeringPlan } from "../../engineering-planning/analysis/types";
import { buildMissionGraphNodes } from "./rules";
import type { MissionGraph } from "./types";

export function buildMissionGraph(plan: EngineeringPlan): MissionGraph {
  const { missions, dependencies } = buildMissionGraphNodes(plan.missions);

  return {
    sourceProjectName: plan.sourceProjectName,
    sourceTimestamp: plan.sourceTimestamp,
    missions,
    dependencies,
    executionOrder: missions.map((mission) => mission.id),
    timestamp: new Date().toISOString(),
  };
}
