/**
 * buildEngineeringKnowledge() — the single entry point assembling every deterministic detector in this
 * directory into one EngineeringKnowledge (./types.ts), from an already-computed RepositoryAnalysis.
 */

import type { RepositoryAnalysis } from "../../repository-analyzer/analysis/types";
import { detectSubsystemBases, type SubsystemBase } from "./subsystems";
import { detectDependencyRelationships } from "./dependency-relationships";
import { buildArchitectureSummary, buildTechnologyStackNarrative } from "./narrative";
import { detectArchitecturalStrengths, detectArchitecturalRisks, detectTechnicalDebtAreas, detectMissingEngineeringPractices } from "./rules";
import type { EngineeringKnowledge, Subsystem, DependencyRelationship } from "./types";

/**
 * `base.confidence` (the subsystem's own structural identification confidence, from RepositoryStructureEntry)
 * flows straight onto Subsystem.confidence -- it is NOT recomputed from how many relationships this subsystem
 * happens to own. Those are two different facts: "how sure are we this is a real subsystem" vs. "how much do
 * we know about what it does." The latter is already visible, honestly, as `relationshipIds.length` -- zero
 * relationships means exactly that, not a downgrade of the former.
 */
function attachAssociations(bases: ReadonlyArray<SubsystemBase>, relationships: ReadonlyArray<DependencyRelationship>): Subsystem[] {
  return bases.map((base) => {
    const own = relationships.filter((relationship) => relationship.from === base.id);
    const allLabels = [...new Set(own.map((r) => r.to))];
    const responsibility =
      allLabels.length > 0
        ? `${base.role === "package" ? "Workspace package" : "Directory"} \`${base.path}\` (${base.role}) is associated with: ${allLabels.join(", ")}.`
        : `General ${base.role} directory \`${base.path}\`; no specific technology could be attributed to this path from its own manifest.`;

    return {
      id: base.id,
      name: base.name,
      path: base.path,
      role: base.role,
      responsibility,
      relationshipIds: own.map((r) => r.id),
      evidence: [base.path],
      confidence: base.confidence,
    };
  });
}

export function buildEngineeringKnowledge(analysis: RepositoryAnalysis): EngineeringKnowledge {
  const bases = detectSubsystemBases(analysis);
  const relationships = detectDependencyRelationships(analysis, bases, analysis.projectName);
  const subsystems = attachAssociations(bases, relationships);

  return {
    sourceProjectName: analysis.projectName,
    sourceTimestamp: analysis.timestamp,
    architectureSummary: buildArchitectureSummary(analysis, subsystems.length),
    technologyStackNarrative: buildTechnologyStackNarrative(analysis),
    subsystems,
    dependencyRelationships: relationships,
    architecturalStrengths: detectArchitecturalStrengths(analysis),
    architecturalRisks: detectArchitecturalRisks(analysis),
    technicalDebtAreas: detectTechnicalDebtAreas(analysis),
    missingEngineeringPractices: detectMissingEngineeringPractices(analysis),
    timestamp: new Date().toISOString(),
  };
}
