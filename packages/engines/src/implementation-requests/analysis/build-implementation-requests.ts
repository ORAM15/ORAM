/**
 * buildImplementationRequests() — the single entry point turning an already-computed MissionGraph's Missions
 * into ImplementationRequests (./rules.ts, one per Mission, in the graph's own executionOrder), assembling
 * one ImplementationRequestSet (./types.ts).
 */

import type { MissionGraph } from "../../engineering-missions/analysis/types";
import { buildImplementationRequest } from "./rules";
import type { ImplementationRequestSet } from "./types";

export function buildImplementationRequests(graph: MissionGraph): ImplementationRequestSet {
  const missionsById = new Map(graph.missions.map((mission) => [mission.id, mission]));

  return {
    sourceProjectName: graph.sourceProjectName,
    sourceTimestamp: graph.sourceTimestamp,
    requests: graph.executionOrder.map((missionId) => buildImplementationRequest(missionsById.get(missionId)!)),
    timestamp: new Date().toISOString(),
  };
}
