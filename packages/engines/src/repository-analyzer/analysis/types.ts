/**
 * RepositoryAnalysis v2 — the rich, evidence-based analysis shape for Capability Sprint 1 (Milestone 1:
 * Intelligent Repository Analysis).
 *
 * DESIGN
 * Every detected capability is a Detection<T>: a value, a confidence level, and the evidence/source files
 * that justify it. Nothing is ever asserted without evidence -- when no evidence exists for a singular field
 * (projectType, monorepo, docker, the primary architectural pattern), its Detection's `value` is the literal
 * string "Unknown" (or `false` for booleans) with `confidence: "Low"` and empty evidence -- never a guess. For
 * plural fields (frameworks, databases, etc.), "nothing found" is an empty array, not a fabricated "Unknown"
 * entry -- an empty list already communicates "none detected" honestly.
 *
 * IDENTITY PRESERVATION (Capability Sprint 1 addendum) -- every Detection now carries a stable `id` (see
 * ../analysis/identity.ts's makeId(kind, value): deterministic, collision-free across kinds, reproducible
 * across repeated runs of the same repository) and an explicit `kind` (previously only implicit in which
 * array a Detection happened to live in). `sourceDetectionIds` lets a Detection that was derived FROM other
 * Detections (as Engineering Knowledge's rule-based findings are) reference them by id rather than only
 * their rendered evidence text -- this is deliberately NOT a graph: there is no store, no id-resolution
 * helper, no traversal API here. It is the minimum each object needs to be referenced by id later without a
 * rewrite, nothing more.
 *
 * Deliberately NOT a rewrite of LegacyRepositoryAnalysis (./types.ts, wrapping scripts/repository-
 * intelligence.js) -- that type and its adapter are untouched and still valid. This is a new, independent,
 * repository-agnostic analysis produced by a new engine (../RepositoryAnalyzerEngine.ts), generic across any
 * repository (no MP6-specific "frontend"/"backend" assumptions anywhere in this shape or its detectors).
 */

export type Confidence = "High" | "Medium" | "Low";

/** One evidence-backed detection. `value` is the detected fact itself (e.g. "React", true, "Unknown"). */
export interface Detection<T> {
  /** Stable, deterministic identity -- see ./identity.ts's makeId(kind, value). Reproducible across runs of the same repository; never a random/session-scoped id. */
  readonly id: string;
  /** Explicit category this Detection belongs to (e.g. "framework", "database", "monorepo") -- previously only implicit in which RepositoryAnalysis field held it. */
  readonly kind: string;
  readonly value: T;
  readonly confidence: Confidence;
  /** Human-readable evidence descriptions, e.g. "package.json dependencies", "Dockerfile present". */
  readonly evidence: ReadonlyArray<string>;
  /** Repository-relative paths that back this detection. */
  readonly sourceFiles: ReadonlyArray<string>;
  /** ids of other Detections this one was derived FROM, if any (empty for Detections derived directly from raw files/manifests, as every RepositoryAnalysis Detection is). */
  readonly sourceDetectionIds: ReadonlyArray<string>;
}

export interface LanguageEntry {
  readonly id: string;
  readonly language: string;
  readonly fileCount: number;
}

export interface DependencyManifestSummary {
  readonly id: string;
  readonly path: string;
  readonly ecosystem: string;
  /** The actual declared dependency names -- previously discarded, collapsed to only `dependencyCount`. Kept alongside the count rather than replacing it, since the count remains a convenient, correct-by-construction cache of `dependencyNames.length`. */
  readonly dependencyNames: ReadonlyArray<string>;
  readonly dependencyCount: number;
}

export interface DependencySummary {
  readonly totalDependencies: number;
  readonly manifests: ReadonlyArray<DependencyManifestSummary>;
}

/**
 * `role` is a naming-convention-based categorization, not an assertion about the directory's real purpose --
 * `confidence` makes that honest instead of presenting a guess as fact (previously absent entirely).
 */
export interface RepositoryStructureEntry {
  readonly id: string;
  readonly path: string;
  readonly role:
    | "source"
    | "tests"
    | "docs"
    | "scripts"
    | "ci"
    | "infrastructure"
    | "config"
    | "package"
    | "unknown";
  readonly confidence: Confidence;
}

export interface RepositoryAnalysis {
  readonly projectName: string;
  readonly projectType: Detection<string>;
  readonly languages: ReadonlyArray<LanguageEntry>;
  readonly primaryLanguages: ReadonlyArray<Detection<string>>;
  readonly frameworks: ReadonlyArray<Detection<string>>;
  readonly apiFrameworks: ReadonlyArray<Detection<string>>;
  readonly packageManagers: ReadonlyArray<Detection<string>>;
  readonly buildTools: ReadonlyArray<Detection<string>>;
  readonly testingFrameworks: ReadonlyArray<Detection<string>>;
  readonly repositoryStructure: ReadonlyArray<RepositoryStructureEntry>;
  readonly entryPoints: ReadonlyArray<Detection<string>>;
  readonly configurationFiles: ReadonlyArray<Detection<string>>;
  readonly dependencySummary: DependencySummary;
  readonly architecturalPatterns: ReadonlyArray<Detection<string>>;
  readonly monorepo: Detection<boolean>;
  readonly environmentFiles: ReadonlyArray<Detection<string>>;
  readonly ciCdSystems: ReadonlyArray<Detection<string>>;
  readonly docker: Detection<boolean>;
  readonly infrastructureFiles: ReadonlyArray<Detection<string>>;
  readonly databaseTechnologies: ReadonlyArray<Detection<string>>;
  readonly authenticationLibraries: ReadonlyArray<Detection<string>>;
  readonly aiLlmLibraries: ReadonlyArray<Detection<string>>;
  readonly cloudProviders: ReadonlyArray<Detection<string>>;
  readonly deploymentTargets: ReadonlyArray<Detection<string>>;
  readonly fileCount: number;
  readonly timestamp: string;
}
