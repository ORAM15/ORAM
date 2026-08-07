#!/usr/bin/env node
// Engineering Knowledge Engine v1
//
// A deterministic (no AI/LLM/network) engine that consumes the existing
// repository-intelligence/repository-analysis.json (Repository Intelligence v1) and converts its raw,
// structural facts into engineering concepts per detected module: business purpose, backend/frontend
// ownership, related files/dependencies, cross-module coupling, business criticality, architectural
// importance, estimated complexity, and estimated maintenance risk.
//
// Run with:   node scripts/engineering-knowledge.js
// Input path defaults to repository-intelligence/repository-analysis.json; override with
// REPO_INTEL_ANALYSIS_PATH (relative to the repository root, or absolute).
// Output dir defaults to `engineering-knowledge/` at the repository root; override with
// ENGINEERING_KNOWLEDGE_OUTPUT_DIR (relative to the repository root, or absolute).
//
// This engine never re-walks the repository, re-parses package.json files, or otherwise duplicates
// Repository Intelligence's own detection work -- repository-analysis.json is its one and only source of
// repository facts. Business purpose and baseline criticality per module name are the only content not
// mechanically derived from that file: they are a small, static, human-curated domain knowledge table
// (see PURPOSE_MAP / CRITICALITY_BASELINE below), because repository-analysis.json has no semantic
// "business purpose" field to derive one from. Everything else (layer, related files/dependencies,
// coupling, complexity, importance, and the confidence/debt-driven risk adjustment) is computed only from
// fields already present in repository-analysis.json.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(root, process.env.REPO_INTEL_ANALYSIS_PATH || "repository-intelligence/repository-analysis.json");
const outputDir = path.resolve(root, process.env.ENGINEERING_KNOWLEDGE_OUTPUT_DIR || "engineering-knowledge");

// Curated, static domain knowledge: what each recognized module conceptually exists to do, and its
// baseline business criticality before any per-repository confidence adjustment. Not derived from
// repository-analysis.json (it carries no semantic field for this); every other module field below is.
const PURPOSE_MAP = {
  Authentication: "Verifies user identity and manages login/session state so only authorized users reach protected functionality.",
  Attendance: "Tracks and reports attendance records, a core academic-tracking responsibility of the product.",
  Faculty: "Supports faculty/teacher-facing functionality such as managing academic records and content.",
  Student: "Supports student-facing functionality such as viewing personal academic records and submissions.",
  Admin: "Supports administrative oversight and management functionality.",
  Reports: "Aggregates and presents academic/performance data for review and decision-making.",
};
const CRITICALITY_BASELINE = {
  Authentication: "High",
  Attendance: "High",
  Faculty: "Medium",
  Student: "Medium",
  Admin: "Medium",
  Reports: "Medium",
};
const CRITICALITY_LEVELS = ["Low", "Medium", "High"];

