/**
 * Attributes every technology Detection from RepositoryAnalysis to whichever subsystem actually owns the
 * manifest that declared it -- a dependency declared in packages/pkg-a/package.json is attributed to the
 * "packages/pkg-a" subsystem; a dependency declared in a single, repository-root package.json (the common
 * single-package case) has no one subsystem that owns it, so it is attributed to the repository as a whole
 * instead of being falsely pinned to an arbitrary subdirectory.
 *
 * `from` is namespaced ("subsystem:<path>" vs "repository:<projectName>") so the two cases can never be
 * confused for each other, or for an arbitrary label, by a reader with no other context -- see this
 * package's own IDENTITY PRESERVATION note in ./types.ts.
 */

import type { RepositoryAnalysis, Detection } from "../../repository-analyzer/analysis/types";
import { slugify } from "../../repository-analyzer/analysis/identity";
import type { SubsystemBase } from "./subsystems";
import type { DependencyRelationship, DependencyRelationshipKind } from "./types";

const CATEGORY_KIND: Readonly<Record<string, DependencyRelationshipKind>> = {
  framework: "uses-framework",
  "api-framework": "uses-api-framework",
  database: "uses-database",
  auth: "uses-auth",
  ai: "uses-ai",
  cloud: "uses-cloud",
  "build-tool": "uses-build-tool",
  "test-framework": "uses-test-framework",
};

function manifestDirectory(manifestPath: string): string {
  const idx = manifestPath.lastIndexOf("/");
  return idx === -1 ? "" : manifestPath.slice(0, idx);
}

function findOwningSubsystem(manifestPath: string, subsystems: ReadonlyArray<SubsystemBase>): SubsystemBase | null {
  const dir = manifestDirectory(manifestPath);
  return subsystems.find((subsystem) => subsystem.path === dir) ?? null;
}

export function detectDependencyRelationships(
  analysis: RepositoryAnalysis,
  subsystems: ReadonlyArray<SubsystemBase>,
  projectName: string
): DependencyRelationship[] {
  const relationships: DependencyRelationship[] = [];
  const repositoryId = `repository:${projectName}`;
  const categorized: ReadonlyArray<[string, ReadonlyArray<Detection<string>>]> = [
    ["framework", analysis.frameworks],
    ["api-framework", analysis.apiFrameworks],
    ["database", analysis.databaseTechnologies],
    ["auth", analysis.authenticationLibraries],
    ["ai", analysis.aiLlmLibraries],
    ["cloud", analysis.cloudProviders],
    ["build-tool", analysis.buildTools],
    ["test-framework", analysis.testingFrameworks],
  ];

  for (const [category, detections] of categorized) {
    for (const detection of detections) {
      const kind = CATEGORY_KIND[category]!;
      const filesByOwner = new Map<string, string[]>();
      for (const file of detection.sourceFiles) {
        const owner = findOwningSubsystem(file, subsystems);
        const ownerId = owner ? owner.id : repositoryId;
        const files = filesByOwner.get(ownerId) ?? [];
        files.push(file);
        filesByOwner.set(ownerId, files);
      }
      for (const [from, files] of filesByOwner.entries()) {
        relationships.push({
          id: `relationship:${slugify(from)}-${slugify(detection.value)}-${kind}`,
          from,
          to: detection.value,
          toId: detection.id,
          kind,
          evidence: files,
          confidence: detection.confidence,
        });
      }
    }
  }

  return relationships;
}
