/**
 * Types mirroring scripts/repository-intelligence.js's buildAnalysis() output shape EXACTLY -- field for
 * field, matching repository-analysis.json's real, already-shipped schema. Not a redesign: every field name
 * and nesting here is copied from that file's own JSDoc and writeOutputs() call, so the regression test
 * (repository-analyzer.regression.test.ts) can assert structural equality against the legacy output with
 * full type support, not `any`.
 *
 * TODO(artifacts): once @oram/artifacts exists, this belongs there as a schema-versioned artifact type
 * (docs/ORAM_SPECIFICATION_v1.md Section 8) instead of living inside one engine's own package.
 */

export interface LegacyLanguageEntry {
  readonly language: string;
  readonly fileCount: number;
}

export interface LegacyPackageManagerEntry {
  readonly workspace: string;
  readonly manager: string;
  readonly lockfile: string;
}

export interface LegacyDetectedModuleEntry {
  readonly name: string;
  readonly detected: boolean;
  readonly confidence: "strong" | "weak" | "none";
  readonly evidence: ReadonlyArray<string>;
}

export interface LegacyDependencyCount {
  readonly total: number;
  readonly perWorkspace: Readonly<Record<string, number>>;
}

export interface LegacyTechnicalDebtIndicator {
  readonly indicator: string;
  readonly count: number;
  readonly files?: ReadonlyArray<string>;
}

export interface LegacyDuplicateCandidate {
  readonly sha256: string;
  readonly files: ReadonlyArray<string>;
}

export interface LegacyLargestFileEntry {
  readonly path: string;
  readonly bytes: number;
}

/** The exact shape of scripts/repository-intelligence.js's buildAnalysis() return value / repository-analysis.json. */
export interface LegacyRepositoryAnalysis {
  readonly projectName: string;
  readonly languages: ReadonlyArray<LegacyLanguageEntry>;
  readonly frameworks: ReadonlyArray<string>;
  readonly packageManagers: ReadonlyArray<LegacyPackageManagerEntry>;
  readonly buildTools: ReadonlyArray<string>;
  readonly importantDirectories: ReadonlyArray<string>;
  readonly detectedModules: ReadonlyArray<LegacyDetectedModuleEntry>;
  readonly dependencyCount: LegacyDependencyCount;
  readonly fileCount: number;
  readonly technicalDebtIndicators: ReadonlyArray<LegacyTechnicalDebtIndicator>;
  readonly duplicateCandidates: ReadonlyArray<LegacyDuplicateCandidate>;
  readonly largestFiles: ReadonlyArray<LegacyLargestFileEntry>;
  readonly architectureSummary: string;
  readonly timestamp: string;
}

/** The subset of scripts/repository-intelligence.js's real module.exports this adapter actually uses -- see repository-intelligence.js's own module.exports list for the full set (this adapter deliberately uses only buildAnalysis(), never writeOutputs(), so wrapping it never writes into the target repository's working tree -- see LegacyRepositoryAnalyzerAdapter.ts). */
export interface LegacyRepositoryIntelligenceModule {
  buildAnalysis(): LegacyRepositoryAnalysis;
}
