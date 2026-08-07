/**
 * RepositoryAnalyzerEngine — the v2, repository-agnostic Repository Analyzer (Capability Sprint 1,
 * Milestone 1: Intelligent Repository Analysis).
 *
 * Unlike LegacyRepositoryAnalyzerAdapter.ts (which wraps scripts/repository-intelligence.js verbatim, and is
 * untouched by this change), this is a real, native TypeScript implementation with no scripts/*.js
 * dependency and no MP6-specific assumptions (no "frontend"/"backend" workspace names, no hardcoded product-
 * module keywords) -- see ./analysis/ for every individual detector. It answers the richer question set this
 * capability sprint asked for (project type, frameworks, package managers, build tools, testing frameworks,
 * repository structure, entry points, config files, dependency summary, architectural patterns, monorepo
 * detection, environment files, CI/CD, Docker, infrastructure files, API frameworks, database technology,
 * auth libraries, AI/LLM libraries, cloud providers, deployment targets), with every field carrying its own
 * evidence/confidence/source files -- never a guess; "Unknown" (singular fields) or an empty list (plural
 * fields) when evidence is weak or absent.
 *
 * Same EngineDescriptor contract, same `stage`/`artifactName` addressing as the legacy adapter (both are
 * candidate `observe` engines -- see RuntimeBuilder.withObserveEngine(); only one is ever wired in at a time,
 * so no artifact-address collision). Deterministic, no network, no LLM calls -- pure filesystem inspection.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import { buildRepositoryAnalysis } from "./analysis/build-analysis";
import type { RepositoryAnalysis } from "./analysis/types";

function toEventSummary(analysis: RepositoryAnalysis): { projectName: string; fileCount: number; languages: string[] } {
  return {
    projectName: analysis.projectName,
    fileCount: analysis.fileCount,
    languages: analysis.languages.map((entry) => entry.language),
  };
}

export function createRepositoryAnalyzerEngine(): EngineDescriptor<RepositoryAnalysis> {
  return {
    stage: "repository-intelligence",
    artifactName: "repository-analysis",
    run(context: RuntimeContext): RepositoryAnalysis {
      return buildRepositoryAnalysis(context.repositoryRoot);
    },
    buildEvent(runId: string, output: RepositoryAnalysis, _ref: ArtifactRef): OramEvent {
      return {
        type: "RepositoryAnalyzed",
        runId,
        timestamp: new Date().toISOString(),
        summary: toEventSummary(output),
      };
    },
  };
}
