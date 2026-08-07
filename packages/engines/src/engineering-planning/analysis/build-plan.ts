/**
 * buildEngineeringPlan() — the single entry point mapping an already-computed EngineeringReasoning's
 * Findings into Missions (./rules.ts), assembling one EngineeringPlan (./types.ts).
 */

import type { EngineeringReasoning } from "../../engineering-reasoning/analysis/types";
import { planMissions } from "./rules";
import type { EngineeringPlan } from "./types";

export function buildEngineeringPlan(reasoning: EngineeringReasoning): EngineeringPlan {
  return {
    sourceProjectName: reasoning.sourceProjectName,
    sourceTimestamp: reasoning.sourceTimestamp,
    missions: planMissions(reasoning.findings),
    timestamp: new Date().toISOString(),
  };
}
