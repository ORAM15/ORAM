#!/usr/bin/env node
// Repository Intelligence v1
//
// A deterministic (no AI/LLM/network) engine that inspects this repository's working tree and produces two
// generated artifacts describing its structure, stack, and simple quality signals:
//   - <output dir>/repository-analysis.json (structured, machine-readable)
//   - <output dir>/repository-analysis.md   (human-readable summary)
//
// Run with:   node scripts/repository-intelligence.js
// Output dir defaults to `repository-intelligence/` at the repository root; override with the
// REPO_INTEL_OUTPUT_DIR environment variable (relative to the repository root, or absolute).
//
// This is a standalone inspection tool. It does not read or write any .agent/ autonomous-agent state, does
// not participate in any GitHub Actions workflow, and makes no decisions -- it only reports facts it can
// deterministically observe in the checked-out source tree.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.resolve(root, process.env.REPO_INTEL_OUTPUT_DIR || "repository-intelligence");

const IGNORED_DIR_NAMES = new Set(["node_modules", ".git", "build", "dist", "coverage"]);
const IGNORED_RELATIVE_DIRS = new Set([
  "frontend/build",
  "frontend/build-auth-check",
  "frontend/build-erp-check",
  "frontend/build-verify",
  path.relative(root, outputDir).split(path.sep).join("/"),
]);

const LANGUAGE_EXTENSIONS = {
  ".js": "JavaScript",
  ".jsx": "JavaScript (JSX)",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript (TSX)",
  ".json": "JSON",
  ".md": "Markdown",
  ".css": "CSS",
  ".scss": "SCSS",
  ".html": "HTML",
  ".py": "Python",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".sh": "Shell",
};

const PACKAGE_MANAGER_LOCKFILES = [
  ["package-lock.json", "npm"],
  ["yarn.lock", "yarn"],
  ["pnpm-lock.yaml", "pnpm"],
];

const FRAMEWORK_SIGNATURES = [
  { dependency: "react", label: "React" },
  { dependency: "react-router-dom", label: "React Router" },
  { dependency: "react-scripts", label: "Create React App" },
  { dependency: "next", label: "Next.js" },
  { dependency: "vue", label: "Vue.js" },
  { dependency: "@angular/core", label: "Angular" },
  { dependency: "svelte", label: "Svelte" },
  { dependency: "express", label: "Express" },
  { dependency: "koa", label: "Koa" },
  { dependency: "fastify", label: "Fastify" },
  { dependency: "@nestjs/core", label: "NestJS" },
  { dependency: "mongoose", label: "Mongoose (MongoDB ODM)" },
  { dependency: "sequelize", label: "Sequelize (SQL ORM)" },
  { dependency: "tailwindcss", label: "Tailwind CSS" },
  { dependency: "bootstrap", label: "Bootstrap" },
];

const BUILD_TOOL_SIGNATURES = [
  "react-scripts", "webpack", "babel-loader", "@babel/core", "vite", "rollup", "parcel",
  "typescript", "postcss", "autoprefixer", "tailwindcss",
];

// Keyword signatures for logical product-module detection (scripts/repository-intelligence.js
// detectModules()). Deliberately broad, case-insensitive substrings -- this is a keyword heuristic over
// file paths and file contents, not code understanding.
const MODULE_KEYWORDS = {
  Authentication: ["auth", "login", "jwt", "bcrypt", "password"],
  Attendance: ["attendance"],
  Faculty: ["faculty", "teacher", "staff"],
  Student: ["student"],
  Admin: ["admin"],
  Reports: ["report", "performance", "analytics", "stats"],
};

const DEBT_MARKER_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/g;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isIgnoredDir(entryName, relPath) {
  return IGNORED_DIR_NAMES.has(entryName) || IGNORED_RELATIVE_DIRS.has(relPath);
}

/**
 * Recursively walks the repository from its root, returning metadata for every file on disk.
 * Skips node_modules, .git, build/dist/coverage output, known frontend build-artifact directories, and the
 * Repository Intelligence output directory itself (so re-running the tool never analyzes its own output).
 * @returns {{relPath: string, absPath: string, ext: string, size: number}[]}
 */
