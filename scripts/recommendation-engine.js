#!/usr/bin/env node
// Recommendation Engine v1
//
// A deterministic (no AI/LLM/network/repository-scanning) engine that reads
// engineering-knowledge/engineering-knowledge.json (Engineering Knowledge Engine v1's output) and produces
// structured, ranked engineering recommendations. It never implements anything -- it only recommends.
//
// Run with:   node scripts/recommendation-engine.js
// Input path defaults to engineering-knowledge/engineering-knowledge.json; override with
// ENGINEERING_KNOWLEDGE_PATH (relative to the repository root, or absolute).
// Output dir defaults to `recommendations/` at the repository root; override with
// RECOMMENDATIONS_OUTPUT_DIR (relative to the repository root, or absolute).
//
// engineering-knowledge.json is this engine's one and only input. Every recommendation, and every field on
// it (reason, affected modules/files, size, risk, impact, confidence, priority score), is derived only from
// fields already present there -- this engine never re-reads repository-analysis.json, never reads
// package.json, never parses source code, and never re-walks the repository. See RULES below for the full
// deterministic rule set, and computeModuleScore() for the documented priority-scoring formula.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(root, process.env.ENGINEERING_KNOWLEDGE_PATH || "engineering-knowledge/engineering-knowledge.json");
const outputDir = path.resolve(root, process.env.RECOMMENDATIONS_OUTPUT_DIR || "recommendations");

const LEVEL_WEIGHT = { "Not applicable": 0, Low: 1, Medium: 2, High: 3 };
const CONFIDENCE_BASE = { strong: 70, weak: 50 };
const CONFIDENCE_PER_REASON = 8;

const SCORING_FORMULA_DESCRIPTION =
  "priorityScore = round(((criticality*3 + importance*2 + risk*3 + complexity*2 + min(coupledModuleCount,3)*1) / 33) * 100), " +
  "where each factor is the module's own engineering-knowledge.json field (Low=1, Medium=2, High=3, \"Not applicable\"=0) " +
  "and 33 is the maximum possible raw score. Business criticality and maintenance risk are weighted x3 (most directly " +
  "determine who is impacted and how urgently), architectural importance and complexity are weighted x2, and coupling " +
  "breadth is weighted x1 and capped at 3 module(s) so it cannot dominate the score alone. All recommendations for the " +
  "same module share this one score, since priority reflects how much attention the module warrants, not which " +
  "specific fix is proposed.";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and parses engineering-knowledge.json. Fails closed with a clear, actionable error if the file is
 * missing or not valid JSON -- this engine never silently regenerates or guesses at engineering facts.
 * @param {string} file absolute path to engineering-knowledge.json
 * @returns {object} the parsed engineering-knowledge document
 */
