/**
 * The dependency rule (Engineering Missions MVP). EngineeringPlan's `missions` array is already
 * deterministically ordered (Engineering Planning's mapping rules run in a fixed order -- see
 * engineering-planning/analysis/rules.ts's own TEMPLATES array), so this rule needs no new judgment: each
 * Mission simply depends on the Mission immediately before it in that existing order, forming one linear
 * chain. Mission 0 has no dependencies and is always first in the execution order.
 *
 * CONCRETE LIMITATION -- READ BEFORE ASSUMING THIS REFLECTS REAL WORK RELATIONSHIPS
 *
 *   This is a MVP ordering rule, not a claim that e.g. "Increase Test Coverage" is technically blocked on
 *   "Improve Subsystem Documentation" finishing first. EngineeringPlan carries no data about real
 *   dependencies between Missions (no shared resource, no explicit ordering hint, nothing) -- inventing a
 *   semantic dependency graph from scratch would be fabrication, not a deterministic transformation of
 *   existing data. A single linear chain over the Plan's own existing order is the only dependency rule that
 *   requires no new information: it is honest about being a default execution sequence, not a discovered
 *   constraint. A future Sprint with real signal (e.g. explicit `blockedBy` data on a Mission, or shared
 *   Finding/subsystem overlap) should replace this rule rather than build on top of it silently.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { Mission as PlanMission } from "../../engineering-planning/analysis/types";
import type { Mission, MissionDependency } from "./types";

export function buildMissionGraphNodes(planMissions: ReadonlyArray<PlanMission>): { missions: Mission[]; dependencies: MissionDependency[] } {
  const missions: Mission[] = planMissions.map((planMission, index) => ({
    ...planMission,
    dependencyIds: index === 0 ? [] : [planMissions[index - 1]!.id],
    order: index,
  }));

  const dependencies: MissionDependency[] = [];
  for (let index = 1; index < missions.length; index += 1) {
    const mission = missions[index]!;
    const dependsOn = missions[index - 1]!;
    dependencies.push({
      id: makeId("mission-dependency", `${dependsOn.id}->${mission.id}`),
      missionId: mission.id,
      dependsOnMissionId: dependsOn.id,
    });
  }

  return { missions, dependencies };
}
