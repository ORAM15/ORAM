/**
 * Package manager detection by lockfile/manifest presence -- generalized from scripts/repository-
 * intelligence.js's version (which only ever looked in "", "frontend", "backend"): this walks the whole
 * repository, so it works regardless of workspace layout.
 */

import type { WalkedFile } from "./walk";
import type { Detection } from "./types";
import { makeId } from "./identity";

function basename(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

interface PackageManagerRule {
  readonly fileName: string;
  readonly label: string;
  /** Lower priority number wins when multiple lockfiles for the same ecosystem exist in one directory (rare, but e.g. both package-lock.json and yarn.lock committed). */
  readonly ecosystemKey: string;
}

const RULES: ReadonlyArray<PackageManagerRule> = [
  { fileName: "package-lock.json", label: "npm", ecosystemKey: "js" },
  { fileName: "yarn.lock", label: "yarn", ecosystemKey: "js" },
  { fileName: "pnpm-lock.yaml", label: "pnpm", ecosystemKey: "js" },
  { fileName: "bun.lockb", label: "bun", ecosystemKey: "js" },
  { fileName: "poetry.lock", label: "poetry", ecosystemKey: "py" },
  { fileName: "Pipfile.lock", label: "pipenv", ecosystemKey: "py" },
  { fileName: "Gemfile.lock", label: "bundler", ecosystemKey: "rb" },
  { fileName: "composer.lock", label: "composer", ecosystemKey: "php" },
  { fileName: "Cargo.lock", label: "cargo", ecosystemKey: "rs" },
  { fileName: "go.sum", label: "go modules", ecosystemKey: "go" },
];

export function detectPackageManagers(files: ReadonlyArray<WalkedFile>): Detection<string>[] {
  const byLabel = new Map<string, Set<string>>();
  for (const file of files) {
    const rule = RULES.find((candidate) => basename(file.relPath) === candidate.fileName);
    if (!rule) continue;
    const set = byLabel.get(rule.label) ?? new Set<string>();
    set.add(file.relPath);
    byLabel.set(rule.label, set);
  }

  const detections: Detection<string>[] = [];
  for (const [label, filesFound] of byLabel.entries()) {
    const sorted = [...filesFound].sort();
    detections.push({
      id: makeId("package-manager", label),
      kind: "package-manager",
      value: label,
      confidence: "High",
      evidence: sorted.map((file) => `${file} present`),
      sourceFiles: sorted,
      sourceDetectionIds: [],
    });
  }

  // Plain `pip install -r requirements.txt` usage has no lockfile at all -- very common, and without this
  // fallback it would otherwise never surface as a detected Python package manager.
  if (!byLabel.has("poetry") && !byLabel.has("pipenv")) {
    const requirementsFiles = files.filter((f) => /(^|\/)requirements(-[\w.]+)?\.txt$/.test(f.relPath)).map((f) => f.relPath).sort();
    if (requirementsFiles.length > 0) {
      detections.push({
        id: makeId("package-manager", "pip"),
        kind: "package-manager",
        value: "pip",
        confidence: "Medium",
        evidence: requirementsFiles.map((file) => `${file} present (no lockfile)`),
        sourceFiles: requirementsFiles,
        sourceDetectionIds: [],
      });
    }
  }

  return detections.sort((a, b) => a.value.localeCompare(b.value));
}
