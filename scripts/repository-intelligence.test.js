#!/usr/bin/env node
// Repository Intelligence v1 regression coverage: every deterministic detector produces the expected,
// reproducible result against a small synthetic fixture repository, and the end-to-end CLI produces both
// generated artifacts from a single command.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Builds a small synthetic fixture repository exercising every detector: known frameworks/build tools,
// one workspace with a lockfile and one without, module keyword signals (both filename and content-only
// matches, plus a deliberately absent "Reports" signal), a TODO marker, console.log calls, a placeholder
// backend test script, no lint scripts, an exact-duplicate file pair, and one clearly-largest file.
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-intel-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), source);

  writeJson(path.join(dir, "frontend/package.json"), {
    name: "frontend",
    dependencies: { react: "^19.0.0", "react-router-dom": "^7.0.0", "react-scripts": "5.0.1" },
    devDependencies: { tailwindcss: "^3.0.0" },
    scripts: { build: "react-scripts build" },
  });
  writeFile(path.join(dir, "frontend/package-lock.json"), "{}\n");

  writeJson(path.join(dir, "backend/package.json"), {
    name: "backend",
    dependencies: { express: "^5.0.0", mongoose: "^9.0.0" },
    devDependencies: {},
    scripts: { test: 'echo "Error: no test specified" && exit 1' },
  });
  // Deliberately no backend/package-lock.json: negative case for per-workspace package manager detection.

  writeFile(path.join(dir, "backend/routes/authRoutes.js"), "const jwt = require('jsonwebtoken');\nmodule.exports = {};\n");
  writeFile(path.join(dir, "backend/routes/attendanceRoutes.js"), "module.exports = {};\n");
  // No file path mentions student/faculty/admin -- these are only weak (content-only) signals.
  writeFile(path.join(dir, "backend/controllers/userController.js"), "// TODO: refactor this controller\n// role can be student, faculty, or admin\nconsole.log('debug value');\nconsole.debug('another');\nmodule.exports = {};\n");
  // No file or content anywhere mentions report/performance/analytics/stats: Reports must be undetected.

  writeFile(path.join(dir, "frontend/src/pages/Login.js"), "export default function Login() { return null; }\n");
  writeFile(path.join(dir, "frontend/src/App.js"), "duplicate-content\n");
  writeFile(path.join(dir, "frontend/src/AppCopy.js"), "duplicate-content\n");
  writeFile(path.join(dir, "frontend/src/Unique.js"), "unique-content\n");

  // Sized relative to the copied tool source itself (also part of the fixture, under scripts/) so this
  // remains the largest file regardless of how large repository-intelligence.js itself grows.
  writeFile(path.join(dir, "big.txt"), "x".repeat(source.length + 10000));
  writeFile(path.join(dir, "README.md"), "# Fixture\n");

  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/repository-intelligence.js"));
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. detectProjectName falls back to the directory basename when there is no root package.json or git remote.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const name = mod.detectProjectName();
  if (name !== path.basename(dir)) throw new Error(`expected project name to fall back to directory basename "${path.basename(dir)}", got "${name}"`);
  ok("detectProjectName falls back to the repository directory basename");
}

// 1b. detectProjectName prefers a root package.json's declared name when present.
{
  const dir = makeFixture();
  writeJson(path.join(dir, "package.json"), { name: "custom-project-name" });
  const mod = requireFixture(dir);
  const name = mod.detectProjectName();
  if (name !== "custom-project-name") throw new Error(`expected root package.json name to win, got "${name}"`);
  ok("detectProjectName prefers a root package.json name when present");
}

