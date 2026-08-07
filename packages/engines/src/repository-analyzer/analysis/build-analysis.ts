/**
 * buildRepositoryAnalysis() — the single entry point assembling every deterministic detector in this
 * directory into one RepositoryAnalysis (./types.ts). Generic across any repository: no MP6-specific paths,
 * no "frontend"/"backend" workspace assumptions, no hardcoded module keywords.
 */

import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { walkFiles, readFileSafe, existsRel } from "./walk";
import { detectLanguages, detectPrimaryLanguages } from "./languages";
import { discoverManifests } from "./manifests";
import { detectDependencySignatures } from "./dependency-signatures";
import { detectFileSignatures } from "./file-signatures";
import { detectPackageManagers } from "./package-managers";
import { detectRepositoryStructure, deriveDirectorySet, detectEntryPoints, detectMonorepo, detectArchitecturalPatterns } from "./structure";
import { detectProjectType } from "./project-type";
import type { Detection, RepositoryAnalysis } from "./types";
import { makeId } from "./identity";

/**
 * Same fallback chain as scripts/repository-intelligence.js's detectProjectName(): root package.json `name`,
 * then `git remote origin`'s repository slug, then the directory's own basename.
 *
 * The git-remote fallback only runs when `root` itself contains a `.git` directory -- `git config` walks
 * UP the filesystem to find the nearest ancestor repository, so without this guard, analyzing any directory
 * that merely sits INSIDE a larger git repository (a subdirectory, a fixture, a workspace package with no
 * `.git` of its own) would silently report that ANCESTOR repository's remote name instead of falling through
 * to this directory's own basename -- the wrong answer, and a real bug this guard exists to prevent.
 */
function detectProjectName(root: string): string {
  const rootPkgContent = readFileSafe(path.join(root, "package.json"));
  if (rootPkgContent !== null) {
    try {
      const pkg = JSON.parse(rootPkgContent) as { name?: string };
      if (pkg.name) return pkg.name;
    } catch {
      // Malformed root package.json -- fall through to the next fallback.
    }
  }
  if (existsRel(root, ".git")) {
    try {
      const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const match = remote.match(/([^/:]+?)(\.git)?$/);
      if (match?.[1]) return match[1];
    } catch {
      // No remote configured -- fall through to the directory name.
    }
  }
  return path.basename(root);
}

export function buildRepositoryAnalysis(repositoryRoot: string): RepositoryAnalysis {
  const files = walkFiles(repositoryRoot);
  const dirs = deriveDirectorySet(files);
  const manifests = discoverManifests(files);

  const languages = detectLanguages(files);
  const primaryLanguages = detectPrimaryLanguages(languages);

  const dependencySignatures = detectDependencySignatures(manifests);
  const fileSignatures = detectFileSignatures(files);
  const packageManagers = detectPackageManagers(files);
  const repositoryStructure = detectRepositoryStructure(repositoryRoot, dirs);
  const entryPoints = detectEntryPoints(files);
  const monorepo = detectMonorepo(files);
  const architecturalPatterns = detectArchitecturalPatterns(dirs);

  const frameworks = dependencySignatures.framework;
  const apiFrameworks = dependencySignatures["api-framework"];

  const projectType = detectProjectType({ frameworks, apiFrameworks, entryPoints, monorepo });

  const dockerDetections = fileSignatures.docker;
  const docker: Detection<boolean> =
    dockerDetections.length > 0
      ? {
          id: makeId("docker", true),
          kind: "docker",
          value: true,
          confidence: "High",
          evidence: dockerDetections.flatMap((d) => d.evidence),
          sourceFiles: dockerDetections.flatMap((d) => d.sourceFiles),
          sourceDetectionIds: dockerDetections.map((d) => d.id),
        }
      : { id: makeId("docker", false), kind: "docker", value: false, confidence: "Low", evidence: [], sourceFiles: [], sourceDetectionIds: [] };

  const infrastructureFiles = [...fileSignatures.infrastructure, ...dependencySignatures.infrastructure].sort((a, b) =>
    a.value.localeCompare(b.value)
  );

  const totalDependencies = manifests.reduce((sum, manifest) => sum + manifest.dependencyNames.length, 0);

  return {
    projectName: detectProjectName(repositoryRoot),
    projectType,
    languages,
    primaryLanguages,
    frameworks,
    apiFrameworks,
    packageManagers,
    buildTools: dependencySignatures["build-tool"],
    testingFrameworks: dependencySignatures["test-framework"],
    repositoryStructure,
    entryPoints,
    configurationFiles: fileSignatures.config,
    dependencySummary: {
      totalDependencies,
      manifests: manifests.map((manifest) => ({
        id: makeId("manifest", manifest.relPath),
        path: manifest.relPath,
        ecosystem: manifest.ecosystem,
        dependencyNames: manifest.dependencyNames,
        dependencyCount: manifest.dependencyNames.length,
      })),
    },
    architecturalPatterns,
    monorepo,
    environmentFiles: fileSignatures.env,
    ciCdSystems: fileSignatures.ci,
    docker,
    infrastructureFiles,
    databaseTechnologies: dependencySignatures.database,
    authenticationLibraries: dependencySignatures.auth,
    aiLlmLibraries: dependencySignatures.ai,
    cloudProviders: dependencySignatures.cloud,
    deploymentTargets: fileSignatures.deployment,
    fileCount: files.length,
    timestamp: new Date().toISOString(),
  };
}
