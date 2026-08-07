/**
 * buildExecutionPlans() — the single entry point turning an already-computed ImplementationRequestSet's
 * requests into ExecutionPlans (./rules.ts, one per request, in the set's own order), assembling one
 * ExecutionPlanSet (./types.ts).
 */

import type { ImplementationRequestSet } from "../../implementation-requests/analysis/types";
import { buildExecutionPlanNodes } from "./rules";
import type { ExecutionPlanSet } from "./types";

export function buildExecutionPlans(requestSet: ImplementationRequestSet): ExecutionPlanSet {
  const { plans, dependencies } = buildExecutionPlanNodes(requestSet.requests);

  return {
    sourceProjectName: requestSet.sourceProjectName,
    sourceTimestamp: requestSet.sourceTimestamp,
    plans,
    dependencies,
    executionOrder: plans.map((plan) => plan.id),
    timestamp: new Date().toISOString(),
  };
}