function walkFiles() {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(root, absPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name, relPath)) continue;
        walk(absPath);
      } else if (entry.isFile()) {
        results.push({ relPath, absPath, ext: path.extname(entry.name).toLowerCase(), size: fs.statSync(absPath).size });
      }
    }
  }
  walk(root);
  return results;
}

/**
 * Determines a project name deterministically: a root package.json's `name` field, falling back to the
 * `git remote origin` URL's repository slug, falling back to the repository directory's own basename.
 * @returns {string}
 */
function detectProjectName() {
  const rootPkg = readJsonSafe(path.join(root, "package.json"));
  if (rootPkg && rootPkg.name) return rootPkg.name;
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const match = remote.match(/([^/:]+?)(\.git)?$/);
    if (match && match[1]) return match[1];
  } catch {
    // No remote configured (e.g. a fresh local checkout); fall through to the directory name.
  }
  return path.basename(root);
}

/**
 * Counts files per detected language by extension, sorted by file count descending.
 * @param {{ext: string}[]} files
 * @returns {{language: string, fileCount: number}[]}
 */
function detectLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    const language = LANGUAGE_EXTENSIONS[file.ext];
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([language, fileCount]) => ({ language, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.language.localeCompare(b.language));
}

/**
 * Detects which package manager(s) are in use per workspace, by lockfile presence only (no install/network).
 * @returns {{workspace: string, manager: string, lockfile: string}[]}
 */
function detectPackageManagers() {
  const managers = [];
  for (const workspace of ["", "frontend", "backend"]) {
    for (const [lockfile, manager] of PACKAGE_MANAGER_LOCKFILES) {
      const lockPath = path.join(root, workspace, lockfile);
      if (fs.existsSync(lockPath)) {
        managers.push({ workspace: workspace || "root", manager, lockfile: path.relative(root, lockPath).split(path.sep).join("/") });
      }
    }
  }
  return managers;
}

function allDeclaredDependencyNames(packages) {
  const names = new Set();
  for (const pkg of packages) {
    if (!pkg) continue;
    for (const name of Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })) names.add(name);
  }
  return names;
}

/**
 * Detects application frameworks/libraries by direct dependency-name lookup against a curated signature
 * list across every given package.json. No heuristic guessing beyond that lookup.
 * @param {(object|null)[]} packages parsed package.json contents (nulls are skipped)
 * @returns {string[]} human-readable framework labels
 */
function detectFrameworks(packages) {
  const names = allDeclaredDependencyNames(packages);
  return FRAMEWORK_SIGNATURES.filter((sig) => names.has(sig.dependency)).map((sig) => sig.label);
}

/**
 * Detects build/bundling/transpilation tooling by direct dependency-name lookup against a curated list.
 * @param {(object|null)[]} packages parsed package.json contents (nulls are skipped)
 * @returns {string[]} dependency names recognized as build tools
 */
function detectBuildTools(packages) {
  const names = allDeclaredDependencyNames(packages);
  return BUILD_TOOL_SIGNATURES.filter((name) => names.has(name));
}

/**
 * Lists notable directories up to a shallow depth under a fixed set of known top-level areas, skipping the
 * same ignored directories walkFiles() skips. Purely descriptive; not the autonomous agent's own context.
 * @param {number} maxDepth
 * @returns {string[]} sorted repository-relative directory paths
 */
