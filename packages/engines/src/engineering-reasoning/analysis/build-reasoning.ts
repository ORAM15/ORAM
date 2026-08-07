/**
 * buildEngineeringReasoning() — the single entry point running every rule in ./rules.ts against an
 * already-computed EngineeringKnowledge, assembling one EngineeringReasoning (./types.ts).
 */

import type { EngineeringKnowledge } from "../../engineering-knowledge/analysis/types";
import { detectFindings } from "./rules";
import type { EngineeringReasoning } from "./types";

export function buildEngineeringReasoning(knowledge: EngineeringKnowledge): EngineeringReasoning {
  return {
    sourceProjectName: knowledge.sourceProjectName,
    sourceTimestamp: knowledge.sourceTimestamp,
    findings: detectFindings(knowledge),
    timestamp: new Date().toISOString(),
  };
}