function loadEngineeringKnowledge(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`engineering-knowledge.json not found at ${path.relative(root, file)}. Run \`node scripts/engineering-knowledge.js\` first (or set ENGINEERING_KNOWLEDGE_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`engineering-knowledge.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Computes a module's deterministic 0-100 priority score. See SCORING_FORMULA_DESCRIPTION for the full
 * documented formula; this is the single implementation of it, shared by every recommendation on a module.
 * @param {{businessCriticality: string, architecturalImportance: string, estimatedMaintenanceRisk: string, estimatedComplexity: string, coupledModules: string[]}} module
 * @returns {number} 0-100
 */
function computeModuleScore(module) {
  const raw =
    LEVEL_WEIGHT[module.businessCriticality] * 3 +
    LEVEL_WEIGHT[module.architecturalImportance] * 2 +
    LEVEL_WEIGHT[module.estimatedMaintenanceRisk] * 3 +
    LEVEL_WEIGHT[module.estimatedComplexity] * 2 +
    Math.min(module.coupledModules.length, 3) * 1;
  return Math.round((raw / 33) * 100);
}

/**
 * Computes a recommendation's own 0-100 confidence score -- distinct from the module's strong/weak
 * detectionConfidence. A documented base per detection-confidence level, plus 8 points per corroborating
 * reason the recommendation cites (more independently-verifiable facts backing it raises confidence),
 * capped at 100.
 * @param {"strong"|"weak"} detectionConfidence the module's own detectionConfidence
 * @param {number} reasonCount how many reason strings the recommendation cites
 * @returns {number} 0-100
 */
function computeConfidence(detectionConfidence, reasonCount) {
  const base = CONFIDENCE_BASE[detectionConfidence] ?? 50;
  return Math.min(100, base + reasonCount * CONFIDENCE_PER_REASON);
}

/**
 * Estimates business impact from businessCriticality + architecturalImportance alone (both already on the
 * module in engineering-knowledge.json).
 * @param {string} criticality
 * @param {string} importance
 * @returns {"Low"|"Medium"|"High"}
 */
function estimateImpact(criticality, importance) {
  const weight = LEVEL_WEIGHT[criticality] + LEVEL_WEIGHT[importance];
  if (weight >= 5) return "High";
  if (weight >= 3) return "Medium";
  return "Low";
}

// RULES: each rule is a pure function of one module's engineering-knowledge.json fields (plus a name-keyed
// lookup of every other module, for coupling-aware rules). `trigger` decides whether the rule fires for a
// given module; `build` returns the recommendation's title/description/reason/affectedModules/
// affectedFiles/size/risk. Every value `build` returns must trace back to a field already on the module (or
// a sibling module already listed in its coupledModules) -- no rule may introduce a fact not present in
// engineering-knowledge.json. Impact and priority score are computed uniformly outside the rule (see
// estimateImpact()/computeModuleScore()), not per-rule, so they stay consistent across every recommendation
// for the same module.
const RULES = [
  {
    key: "extract-complex-logic",
    trigger: (module) => module.estimatedComplexity === "High" && ["Medium", "High"].includes(module.estimatedMaintenanceRisk),
    build: (module) => ({
      title: `Extract ${module.name} logic into smaller units`,
      description: `${module.name} has grown complex and carries maintenance risk. Extracting focused, independently testable units (e.g. validation, data-shaping, or business-rule logic) out of its largest related files would reduce complexity without changing behavior.`,
      reason: [
        `${module.name} has ${module.estimatedComplexity} complexity`,
        `${module.estimatedMaintenanceRisk} maintenance risk`,
        `Touches ${module.relatedFiles.length} related file(s)`,
      ],
      affectedModules: [module.name],
      affectedFiles: module.relatedFiles,
      estimatedImplementationSize: "Small",
      estimatedRisk: module.estimatedMaintenanceRisk === "High" ? "Medium" : "Low",
    }),
  },
  {
    key: "reduce-coupling",
    trigger: (module) => module.architecturalImportance === "High" && module.coupledModules.length >= 2,
    build: (module, byName) => {
      const moduleFiles = new Set(module.relatedFiles);
      const sharedFiles = new Set();
      for (const coupledName of module.coupledModules) {
        const coupled = byName[coupledName];
        if (!coupled) continue;
        for (const file of coupled.relatedFiles) if (moduleFiles.has(file)) sharedFiles.add(file);
      }
      return {
        title: `Reduce cross-module coupling for ${module.name}`,
        description: `${module.name} is architecturally important and shares related files with ${module.coupledModules.length} other module(s) (${module.coupledModules.join(", ")}). Clarifying ownership boundaries or extracting the shared logic into a dedicated module would reduce the risk of unrelated changes affecting ${module.name}.`,
        reason: [
          `${module.name} has ${module.architecturalImportance} architectural importance`,
          `Coupled with ${module.coupledModules.length} other module(s): ${module.coupledModules.join(", ")}`,
        ],
        affectedModules: [module.name, ...module.coupledModules],
        affectedFiles: [...sharedFiles].sort(),
        estimatedImplementationSize: "Medium",
        estimatedRisk: module.estimatedMaintenanceRisk === "High" ? "High" : "Medium",
      };
    },
  },
  {
    key: "address-maintenance-risk",
    trigger: (module) => module.estimatedMaintenanceRisk === "High",
    build: (module) => ({
      title: `Pay down maintenance risk in ${module.name}`,
      description: `${module.name} has been flagged as High maintenance risk. Reviewing its related files for outstanding technical-debt markers and untested paths would reduce the chance of regressions.`,
      reason: [`${module.name} has High maintenance risk`, `Business criticality: ${module.businessCriticality}`],
      affectedModules: [module.name],
      affectedFiles: module.relatedFiles,
      estimatedImplementationSize: "Medium",
      estimatedRisk: "Medium",
    }),
  },
  {
    key: "strengthen-detection-coverage",
    trigger: (module) => module.detectionConfidence === "weak" && ["High", "Medium"].includes(module.businessCriticality),
    build: (module) => ({
      title: `Strengthen ownership clarity for ${module.name}`,
      description: `${module.name} was only weakly detected (matched by file content, not by dedicated file names) despite carrying ${module.businessCriticality} business criticality. Giving it clearer, dedicated files/naming (or adding focused tests) would make its scope and ownership easier to verify.`,
      reason: [`${module.name} was detected with weak confidence`, `Business criticality: ${module.businessCriticality}`],
      affectedModules: [module.name],
      affectedFiles: module.relatedFiles,
      estimatedImplementationSize: "Small",
      estimatedRisk: "Low",
    }),
  },
];

/**
 * Runs every rule against every detected module in engineering-knowledge.json and returns the full,
 * unsorted recommendation list. Each recommendation gets a stable sequential id assigned in generation
 * order (module order from engineering-knowledge.json, then RULES order above) -- ids are identifiers, not
 * rank, so callers must not rely on them reflecting priority order.
 * @param {object} knowledge parsed engineering-knowledge.json
 * @returns {object[]} unsorted recommendation objects
 */
function generateRecommendations(knowledge) {
  const modules = knowledge.modules || [];
  const byName = Object.fromEntries(modules.map((module) => [module.name, module]));
  const recommendations = [];
  let nextId = 1;
  for (const module of modules) {
    if (!module.detected) continue;
    for (const rule of RULES) {
      if (!rule.trigger(module)) continue;
      const built = rule.build(module, byName);
      recommendations.push({
        id: nextId++,
        ruleKey: rule.key,
        title: built.title,
        description: built.description,
        reason: built.reason,
        affectedModules: built.affectedModules,
        affectedFiles: built.affectedFiles,
        estimatedImplementationSize: built.estimatedImplementationSize,
        estimatedRisk: built.estimatedRisk,
        estimatedImpact: estimateImpact(module.businessCriticality, module.architecturalImportance),
        confidence: computeConfidence(module.detectionConfidence, built.reason.length),
        priorityScore: computeModuleScore(module),
      });
    }
  }
  return recommendations;
}

/**
 * Builds the complete recommendations document: every recommendation from generateRecommendations(),
 * sorted by descending priority (ties broken by descending confidence, then ascending id for full
 * determinism), plus source/scoring metadata. This is the single entry point both the CLI and any other
 * caller (e.g. tests) should use.
 * @param {object} knowledge parsed engineering-knowledge.json
 * @returns {object} matching recommendations.json's shape
 */
function buildRecommendationsReport(knowledge) {
  const recommendations = generateRecommendations(knowledge).sort(
    (a, b) => b.priorityScore - a.priorityScore || b.confidence - a.confidence || a.id - b.id
  );
  return {
    generatedFrom: path.relative(root, inputPath).split(path.sep).join("/"),
    sourceProjectName: knowledge.sourceProjectName,
    sourceTimestamp: knowledge.sourceTimestamp,
    scoringFormula: SCORING_FORMULA_DESCRIPTION,
    recommendations,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Renders the human-readable Markdown report for a given recommendations document.
 * @param {object} report result of buildRecommendationsReport()
 * @returns {string}
 */
function renderMarkdown(report) {
  const lines = [];
  lines.push("# Engineering Recommendations Report", "");
  lines.push("Generated by `scripts/recommendation-engine.js` -- deterministic, no AI/LLM involved. This engine only recommends; it never implements anything.", "");
  lines.push(`Source: \`${report.generatedFrom}\` (project: ${report.sourceProjectName}, generated ${report.sourceTimestamp})`, "");
  lines.push(`Timestamp: ${report.timestamp}`, "");
  lines.push("## Scoring formula", "");
  lines.push(report.scoringFormula, "");
  lines.push(`## Recommendations (${report.recommendations.length}, sorted by descending priority)`, "");
  if (!report.recommendations.length) {
    lines.push("No recommendations were triggered by the current engineering-knowledge.json.", "");
  }
  report.recommendations.forEach((rec) => {
    lines.push(`### ${rec.id}. ${rec.title}`, "");
    lines.push(rec.description, "");
    lines.push(`**Priority score:** ${rec.priorityScore} | **Confidence:** ${rec.confidence} | **Impact:** ${rec.estimatedImpact} | **Risk:** ${rec.estimatedRisk} | **Size:** ${rec.estimatedImplementationSize}`, "");
    lines.push("**Reason:**", "");
    rec.reason.forEach((entry) => lines.push(`- ${entry}`));
    lines.push("");
    lines.push(`**Affected modules:** ${rec.affectedModules.join(", ")}`, "");
    lines.push("**Affected files:**", "");
    (rec.affectedFiles.length ? rec.affectedFiles : ["None"]).forEach((file) => lines.push(`- \`${file}\``));
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Writes recommendations.json and recommendations.md into the output directory (created if needed),
 * returning their absolute paths.
 * @param {object} report
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(report) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "recommendations.json");
  const mdPath = path.join(outputDir, "recommendations.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(report)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const knowledge = loadEngineeringKnowledge(inputPath);
  const report = buildRecommendationsReport(knowledge);
  const { jsonPath, mdPath } = writeOutputs(report);
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
  loadEngineeringKnowledge,
  computeModuleScore,
  computeConfidence,
  estimateImpact,
  generateRecommendations,
  buildRecommendationsReport,
  renderMarkdown,
  writeOutputs,
};