function listImportantDirectories(maxDepth = 2) {
  const startingPoints = [".github", "backend", "frontend/src", "scripts", "docs", ".agent"];
  const results = [];
  function walk(startRel, depth) {
    const startAbs = path.join(root, startRel);
    if (!fs.existsSync(startAbs)) return;
    for (const entry of fs.readdirSync(startAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const rel = `${startRel}/${entry.name}`;
      if (isIgnoredDir(entry.name, rel)) continue;
      results.push(rel);
      if (depth < maxDepth) walk(rel, depth + 1);
    }
  }
  for (const start of startingPoints) walk(start, 1);
  return results.sort();
}

/**
 * Detects logical product modules (e.g. Authentication, Attendance, Faculty, Student, Admin, Reports) by
 * matching each module's keyword signature against backend/frontend source file paths and, failing a path
 * match, their contents. A filename match is reported as "strong" evidence, a content-only match as "weak"
 * evidence; each module reports the evidence files that triggered it (capped for readability).
 * @param {{relPath: string, absPath: string, ext: string}[]} files
 * @returns {{name: string, detected: boolean, confidence: "strong"|"weak"|"none", evidence: string[]}[]}
 */
function detectModules(files) {
  const sourceFiles = files.filter((file) => file.ext === ".js" && (file.relPath.startsWith("backend/") || file.relPath.startsWith("frontend/src/")));
  return Object.entries(MODULE_KEYWORDS).map(([name, keywords]) => {
    const pattern = new RegExp(keywords.join("|"), "i");
    const strongEvidence = new Set();
    const weakEvidence = new Set();
    for (const file of sourceFiles) {
      if (pattern.test(file.relPath)) {
        strongEvidence.add(file.relPath);
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(file.absPath, "utf8");
      } catch {
        continue;
      }
      if (pattern.test(content)) weakEvidence.add(file.relPath);
    }
    const confidence = strongEvidence.size > 0 ? "strong" : weakEvidence.size > 0 ? "weak" : "none";
    return { name, detected: confidence !== "none", confidence, evidence: [...strongEvidence, ...weakEvidence].slice(0, 10) };
  });
}

/**
 * Sums declared runtime + dev dependency counts per workspace package.json and overall.
 * @param {{[workspace: string]: object|null}} packages
 * @returns {{total: number, perWorkspace: {[workspace: string]: number}}}
 */
function computeDependencyCount(packages) {
  let total = 0;
  const perWorkspace = {};
  for (const [name, pkg] of Object.entries(packages)) {
    const count = pkg ? Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length : 0;
    perWorkspace[name] = count;
    total += count;
  }
  return { total, perWorkspace };
}

/**
 * Flags a small set of deterministic technical-debt signals: TODO/FIXME/HACK/XXX marker comments,
 * console.log/console.debug calls left in source, a placeholder (non-functional) backend test script, and
 * missing lint scripts per workspace. Every check is a literal, reproducible text/JSON inspection -- no AI.
 * @param {{relPath: string, absPath: string, ext: string}[]} files
 * @returns {{indicator: string, count: number, files?: string[]}[]}
 */
function findTechnicalDebtIndicators(files) {
  const indicators = [];
  let markerCount = 0;
  let consoleCallCount = 0;
  const markerFiles = new Set();
  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(file.ext)) continue;
    let content;
    try {
      content = fs.readFileSync(file.absPath, "utf8");
    } catch {
      continue;
    }
    const markers = content.match(DEBT_MARKER_PATTERN);
    if (markers) {
      markerCount += markers.length;
      markerFiles.add(file.relPath);
    }
    const consoleMatches = content.match(/console\.(log|debug)\(/g);
    if (consoleMatches) consoleCallCount += consoleMatches.length;
  }
  if (markerCount > 0) indicators.push({ indicator: "TODO/FIXME/HACK/XXX markers in source", count: markerCount, files: [...markerFiles].sort().slice(0, 10) });
  if (consoleCallCount > 0) indicators.push({ indicator: "console.log/console.debug calls in source", count: consoleCallCount });

  const backendPkg = readJsonSafe(path.join(root, "backend/package.json"));
  if (backendPkg && backendPkg.scripts && /no test specified/i.test(backendPkg.scripts.test || "")) {
    indicators.push({ indicator: "backend package.json has a placeholder (non-functional) test script", count: 1, files: ["backend/package.json"] });
  }
  for (const workspace of ["frontend", "backend"]) {
    const pkg = workspace === "backend" ? backendPkg : readJsonSafe(path.join(root, "frontend/package.json"));
    if (pkg && pkg.scripts && !pkg.scripts.lint) {
      indicators.push({ indicator: `${workspace} package.json declares no lint script`, count: 1, files: [`${workspace}/package.json`] });
    }
  }
  return indicators;
}

/**
 * Simple exact-duplicate heuristic: groups files by SHA-256 content hash and reports every group with more
 * than one member. Empty files are excluded (trivially "duplicate" and not useful signal).
 * @param {{relPath: string, absPath: string, size: number}[]} files
 * @returns {{sha256: string, files: string[]}[]} sorted by group size descending
 */