// 2. detectLanguages counts every fixture .js file (the module's own copied source, plus every backend/
//    frontend fixture file) and reports Markdown/JSON too, sorted by count descending.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const files = mod.walkFiles();
  const languages = mod.detectLanguages(files);
  const javascript = languages.find((entry) => entry.language === "JavaScript");
  const expectedJsCount = files.filter((file) => file.ext === ".js").length;
  if (!javascript || javascript.fileCount !== expectedJsCount) {
    throw new Error(`expected JavaScript fileCount ${expectedJsCount}, got ${javascript && javascript.fileCount}`);
  }
  if (!languages.find((entry) => entry.language === "Markdown")) throw new Error("expected Markdown to be detected from README.md");
  ok("detectLanguages counts files per language accurately");
}

// 3. detectFrameworks matches declared dependencies against the curated signature list, and only those.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const frameworks = mod.detectFrameworks([
    JSON.parse(fs.readFileSync(path.join(dir, "frontend/package.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(dir, "backend/package.json"), "utf8")),
  ]);
  for (const expected of ["React", "React Router", "Create React App", "Express", "Mongoose (MongoDB ODM)", "Tailwind CSS"]) {
    if (!frameworks.includes(expected)) throw new Error(`expected framework "${expected}" to be detected, got: ${frameworks.join(", ")}`);
  }
  if (frameworks.includes("Vue.js") || frameworks.includes("Next.js")) throw new Error(`expected no false-positive frameworks, got: ${frameworks.join(", ")}`);
  ok("detectFrameworks matches only declared dependency signatures");
}

// 4. detectPackageManagers reports npm for the workspace with a lockfile and omits the workspace without one.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const managers = mod.detectPackageManagers();
  const frontendEntry = managers.find((entry) => entry.workspace === "frontend");
  if (!frontendEntry || frontendEntry.manager !== "npm") throw new Error(`expected npm detected for frontend, got: ${JSON.stringify(managers)}`);
  if (managers.find((entry) => entry.workspace === "backend")) throw new Error(`expected no package manager detected for backend (no lockfile fixture), got: ${JSON.stringify(managers)}`);
  ok("detectPackageManagers reflects lockfile presence per workspace, including the negative case");
}

// 5. detectBuildTools matches declared build/tooling dependencies.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const buildTools = mod.detectBuildTools([
    JSON.parse(fs.readFileSync(path.join(dir, "frontend/package.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(dir, "backend/package.json"), "utf8")),
  ]);
  if (!buildTools.includes("react-scripts") || !buildTools.includes("tailwindcss")) {
    throw new Error(`expected react-scripts and tailwindcss detected as build tools, got: ${buildTools.join(", ")}`);
  }
  ok("detectBuildTools matches declared build tooling dependencies");
}

// 6. detectModules: filename matches are "strong", content-only matches are "weak", and a module with no
//    signal anywhere (Reports) is correctly reported as undetected.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const files = mod.walkFiles();
  const modules = mod.detectModules(files);
  const byName = Object.fromEntries(modules.map((entry) => [entry.name, entry]));

  if (!byName.Authentication.detected || byName.Authentication.confidence !== "strong") {
    throw new Error(`expected Authentication strongly detected (authRoutes.js filename), got: ${JSON.stringify(byName.Authentication)}`);
  }
  if (!byName.Attendance.detected || byName.Attendance.confidence !== "strong") {
    throw new Error(`expected Attendance strongly detected (attendanceRoutes.js filename), got: ${JSON.stringify(byName.Attendance)}`);
  }
  if (!byName.Student.detected || byName.Student.confidence !== "weak") {
    throw new Error(`expected Student weakly detected (content-only mention), got: ${JSON.stringify(byName.Student)}`);
  }
  if (!byName.Faculty.detected || byName.Faculty.confidence !== "weak") {
    throw new Error(`expected Faculty weakly detected (content-only mention), got: ${JSON.stringify(byName.Faculty)}`);
  }
  if (byName.Reports.detected || byName.Reports.confidence !== "none") {
    throw new Error(`expected Reports undetected (no signal anywhere in the fixture), got: ${JSON.stringify(byName.Reports)}`);
  }
  ok("detectModules distinguishes strong/weak/none confidence correctly, including a true negative");
}