// Which layer a globally-detected framework belongs to, and the human-facing concept label to report it
// as (only applied to a module when that module's own layer matches, so a purely-backend module never gets
// credited with a frontend framework and vice versa).
const FRAMEWORK_LAYER = {
  React: "Frontend",
  "React Router": "Frontend",
  "Create React App": "Frontend",
  "Tailwind CSS": "Frontend",
  Express: "Backend",
  "Mongoose (MongoDB ODM)": "Backend",
};
const FRAMEWORK_CONCEPT_LABEL = {
  "Mongoose (MongoDB ODM)": "MongoDB",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and parses repository-analysis.json (Repository Intelligence v1's output). Fails closed with a
 * clear, actionable error if the file is missing or not valid JSON -- this engine never silently
 * regenerates or guesses at repository facts on its own.
 * @param {string} file absolute path to repository-analysis.json
 * @returns {object} the parsed analysis
 */
function loadRepositoryAnalysis(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`repository-analysis.json not found at ${path.relative(root, file)}. Run \`node scripts/repository-intelligence.js\` first (or set REPO_INTEL_ANALYSIS_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`repository-analysis.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Classifies which layer(s) of the application a module's related files belong to, purely from the
 * "backend/" or "frontend/" prefix already present in repository-analysis.json's evidence paths.
 * @param {string[]} evidence relative file paths
 * @returns {"Backend"|"Frontend"|"Full-stack"|"Unknown"}
 */
function classifyLayer(evidence) {
  const hasBackend = evidence.some((file) => file.startsWith("backend/"));
  const hasFrontend = evidence.some((file) => file.startsWith("frontend/"));
  if (hasBackend && hasFrontend) return "Full-stack";
  if (hasBackend) return "Backend";
  if (hasFrontend) return "Frontend";
  return "Unknown";
}

/**
 * Derives related-dependency concepts for a module from two grounded, deterministic signals already in
 * repository-analysis.json: (1) repo-wide detected frameworks whose own layer matches this module's layer
 * (Full-stack modules receive both), normalized to a shorter concept label where one is defined; and
 * (2) Mongoose/Mongo-style model file names found among the module's own evidence (e.g.
 * backend/models/User.js -> "User"), which are genuine related data-model dependencies.
 * @param {string} moduleName excluded from the result if a same-named model file would otherwise add it
 *   as its own dependency (e.g. the Attendance module "depending on" a concept literally called Attendance)
 * @param {string} layer this module's classifyLayer() result
 * @param {string[]} evidence this module's related file paths
 * @param {string[]} frameworks repository-analysis.json's repo-wide frameworks list
 * @returns {string[]} sorted, de-duplicated dependency concept labels
 */
function deriveRelatedDependencies(moduleName, layer, evidence, frameworks) {
  const concepts = new Set();
  for (const framework of frameworks) {
    const frameworkLayer = FRAMEWORK_LAYER[framework];
    if (!frameworkLayer) continue;
    if (layer === "Full-stack" || layer === frameworkLayer) concepts.add(FRAMEWORK_CONCEPT_LABEL[framework] || framework);
  }
  for (const file of evidence) {
    const match = file.match(/\/models\/([A-Za-z0-9_]+)\.js$/);
    if (match && match[1] !== moduleName) concepts.add(match[1]);
  }
  return [...concepts].sort();
}

/**
 * Finds other detected modules that share at least one related file with this one -- a direct, grounded
 * measure of cross-module coupling using only repository-analysis.json's evidence arrays.
 * @param {string} moduleName
 * @param {string[]} evidence
 * @param {{name: string, detected: boolean, evidence: string[]}[]} allModules every module in the analysis
 * @returns {string[]} sorted other module names sharing at least one file
 */
function findCoupledModules(moduleName, evidence, allModules) {
  const evidenceSet = new Set(evidence);
  const coupled = [];
  for (const other of allModules) {
    if (other.name === moduleName || !other.detected) continue;
    if ((other.evidence || []).some((file) => evidenceSet.has(file))) coupled.push(other.name);
  }
  return coupled.sort();
}

function bucketize(count, { high, medium }) {
  if (count >= high) return "High";
  if (count >= medium) return "Medium";
  if (count >= 1) return "Low";
  return "Not applicable";
}

/**
 * Estimates implementation complexity from how many related files a module touches. Note: Repository
 * Intelligence v1 caps each module's evidence at 10 files, so this bucketing saturates at "High" for any
 * well-evidenced module -- a disclosed limitation of the upstream cap, not something this engine can see
 * past without re-walking the repository itself (which it deliberately does not do).
 * @param {string[]} evidence
 * @returns {"Low"|"Medium"|"High"|"Not applicable"}
 */
function estimateComplexity(evidence) {
  return bucketize(evidence.length, { high: 8, medium: 4 });
}

/**
 * Estimates architectural importance from how many of a module's related files sit in the backend
 * (routes/controllers/models are core architecture; frontend pages are comparatively presentation-layer).
 * @param {string[]} evidence
 * @returns {"Low"|"Medium"|"High"|"Not applicable"}
 */
function estimateArchitecturalImportance(evidence) {
  const backendCount = evidence.filter((file) => file.startsWith("backend/")).length;
  return bucketize(backendCount, { high: 5, medium: 2 });
}

/**
 * Deterministically adjusts a module's static baseline criticality by its own detection confidence:
 * "strong" evidence keeps the curated baseline, "weak" (content-only) evidence downgrades it one level
 * (less certain the module genuinely exists as scoped), and "none" means the module was not detected at
 * all in this repository.
 * @param {string} moduleName
 * @param {"strong"|"weak"|"none"} confidence
 * @returns {"Low"|"Medium"|"High"|"Not applicable"}
 */
function estimateCriticality(moduleName, confidence) {
  const baseline = CRITICALITY_BASELINE[moduleName] || "Medium";
  if (confidence === "none") return "Not applicable";
  if (confidence === "weak") {
    const index = CRITICALITY_LEVELS.indexOf(baseline);
    return CRITICALITY_LEVELS[Math.max(index - 1, 0)];
  }
  return baseline;
}

/**
 * Estimates maintenance risk from three grounded signals already available per module: weak (uncertain)
 * detection confidence, coupling with two or more other modules (a change here is more likely to have
 * cross-module blast radius), and overlap with repository-analysis.json's own technicalDebtIndicators file
 * lists (e.g. a TODO/FIXME marker inside one of this module's related files).
 * @param {"strong"|"weak"|"none"} confidence
 * @param {string[]} coupledModules
 * @param {string[]} evidence
 * @param {{files?: string[]}[]} technicalDebtIndicators repository-analysis.json's indicator list
 * @returns {"Low"|"Medium"|"High"|"Not applicable"}
 */
function estimateMaintenanceRisk(confidence, coupledModules, evidence, technicalDebtIndicators) {
  if (confidence === "none") return "Not applicable";
  let score = confidence === "weak" ? 1 : 0;
  score += coupledModules.length >= 2 ? 1 : 0;
  const debtFiles = new Set();
  for (const indicator of technicalDebtIndicators) for (const file of indicator.files || []) debtFiles.add(file);
  if (evidence.some((file) => debtFiles.has(file))) score += 1;
  if (score >= 2) return "High";
  if (score === 1) return "Medium";
  return "Low";
}

/**
 * Assembles the complete engineering-knowledge record for a single detected-module entry from
 * repository-analysis.json.
 * @param {{name: string, detected: boolean, confidence: string, evidence: string[]}} module
 * @param {object} analysis the full parsed repository-analysis.json
 * @param {object[]} allModules repository-analysis.json's full detectedModules array (for coupling)
 * @returns {object}
 */
function buildModuleKnowledge(module, analysis, allModules) {
  const evidence = module.evidence || [];
  const layer = module.detected ? classifyLayer(evidence) : "Not applicable";
  const relatedDependencies = module.detected ? deriveRelatedDependencies(module.name, layer, evidence, analysis.frameworks || []) : [];
  const coupledModules = module.detected ? findCoupledModules(module.name, evidence, allModules) : [];
  return {
    name: module.name,
    detected: module.detected,
    detectionConfidence: module.confidence,
    businessPurpose: PURPOSE_MAP[module.name] || "Purpose not curated for this module.",
    layer,
    relatedFiles: evidence,
    relatedDependencies,
    coupledModules,
    businessCriticality: estimateCriticality(module.name, module.confidence),
    architecturalImportance: module.detected ? estimateArchitecturalImportance(evidence) : "Not applicable",
    estimatedComplexity: module.detected ? estimateComplexity(evidence) : "Not applicable",
    estimatedMaintenanceRisk: estimateMaintenanceRisk(module.confidence, coupledModules, evidence, analysis.technicalDebtIndicators || []),
  };
}

/**
 * Runs every module through buildModuleKnowledge() and assembles the complete engineering-knowledge
 * document. This is the single entry point both the CLI and any other caller (e.g. tests) should use.
 * @param {object} analysis the full parsed repository-analysis.json
 * @returns {object} matching engineering-knowledge.json's shape
 */
function buildKnowledge(analysis) {
  const allModules = analysis.detectedModules || [];
  return {
    generatedFrom: path.relative(root, inputPath).split(path.sep).join("/"),
    sourceProjectName: analysis.projectName,
    sourceTimestamp: analysis.timestamp,
    modules: allModules.map((module) => buildModuleKnowledge(module, analysis, allModules)),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Renders the human-readable Markdown report for a given engineering-knowledge object.
 * @param {object} knowledge result of buildKnowledge()
 * @returns {string}
 */
function renderMarkdown(knowledge) {
  const lines = [];
  lines.push("# Engineering Knowledge Report", "");
  lines.push("Generated by `scripts/engineering-knowledge.js` -- deterministic, no AI/LLM involved.", "");
  lines.push(`Source: \`${knowledge.generatedFrom}\` (project: ${knowledge.sourceProjectName}, generated ${knowledge.sourceTimestamp})`, "");
  lines.push(`Timestamp: ${knowledge.timestamp}`, "");

  for (const module of knowledge.modules) {
    lines.push(`## ${module.name}`, "");
    if (!module.detected) {
      lines.push(`Not detected in this repository (confidence: ${module.detectionConfidence}). No further engineering knowledge could be derived.`, "");
      continue;
    }
    lines.push(`**Purpose:** ${module.businessPurpose}`, "");
    lines.push(`**Criticality:** ${module.businessCriticality}`, "");
    lines.push(`**Layer:** ${module.layer}`, "");
    lines.push(`**Architectural importance:** ${module.architecturalImportance}`, "");
    lines.push(`**Estimated complexity:** ${module.estimatedComplexity}`, "");
    lines.push(`**Estimated maintenance risk:** ${module.estimatedMaintenanceRisk}`, "");
    lines.push(`**Detection confidence:** ${module.detectionConfidence}`, "");
    lines.push("**Dependencies:**", "");
    (module.relatedDependencies.length ? module.relatedDependencies : ["None derived"]).forEach((dep) => lines.push(`- ${dep}`));
    lines.push("");
    lines.push("**Coupled modules:**", "");
    (module.coupledModules.length ? module.coupledModules : ["None"]).forEach((name) => lines.push(`- ${name}`));
    lines.push("");
    lines.push("**Related files:**", "");
    module.relatedFiles.forEach((file) => lines.push(`- \`${file}\``));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Writes engineering-knowledge.json and engineering-knowledge.md into the output directory (created if
 * needed), returning their absolute paths.
 * @param {object} knowledge
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(knowledge) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "engineering-knowledge.json");
  const mdPath = path.join(outputDir, "engineering-knowledge.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(knowledge, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(knowledge)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const analysis = loadRepositoryAnalysis(inputPath);
  const knowledge = buildKnowledge(analysis);
  const { jsonPath, mdPath } = writeOutputs(knowledge);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  root,
  inputPath,
  outputDir,
  loadRepositoryAnalysis,
  classifyLayer,
  deriveRelatedDependencies,
  findCoupledModules,
  estimateComplexity,
  estimateArchitecturalImportance,
  estimateCriticality,
  estimateMaintenanceRisk,
  buildModuleKnowledge,
  buildKnowledge,
  renderMarkdown,
  writeOutputs,
};
