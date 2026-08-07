/**
 * Manifest discovery and dependency-name extraction across ecosystems.
 *
 * SCOPE (see this feature's own Known Limitations): npm (package.json) and Python (requirements.txt,
 * pyproject.toml) get full dependency-NAME extraction, which feeds the dependency-signature table
 * (./dependency-signatures.ts) for framework/database/auth/AI/cloud detection. Ruby, Go, Java, PHP, Rust, and
 * .NET manifests are still discovered and dependency-COUNTED (so package manager detection and dependency
 * summaries stay honest for those ecosystems too), but are not yet run through a signature table -- that is
 * deliberately left for a future multi-language sprint rather than guessed at now.
 *
 * Every extractor here is a literal, deterministic text/JSON parse -- never a semantic understanding of the
 * manifest. Malformed manifests are skipped (not guessed at): a parse failure yields zero dependencies for
 * that file rather than a fabricated result.
 */

import type { WalkedFile } from "./walk";
import { readFileSafe } from "./walk";

export type Ecosystem = "npm" | "pip" | "gem" | "go" | "maven" | "gradle" | "composer" | "cargo" | "nuget";

export interface ManifestFile {
  readonly relPath: string;
  readonly absPath: string;
  readonly ecosystem: Ecosystem;
  /** Normalized dependency names (npm/pip only get real names; other ecosystems get best-effort identifiers used only for counting). */
  readonly dependencyNames: ReadonlyArray<string>;
}

function stripPyVersionSpecifier(raw: string): string {
  return raw
    .split(/[;\[]/)[0]
    .split(/[=<>!~]/)[0]
    .trim();
}

function parsePackageJson(content: string): string[] {
  try {
    const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])];
  } catch {
    return [];
  }
}

function parseRequirementsTxt(content: string): string[] {
  const names = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]!.trim();
    if (!line || line.startsWith("-")) continue;
    const name = stripPyVersionSpecifier(line);
    if (name) names.add(name.toLowerCase());
  }
  return [...names];
}

/** Best-effort, regex-based extraction -- no TOML parser dependency. See this module's Known Limitations note. */
function parsePyprojectToml(content: string): string[] {
  const names = new Set<string>();

  const poetrySectionMatch = content.match(/\[tool\.poetry(?:\.dev-)?dependencies\][^\[]*/g);
  if (poetrySectionMatch) {
    for (const section of poetrySectionMatch) {
      for (const line of section.split(/\r?\n/).slice(1)) {
        const match = line.match(/^([A-Za-z0-9_.\-]+)\s*=/);
        if (match && match[1]!.toLowerCase() !== "python") names.add(match[1]!.toLowerCase());
      }
    }
  }

  const pep621Match = content.match(/dependencies\s*=\s*\[([^\]]*)\]/);
  if (pep621Match) {
    const entries = pep621Match[1]!.match(/"([^"]+)"|'([^']+)'/g) ?? [];
    for (const entry of entries) {
      const raw = entry.slice(1, -1);
      const name = stripPyVersionSpecifier(raw);
      if (name) names.add(name.toLowerCase());
    }
  }

  return [...names];
}

function parseGemfile(content: string): string[] {
  const names = new Set<string>();
  const matches = content.matchAll(/^\s*gem\s+["']([^"']+)["']/gm);
  for (const match of matches) names.add(match[1]!);
  return [...names];
}

function parseGoMod(content: string): string[] {
  const names = new Set<string>();
  const requireBlock = content.match(/require\s*\(([^)]*)\)/);
  if (requireBlock) {
    for (const line of requireBlock[1]!.split(/\r?\n/)) {
      const match = line.trim().match(/^([^\s]+)\s+v[\w.\-+]+/);
      if (match) names.add(match[1]!);
    }
  }
  const singleLineMatches = content.matchAll(/^require\s+([^\s]+)\s+v[\w.\-+]+/gm);
  for (const match of singleLineMatches) names.add(match[1]!);
  return [...names];
}

function parsePomXml(content: string): string[] {
  const names = new Set<string>();
  const depBlocks = content.match(/<dependencies>[\s\S]*?<\/dependencies>/g) ?? [];
  for (const block of depBlocks) {
    const matches = block.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
    for (const match of matches) names.add(match[1]!.trim());
  }
  return [...names];
}

function parseGradle(content: string): string[] {
  const names = new Set<string>();
  const matches = content.matchAll(/(?:implementation|api|compile|testImplementation|runtimeOnly|annotationProcessor)\s*[(]?\s*["']([^"']+)["']/g);
  for (const match of matches) names.add(match[1]!);
  return [...names];
}

function parseComposerJson(content: string): string[] {
  try {
    const pkg = JSON.parse(content) as { require?: Record<string, string>; "require-dev"?: Record<string, string> };
    return [...new Set([...Object.keys(pkg.require ?? {}), ...Object.keys(pkg["require-dev"] ?? {})])].filter((name) => name !== "php");
  } catch {
    return [];
  }
}

function parseCargoToml(content: string): string[] {
  const names = new Set<string>();
  const section = content.match(/\[dependencies\][^\[]*/);
  if (section) {
    for (const line of section[0].split(/\r?\n/).slice(1)) {
      const match = line.match(/^([A-Za-z0-9_.\-]+)\s*=/);
      if (match) names.add(match[1]!);
    }
  }
  return [...names];
}

function parseCsproj(content: string): string[] {
  const names = new Set<string>();
  const matches = content.matchAll(/<PackageReference\s+Include="([^"]+)"/g);
  for (const match of matches) names.add(match[1]!);
  return [...names];
}

interface ManifestRule {
  readonly match: (file: WalkedFile) => boolean;
  readonly ecosystem: Ecosystem;
  readonly parse: (content: string) => string[];
}

const MANIFEST_RULES: ReadonlyArray<ManifestRule> = [
  { match: (f) => f.relPath.endsWith("package.json") && !f.relPath.includes("node_modules/"), ecosystem: "npm", parse: parsePackageJson },
  { match: (f) => /(^|\/)requirements(-[\w.]+)?\.txt$/.test(f.relPath), ecosystem: "pip", parse: parseRequirementsTxt },
  { match: (f) => f.relPath.endsWith("pyproject.toml"), ecosystem: "pip", parse: parsePyprojectToml },
  { match: (f) => f.relPath.endsWith("Gemfile"), ecosystem: "gem", parse: parseGemfile },
  { match: (f) => f.relPath.endsWith("go.mod"), ecosystem: "go", parse: parseGoMod },
  { match: (f) => f.relPath.endsWith("pom.xml"), ecosystem: "maven", parse: parsePomXml },
  { match: (f) => f.relPath.endsWith("build.gradle") || f.relPath.endsWith("build.gradle.kts"), ecosystem: "gradle", parse: parseGradle },
  { match: (f) => f.relPath.endsWith("composer.json"), ecosystem: "composer", parse: parseComposerJson },
  { match: (f) => f.relPath.endsWith("Cargo.toml"), ecosystem: "cargo", parse: parseCargoToml },
  { match: (f) => f.ext === ".csproj", ecosystem: "nuget", parse: parseCsproj },
];

export function discoverManifests(files: ReadonlyArray<WalkedFile>): ManifestFile[] {
  const manifests: ManifestFile[] = [];
  for (const file of files) {
    const rule = MANIFEST_RULES.find((candidate) => candidate.match(file));
    if (!rule) continue;
    const content = readFileSafe(file.absPath);
    if (content === null) continue;
    manifests.push({ relPath: file.relPath, absPath: file.absPath, ecosystem: rule.ecosystem, dependencyNames: rule.parse(content) });
  }
  return manifests;
}
