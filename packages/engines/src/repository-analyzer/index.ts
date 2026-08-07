export type {
  LegacyRepositoryAnalysis,
  LegacyLanguageEntry,
  LegacyPackageManagerEntry,
  LegacyDetectedModuleEntry,
  LegacyDependencyCount,
  LegacyTechnicalDebtIndicator,
  LegacyDuplicateCandidate,
  LegacyLargestFileEntry,
  LegacyRepositoryIntelligenceModule,
} from "./types";

export { createLegacyRepositoryAnalyzerAdapter } from "./LegacyRepositoryAnalyzerAdapter";

export type {
  Confidence,
  Detection,
  LanguageEntry,
  DependencyManifestSummary,
  DependencySummary,
  RepositoryStructureEntry,
  RepositoryAnalysis,
} from "./analysis/types";

export { buildRepositoryAnalysis } from "./analysis/build-analysis";
export { createRepositoryAnalyzerEngine } from "./RepositoryAnalyzerEngine";