// 7. computeDependencyCount sums runtime + dev dependencies per workspace and overall.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const counts = mod.computeDependencyCount({
    frontend: JSON.parse(fs.readFileSync(path.join(dir, "frontend/package.json"), "utf8")),
    backend: JSON.parse(fs.readFileSync(path.join(dir, "backend/package.json"), "utf8")),
  });
  if (counts.perWorkspace.frontend !== 4) throw new Error(`expected frontend dependency count 4 (3 deps + 1 devDep), got ${counts.perWorkspace.frontend}`);
  if (counts.perWorkspace.backend !== 2) throw new Error(`expected backend dependency count 2, got ${counts.perWorkspace.backend}`);
  if (counts.total !== 6) throw new Error(`expected total dependency count 6, got ${counts.total}`);
  ok("computeDependencyCount sums per-workspace and overall dependency counts correctly");
}

// 8. findTechnicalDebtIndicators detects the TODO marker, console calls, the placeholder backend test
//    script, and missing lint scripts in both workspaces.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const files = mod.walkFiles();
  const indicators = mod.findTechnicalDebtIndicators(files);
  const markerEntry = indicators.find((entry) => /TODO/.test(entry.indicator));
  if (!markerEntry || markerEntry.count < 1 || !markerEntry.files.includes("backend/controllers/userController.js")) {
    throw new Error(`expected a TODO marker indicator naming userController.js, got: ${JSON.stringify(markerEntry)}`);
  }
  // The fixture's scripts/ directory always contains a full copy of repository-intelligence.js itself
  // (see makeFixture()), whose own main() legitimately calls console.log(...) twice -- so the expected
  // total is those 2 plus the 2 in userController.js (console.log + console.debug), not just the latter.
  const consoleEntry = indicators.find((entry) => /console\.log/.test(entry.indicator));
  if (!consoleEntry || consoleEntry.count !== 4) throw new Error(`expected 4 console.log/debug calls detected (2 from the copied tool source + 2 from the fixture), got: ${JSON.stringify(consoleEntry)}`);
  if (!indicators.find((entry) => /placeholder/.test(entry.indicator))) throw new Error("expected the backend placeholder test script to be flagged");
  if (!indicators.find((entry) => entry.indicator === "frontend package.json declares no lint script")) throw new Error("expected frontend missing lint script to be flagged");
  if (!indicators.find((entry) => entry.indicator === "backend package.json declares no lint script")) throw new Error("expected backend missing lint script to be flagged");
  ok("findTechnicalDebtIndicators detects TODO markers, console calls, placeholder tests, and missing lint scripts");
}

// 9. findDuplicateCandidates groups byte-identical files and leaves unique content ungrouped.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const files = mod.walkFiles();
  const groups = mod.findDuplicateCandidates(files);
  if (groups.length !== 1) throw new Error(`expected exactly one duplicate group, got ${groups.length}: ${JSON.stringify(groups)}`);
  const expected = ["frontend/src/App.js", "frontend/src/AppCopy.js"].sort();
  if (JSON.stringify(groups[0].files) !== JSON.stringify(expected)) {
    throw new Error(`expected duplicate group ${JSON.stringify(expected)}, got ${JSON.stringify(groups[0].files)}`);
  }
  if (groups.some((group) => group.files.includes("frontend/src/Unique.js"))) throw new Error("unique-content file must not appear in any duplicate group");
  ok("findDuplicateCandidates groups only byte-identical files");
}

// 10. findLargestFiles ranks by size descending, with the fixture's deliberately large file first.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const files = mod.walkFiles();
  const largest = mod.findLargestFiles(files, 5);
  const expectedBytes = source.length + 10000;
  if (largest[0].path !== "big.txt" || largest[0].bytes !== expectedBytes) {
    throw new Error(`expected big.txt (${expectedBytes} bytes) to rank first, got: ${JSON.stringify(largest[0])}`);
  }
  ok("findLargestFiles ranks the largest fixture file first");
}