function findDuplicateCandidates(files) {
  const byHash = new Map();
  for (const file of files) {
    if (file.size === 0) continue;
    let hash;
    try {
      hash = crypto.createHash("sha256").update(fs.readFileSync(file.absPath)).digest("hex");
    } catch {
      continue;
    }
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(file.relPath);
  }
  const groups = [];
  for (const [hash, relPaths] of byHash.entries()) {
    if (relPaths.length > 1) groups.push({ sha256: hash, files: relPaths.sort() });
  }
  return groups.sort((a, b) => b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));
}

/**
 * Returns the largest files in the repository by byte size, descending.
 * @param {{relPath: string, size: number}[]} files
 * @param {number} limit
 * @returns {{path: string, bytes: number}[]}
 */
function findLargestFiles(files, limit = 15) {
  return [...files]
    .sort((a, b) => b.size - a.size || a.relPath.localeCompare(b.relPath))
    .slice(0, limit)
    .map((file) => ({ path: file.relPath, bytes: file.size }));
}

/**
 * Builds a short, template-generated (non-AI) prose summary of the already-computed analysis fields.
 * @param {object} analysis the in-progress analysis object (all fields except architectureSummary set)
 * @returns {string}
 */
function buildArchitectureSummary(analysis) {
  const parts = [];
  const topLanguages = analysis.languages.slice(0, 3).map((entry) => entry.language);
  parts.push(`${analysis.projectName} is a ${topLanguages.length ? topLanguages.join(", ") : "multi-language"} repository.`);
  if (analysis.frameworks.length) parts.push(`Detected frameworks/libraries: ${analysis.frameworks.join(", ")}.`);
  const managerNames = [...new Set(analysis.packageManagers.map((entry) => entry.manager))];
  if (managerNames.length) parts.push(`Package manager(s): ${managerNames.join(", ")}.`);
  const detectedModuleNames = analysis.detectedModules.filter((entry) => entry.detected).map((entry) => entry.name);
  if (detectedModuleNames.length) parts.push(`Detected product modules: ${detectedModuleNames.join(", ")}.`);
  parts.push(`${analysis.fileCount} file(s) across ${analysis.importantDirectories.length} tracked director(ies), ${analysis.dependencyCount.total} total declared dependencies.`);
  if (analysis.duplicateCandidates.length) parts.push(`${analysis.duplicateCandidates.length} exact-duplicate file group(s) detected.`);
  if (analysis.technicalDebtIndicators.length) parts.push(`${analysis.technicalDebtIndicators.length} technical-debt indicator(s) detected.`);
  return parts.join(" ");
}

/**
 * Runs every deterministic detector and assembles the complete Repository Intelligence analysis object.
 * This is the single entry point both the CLI and any other caller (e.g. tests) should use.
 * @returns {object} the full analysis, matching repository-analysis.json's shape
 */
function buildAnalysis() {
  const files = walkFiles();
  const frontendPkg = readJsonSafe(path.join(root, "frontend/package.json"));
  const backendPkg = readJsonSafe(path.join(root, "backend/package.json"));
  const packages = { frontend: frontendPkg, backend: backendPkg };

  const analysis = {
    projectName: detectProjectName(),
    languages: detectLanguages(files),
    frameworks: detectFrameworks([frontendPkg, backendPkg]),
    packageManagers: detectPackageManagers(),
    buildTools: detectBuildTools([frontendPkg, backendPkg]),
    importantDirectories: listImportantDirectories(),
    detectedModules: detectModules(files),
    dependencyCount: computeDependencyCount(packages),
    fileCount: files.length,
    technicalDebtIndicators: findTechnicalDebtIndicators(files),
    duplicateCandidates: findDuplicateCandidates(files),
    largestFiles: findLargestFiles(files),
    architectureSummary: "",
    timestamp: new Date().toISOString(),
  };
  analysis.architectureSummary = buildArchitectureSummary(analysis);
  return analysis;
}

/**
 * Renders the human-readable Markdown report for a given analysis object.
 * @param {object} analysis result of buildAnalysis()
 * @returns {string}
 */
