/**
 * EngineeringKnowledge — Capability Sprint 1, Phase 2 (Engineering Knowledge).
 *
 * Repository Analysis (../../repository-analyzer/) answers "what exists?" -- Engineering Knowledge answers
 * "what does it mean?" by transforming an already-computed RepositoryAnalysis into subsystems, dependency
 * relationships, a narrative summary, and evidence-based strengths/risks/debt/missing-practice findings.
 * Deterministic, no LLM, no re-walking the filesystem -- RepositoryAnalysis is its one and only source of
 * facts (the same discipline scripts/engineering-knowledge.js's own header comment already established for
 * its legacy predecessor: "never re-walks the repository... is its one and only source of repository facts").
 *
 * Reuses Detection<T>/Confidence from the repository-analyzer package rather than redefining an equivalent
 * shape -- both live in @oram/engines, so this is a plain in-package import, not a new cross-package
 * dependency.
 *
 * IDENTITY PRESERVATION (Capability Sprint 1 addendum)
 *   - Subsystem.id and DependencyRelationship.id are stable (see ../../repository-analyzer/analysis/identity.ts).
 *   - Subsystem no longer flattens its owned relationships into bare label arrays (previously
 *     `relatedFrameworks`/`relatedTechnologies: string[]`, which discarded each relationship's own confidence
 *     and evidence, and silently lost which manifest actually declared it). It instead carries
 *     `relationshipIds: ReadonlyArray<string>`, referencing the full DependencyRelationship objects in
 *     `EngineeringKnowledge.dependencyRelationships` -- the canonical, single copy of that data. This is
 *     NOT a graph: there is no store and no id-resolution helper here, just a reference instead of a copy.
 *   - DependencyRelationship.from is now a namespaced id ("subsystem:<path>" or "repository:<projectName>")
 *     instead of a bare, ambiguous string that could not be told apart from an arbitrary label by a reader
 *     with no other context. `to` stays the human-readable technology label (unchanged, still first-class);
 *     `toId` is added alongside it as the referenced RepositoryAnalysis Detection's own id.
 */

export type { Confidence, Detection } from "../../repository-analyzer/analysis/types";
import type { Confidence, Detection } from "../../repository-analyzer/analysis/types";

export type SubsystemRole = "source" | "package" | "infrastructure" | "config" | "scripts" | "ci" | "tests" | "docs" | "unknown";

export interface Subsystem {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly role: SubsystemRole;
  readonly responsibility: string;
  /** References into EngineeringKnowledge.dependencyRelationships -- see this file's IDENTITY PRESERVATION note. */
  readonly relationshipIds: ReadonlyArray<string>;
  /** Evidence of the subsystem's OWN existence/identification (e.g. its path) -- never a merged copy of its relationships' own evidence, which stays with those relationships. */
  readonly evidence: ReadonlyArray<string>;
  /** Confidence in this subsystem's own identification (from RepositoryStructureEntry/role classification) -- NOT a function of how many relationships happen to be attributed to it; those are two different facts. */
  readonly confidence: Confidence;
}

export type DependencyRelationshipKind =
  | "uses-framework"
  | "uses-api-framework"
  | "uses-database"
  | "uses-auth"
  | "uses-ai"
  | "uses-cloud"
  | "uses-build-tool"
  | "uses-test-framework";

/** `from` is `subsystem:<path>` when the owning manifest sits inside that subsystem's own directory, otherwise `repository:<projectName>` (a repository-wide dependency not attributable to one specific subdirectory) -- namespaced so the two cases can never be confused for each other or for an arbitrary label. */
export interface DependencyRelationship {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** The id of the RepositoryAnalysis Detection this relationship points at -- a reference, not a resolution/lookup mechanism. */
  readonly toId: string;
  readonly kind: DependencyRelationshipKind;
  readonly evidence: ReadonlyArray<string>;
  readonly confidence: Confidence;
}

export interface EngineeringKnowledge {
  readonly sourceProjectName: string;
  readonly sourceTimestamp: string;
  readonly architectureSummary: Detection<string>;
  readonly technologyStackNarrative: Detection<string>;
  readonly subsystems: ReadonlyArray<Subsystem>;
  readonly dependencyRelationships: ReadonlyArray<DependencyRelationship>;
  readonly architecturalStrengths: ReadonlyArray<Detection<string>>;
  readonly architecturalRisks: ReadonlyArray<Detection<string>>;
  readonly technicalDebtAreas: ReadonlyArray<Detection<string>>;
  readonly missingEngineeringPractices: ReadonlyArray<Detection<string>>;
  readonly timestamp: string;
}