// 11. buildAnalysis() assembles a complete analysis object with every field the spec requires, and
//     writeOutputs()/the CLI produce both generated files from a single command.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const analysis = mod.buildAnalysis();
  for (const key of [
    "projectName", "languages", "frameworks", "packageManagers", "buildTools", "importantDirectories",
    "detectedModules", "dependencyCount", "fileCount", "technicalDebtIndicators", "duplicateCandidates",
    "largestFiles", "architectureSummary", "timestamp",
  ]) {
    if (!(key in analysis)) throw new Error(`analysis is missing required field: ${key}`);
  }
  if (typeof analysis.architectureSummary !== "string" || !analysis.architectureSummary.length) {
    throw new Error("architectureSummary must be a non-empty generated string");
  }
  if (Number.isNaN(Date.parse(analysis.timestamp))) throw new Error(`timestamp must be a parseable date, got: ${analysis.timestamp}`);

  const { jsonPath, mdPath } = mod.writeOutputs(analysis);
  if (path.basename(jsonPath) !== "repository-analysis.json") throw new Error(`expected output file named repository-analysis.json, got ${jsonPath}`);
  if (path.basename(mdPath) !== "repository-analysis.md") throw new Error(`expected output file named repository-analysis.md, got ${mdPath}`);
  const persisted = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (persisted.projectName !== analysis.projectName) throw new Error("persisted JSON does not match the in-memory analysis");
  const markdown = fs.readFileSync(mdPath, "utf8");
  if (!markdown.includes("# Repository Intelligence Report")) throw new Error("markdown output is missing its expected title");
  if (!markdown.includes(analysis.projectName)) throw new Error("markdown output must mention the project name");
  ok("buildAnalysis produces every required field and writeOutputs persists both artifacts correctly");
}

// 12. The output directory can be overridden via REPO_INTEL_OUTPUT_DIR, and defaults to
//     `repository-intelligence/` at the repository root otherwise.
{
  const dir = makeFixture();
  const previousEnv = process.env.REPO_INTEL_OUTPUT_DIR;
  process.env.REPO_INTEL_OUTPUT_DIR = "custom-output/nested";
  try {
    const mod = requireFixture(dir);
    if (mod.outputDir !== path.join(dir, "custom-output", "nested")) {
      throw new Error(`expected overridden output directory, got: ${mod.outputDir}`);
    }
    const { jsonPath } = mod.writeOutputs(mod.buildAnalysis());
    if (!fs.existsSync(jsonPath)) throw new Error("expected repository-analysis.json to exist under the overridden output directory");
  } finally {
    if (previousEnv === undefined) delete process.env.REPO_INTEL_OUTPUT_DIR;
    else process.env.REPO_INTEL_OUTPUT_DIR = previousEnv;
  }
  ok("REPO_INTEL_OUTPUT_DIR overrides the default output directory");
}

// 13. End-to-end CLI: a single `node scripts/repository-intelligence.js` command produces both artifacts.
{
  const dir = makeFixture();
  const result = spawnSync("node", ["scripts/repository-intelligence.js"], { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`CLI run failed:\nSTDOUT:${result.stdout}\nSTDERR:${result.stderr}`);
  const jsonPath = path.join(dir, "repository-intelligence", "repository-analysis.json");
  const mdPath = path.join(dir, "repository-intelligence", "repository-analysis.md");
  if (!fs.existsSync(jsonPath)) throw new Error("expected repository-analysis.json to be produced by the CLI");
  if (!fs.existsSync(mdPath)) throw new Error("expected repository-analysis.md to be produced by the CLI");
  JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  ok("a single CLI command produces both repository-analysis.json and repository-analysis.md");
}

console.log("All Repository Intelligence v1 regression scenarios passed.");