function renderMarkdown(analysis) {
  const lines = [];
  lines.push("# Repository Intelligence Report", "");
  lines.push("Generated by `scripts/repository-intelligence.js` -- deterministic, no AI/LLM involved.", "");
  lines.push(`Timestamp: ${analysis.timestamp}`, "");
  lines.push("## Overview", "");
  lines.push(`- **Project name:** ${analysis.projectName}`);
  lines.push(`- **File count:** ${analysis.fileCount}`);
  lines.push(`- **Total declared dependencies:** ${analysis.dependencyCount.total}`);
  lines.push("");
  lines.push(analysis.architectureSummary, "");

  lines.push("## Languages", "", "| Language | Files |", "| --- | ---: |");
  analysis.languages.forEach((entry) => lines.push(`| ${entry.language} | ${entry.fileCount} |`));
  lines.push("");

  lines.push("## Frameworks", "");
  (analysis.frameworks.length ? analysis.frameworks : ["None detected"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Package managers", "");
  if (analysis.packageManagers.length) {
    analysis.packageManagers.forEach((entry) => lines.push(`- ${entry.manager} (\`${entry.lockfile}\`, workspace: ${entry.workspace})`));
  } else {
    lines.push("- None detected");
  }
  lines.push("");

  lines.push("## Build tools", "");
  (analysis.buildTools.length ? analysis.buildTools : ["None detected"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Important directories", "");
  analysis.importantDirectories.forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Detected modules", "", "| Module | Detected | Confidence | Evidence |", "| --- | --- | --- | --- |");
  analysis.detectedModules.forEach((entry) => {
    const evidence = entry.evidence.map((file) => `\`${file}\``).join(", ") || "-";
    lines.push(`| ${entry.name} | ${entry.detected ? "yes" : "no"} | ${entry.confidence} | ${evidence} |`);
  });
  lines.push("");

  lines.push("## Dependency counts", "", "| Workspace | Dependency count |", "| --- | ---: |");
  Object.entries(analysis.dependencyCount.perWorkspace).forEach(([workspace, count]) => lines.push(`| ${workspace} | ${count} |`));
  lines.push("");

  lines.push("## Technical debt indicators", "");
  if (analysis.technicalDebtIndicators.length) {
    analysis.technicalDebtIndicators.forEach((entry) => {
      const files = entry.files ? ` (${entry.files.map((file) => `\`${file}\``).join(", ")})` : "";
      lines.push(`- **${entry.indicator}:** ${entry.count}${files}`);
    });
  } else {
    lines.push("- None detected");
  }
  lines.push("");

  lines.push("## Duplicate file candidates", "");
  if (analysis.duplicateCandidates.length) {
    analysis.duplicateCandidates.forEach((group, index) => {
      lines.push(`${index + 1}. ${group.files.map((file) => `\`${file}\``).join(", ")} (sha256 \`${group.sha256.slice(0, 12)}...\`)`);
    });
  } else {
    lines.push("- None detected");
  }
  lines.push("");

  lines.push("## Largest files", "", "| File | Bytes |", "| --- | ---: |");
  analysis.largestFiles.forEach((entry) => lines.push(`| \`${entry.path}\` | ${entry.bytes} |`));
  lines.push("");

  return lines.join("\n");
}

/**
 * Writes repository-analysis.json and repository-analysis.md for the given analysis into the output
 * directory (created if needed), returning their absolute paths.
 * @param {object} analysis
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(analysis) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "repository-analysis.json");
  const mdPath = path.join(outputDir, "repository-analysis.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(analysis)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const analysis = buildAnalysis();
  const { jsonPath, mdPath } = writeOutputs(analysis);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
}

if (require.main === module) main();

module.exports = {
  root,
  outputDir,
  walkFiles,
  detectProjectName,
  detectLanguages,
  detectPackageManagers,
  detectFrameworks,
  detectBuildTools,
  listImportantDirectories,
  detectModules,
  computeDependencyCount,
  findTechnicalDebtIndicators,
  findDuplicateCandidates,
  findLargestFiles,
  buildArchitectureSummary,
  buildAnalysis,
  renderMarkdown,
  writeOutputs,
};
