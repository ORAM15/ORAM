#!/usr/bin/env node
// Implementation Request Engine v1
//
// A deterministic (no AI/LLM/network/repository-scanning/source-parsing) engine that converts Decision
// Engine v1's decision.json into a structured engineering execution contract. It never generates
// implementation code, never modifies files, and never decides which recommendation to act on (that
// remains Decision Engine v1's sole responsibility) -- it only packages an already-made decision into a
// deterministic request a human (or a future, not-yet-built Implementation Engine) can act on.
//
// Run with:   node scripts/implementation-request-engine.js
// Primary input path defaults to decision/decision.json; override with DECISION_PATH.
// Secondary input path defaults to recommendations/recommendations.json; override with RECOMMENDATIONS_PATH
// (both relative to the repository root, or absolute).
// Output dir defaults to `implementation-request/` at the repository root; override with
// IMPLEMENTATION_REQUEST_OUTPUT_DIR.
//
// INPUT NOTE: decision.json's own candidateScores intentionally do not carry affectedModules/affectedFiles/
// description/reason forward from recommendations.json (Decision Engine v1 only needed scores to decide).
// This engine therefore also reads recommendations/recommendations.json -- and only that file -- solely to
// recover the *selected* recommendation's affectedModules/affectedFiles/description/reason by the id
// decision.json already named. This is still zero repository scanning, zero source-code parsing, and zero
// AI: it is one more already-generated, purely deterministic pipeline artifact, read the same way every
// other engine in this chain reads its own upstream file. If recommendations.json is unavailable, or no
// longer contains the id decision.json selected, this engine fails closed rather than fabricate the
// missing facts.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const decisionPath = path.resolve(root, process.env.DECISION_PATH || "decision/decision.json");
const recommendationsPath = path.resolve(root, process.env.RECOMMENDATIONS_PATH || "recommendations/recommendations.json");
const outputDir = path.resolve(root, process.env.IMPLEMENTATION_REQUEST_OUTPUT_DIR || "implementation-request");

// Deterministic default execution policy. Fixed, safe-by-default constants -- not derived from decision
// data -- matching this repository's established supervised-autonomy posture (see .agent/AUTONOMOUS_RULES.md
// and every prior engine's own non-goals): nothing here ever authorizes a breaking change, a database
// migration, or a dependency update, and human approval is always required before execution.
const EXECUTION_POLICY_DEFAULTS = {
  allowBreakingChanges: false,
  allowDatabaseMigration: false,
  allowDependencyUpdates: false,
  requireTests: true,
  requireHumanApproval: true,
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and parses decision.json. Fails closed with a clear, actionable error if the file is missing or
 * not valid JSON -- this engine never silently regenerates or guesses at a decision.
 * @param {string} file absolute path to decision.json
 * @returns {object} the parsed decision document
 */
function loadDecision(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`decision.json not found at ${path.relative(root, file)}. Run \`node scripts/decision-engine.js\` first (or set DECISION_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`decision.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Loads and parses recommendations.json. Fails closed with a clear, actionable error if the file is
 * missing or not valid JSON. Only called when decision.json actually selected a recommendation -- an empty
 * decision never requires this file to exist at all.
 * @param {string} file absolute path to recommendations.json
 * @returns {object} the parsed recommendations document
 */
function loadRecommendations(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`recommendations.json not found at ${path.relative(root, file)}. Run \`node scripts/recommendation-engine.js\` first (or set RECOMMENDATIONS_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`recommendations.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Verifies that the loaded recommendations.json is the exact artifact Decision Engine v1 actually read when
 * it produced decision.json -- not merely a same-named file that happens to still exist. Decision Engine
 * stamps decision.sourceProjectName and decision.sourceTimestamp directly from the recommendations.json it
 * consumed (see decision-engine.js buildDecision(): `sourceProjectName: recommendationsDoc.sourceProjectName,
 * sourceTimestamp: recommendationsDoc.timestamp`), so an unchanged recommendations.json always matches both
 * fields, and any regeneration -- even one that happens to reuse the same numeric recommendation ids --
 * will not. Without this check, a numeric-id-only lookup could silently resolve against a *different*
 * recommendation than the one Decision Engine actually scored, if recommendations.json was regenerated
 * between the two runs. Fails closed with a clear, actionable error rather than mixing artifacts.
 * @param {{sourceProjectName: string, sourceTimestamp: string}} decision parsed decision.json
 * @param {{sourceProjectName: string, timestamp: string}} recommendationsDoc parsed recommendations.json
 */
function assertMatchingArtifact(decision, recommendationsDoc) {
  const projectMismatch = decision.sourceProjectName !== recommendationsDoc.sourceProjectName;
  const timestampMismatch = decision.sourceTimestamp !== recommendationsDoc.timestamp;
  if (projectMismatch || timestampMismatch) {
    throw new Error(
      "decision.json was generated from a different recommendations.json artifact.\n" +
        "Please rerun the Recommendation Engine and Decision Engine before generating an Implementation Request."
    );
  }
}

/**
 * Finds the recommendation decision.json selected, by id, inside recommendations.json.
 * @param {object} recommendationsDoc parsed recommendations.json
 * @param {number} id
 * @returns {object|null}
 */
function findRecommendation(recommendationsDoc, id) {
  return (recommendationsDoc.recommendations || []).find((recommendation) => recommendation.id === id) || null;
}

/**
 * Derives a stable, deterministic request id from decision.json's own content alone (the selected id plus
 * decision.json's own timestamp) -- re-running this engine against the same decision.json always produces
 * the same requestId, independent of when this engine itself happens to run.
 * @param {number} recommendationId
 * @param {string} decisionTimestamp
 * @returns {string}
 */
function buildRequestId(recommendationId, decisionTimestamp) {
  const compact = decisionTimestamp.replace(/[^0-9A-Za-z]/g, "");
  return `IR-${recommendationId}-${compact}`;
}

/**
 * Builds the deterministic implementation constraints list: a fixed safety baseline every request carries,
 * plus additional constraints only when decision.json's own estimatedRisk/estimatedImplementationSize
 * warrant them.
 * @param {{estimatedRisk: string, estimatedImplementationSize: string}} decision
 * @returns {string[]}
 */
function buildImplementationConstraints(decision) {
  const constraints = [
    "Implement only within the affected modules and files listed in this request.",
    "Do not modify protected control-plane files, CI/CD workflows, or modules outside this request's scope.",
    "Preserve existing public behavior; this must be a non-breaking, behavior-preserving change unless explicitly re-approved.",
  ];
  if (decision.estimatedRisk === "High") {
    constraints.push("This change carries High estimated risk; keep the diff as small and independently reviewable as possible.");
  }
  if (decision.estimatedImplementationSize === "Large") {
    constraints.push("This is a Large estimated change; consider splitting the implementation into smaller, independently reviewable steps.");
  }
  return constraints;
}

/**
 * Builds acceptance criteria: a fixed baseline plus one criterion per reason the selected recommendation
 * cited (recommendations.json's own `reason` array), so every criterion traces back to a real, already-
 * recorded fact -- never invented.
 * @param {{reason: string[]}} recommendation
 * @returns {string[]}
 */
function buildAcceptanceCriteria(recommendation) {
  return [
    "All existing automated tests continue to pass.",
    "No behavior change is observable outside the modules/files listed as affected.",
    ...recommendation.reason.map((reason) => `Addresses the underlying finding: ${reason}`),
  ];
}

/**
 * Builds the validation checklist: a fixed baseline plus entries reflecting the fixed execution policy
 * defaults (requireTests/requireHumanApproval), so the checklist and the policy never disagree.
 * @returns {string[]}
 */
function buildValidationChecklist() {
  const checklist = [
    "Run all relevant automated tests for every affected module.",
    "Run the repository's standard build/lint checks for any changed workspace.",
    "Confirm no behavior change is observable outside the affected modules/files.",
  ];
  if (EXECUTION_POLICY_DEFAULTS.requireTests) checklist.push("New or updated automated tests exist for the change described in this request.");
  if (EXECUTION_POLICY_DEFAULTS.requireHumanApproval) checklist.push("Obtain explicit human review and approval before this change is merged.");
  return checklist;
}

function buildNextStep(hasSelection) {
  if (!hasSelection) {
    return "No decision was available to act on; run the pipeline again once Decision Engine v1 has selected a recommendation.";
  }
  return "This implementation request is ready for human review. Once approved, a future Implementation Engine (not yet built in this repository) may execute it; no code is changed automatically by this engine.";
}

/**
 * Builds the complete implementation request document from a parsed decision.json and (only when a
 * recommendation was actually selected) parsed recommendations.json. This is the single entry point both
 * the CLI and any other caller (e.g. tests) should use. Handles decision.json's own honest "no selection"
 * case (an empty decision -- a valid, expected input, not a failure) gracefully, and fails closed if the
 * selected id can no longer be found in recommendations.json (contradictory/stale state).
 * @param {object} decision parsed decision.json
 * @param {object|null} recommendationsDoc parsed recommendations.json, or null if decision has no selection
 * @returns {object} matching implementation-request.json's shape
 */
function buildImplementationRequest(decision, recommendationsDoc) {
  const base = {
    generatedFrom: path.relative(root, decisionPath).split(path.sep).join("/"),
    recommendationsSource: path.relative(root, recommendationsPath).split(path.sep).join("/"),
    sourceProjectName: decision.sourceProjectName,
    sourceDecisionId: decision.timestamp,
    executionPolicy: { ...EXECUTION_POLICY_DEFAULTS },
    timestamp: new Date().toISOString(),
  };

  if (decision.selectedRecommendationId === null || decision.selectedRecommendationId === undefined) {
    return {
      ...base,
      requestId: null,
      recommendationId: null,
      title: null,
      goal: null,
      affectedModules: [],
      affectedFiles: [],
      implementationConstraints: [],
      acceptanceCriteria: [],
      validationChecklist: [],
      nextStep: buildNextStep(false),
    };
  }

  assertMatchingArtifact(decision, recommendationsDoc);

  const recommendation = findRecommendation(recommendationsDoc, decision.selectedRecommendationId);
  if (!recommendation) {
    throw new Error(
      `decision.json selected recommendation id ${decision.selectedRecommendationId}, but ${base.recommendationsSource} does not contain a recommendation with that id; refusing to fabricate affected modules/files for contradictory or stale pipeline state`
    );
  }

  return {
    ...base,
    requestId: buildRequestId(decision.selectedRecommendationId, decision.timestamp),
    recommendationId: decision.selectedRecommendationId,
    title: decision.selectedTitle,
    goal: recommendation.description,
    affectedModules: recommendation.affectedModules || [],
    affectedFiles: recommendation.affectedFiles || [],
    implementationConstraints: buildImplementationConstraints(decision),
    acceptanceCriteria: buildAcceptanceCriteria(recommendation),
    validationChecklist: buildValidationChecklist(),
    nextStep: buildNextStep(true),
  };
}

/**
 * Renders the human-readable Markdown report for a given implementation request.
 * @param {object} request result of buildImplementationRequest()
 * @returns {string}
 */
function renderMarkdown(request) {
  const lines = [];
  lines.push("# Implementation Request Report", "");
  lines.push("Generated by `scripts/implementation-request-engine.js` -- deterministic, no AI/LLM involved. This engine only packages an already-made decision into an execution contract; it never writes or generates code.", "");
  lines.push(`Source decision: \`${request.generatedFrom}\` (project: ${request.sourceProjectName}, decision timestamp ${request.sourceDecisionId})`, "");
  lines.push(`Timestamp: ${request.timestamp}`, "");

  if (request.recommendationId === null) {
    lines.push("## Selected Recommendation", "");
    lines.push("None. decision.json contained no selection to act on.", "");
    lines.push("## Next Step", "");
    lines.push(request.nextStep, "");
    return lines.join("\n");
  }

  lines.push(`## Selected Recommendation`, "");
  lines.push(`**#${request.recommendationId} -- ${request.title}** (request \`${request.requestId}\`)`, "");

  lines.push("## Goal", "");
  lines.push(request.goal, "");

  lines.push("## Affected Modules", "");
  (request.affectedModules.length ? request.affectedModules : ["None"]).forEach((name) => lines.push(`- ${name}`));
  lines.push("");

  lines.push("## Affected Files", "");
  (request.affectedFiles.length ? request.affectedFiles : ["None"]).forEach((file) => lines.push(`- \`${file}\``));
  lines.push("");

  lines.push("## Implementation Constraints", "");
  request.implementationConstraints.forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Acceptance Criteria", "");
  request.acceptanceCriteria.forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Validation Checklist", "");
  request.validationChecklist.forEach((entry) => lines.push(`- [ ] ${entry}`));
  lines.push("");

  lines.push("## Execution Policy", "");
  lines.push("| Policy | Value |", "| --- | --- |");
  Object.entries(request.executionPolicy).forEach(([key, value]) => lines.push(`| ${key} | ${value} |`));
  lines.push("");

  lines.push("## Next Step", "");
  lines.push(request.nextStep, "");

  return lines.join("\n");
}

/**
 * Writes implementation-request.json and implementation-request.md into the output directory (created if
 * needed), returning their absolute paths.
 * @param {object} request
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(request) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "implementation-request.json");
  const mdPath = path.join(outputDir, "implementation-request.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(request, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(request)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const decision = loadDecision(decisionPath);
  const hasSelection = decision.selectedRecommendationId !== null && decision.selectedRecommendationId !== undefined;
  const recommendationsDoc = hasSelection ? loadRecommendations(recommendationsPath) : null;
  const request = buildImplementationRequest(decision, recommendationsDoc);
  const { jsonPath, mdPath } = writeOutputs(request);
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
  decisionPath,
  recommendationsPath,
  outputDir,
  EXECUTION_POLICY_DEFAULTS,
  loadDecision,
  loadRecommendations,
  assertMatchingArtifact,
  findRecommendation,
  buildRequestId,
  buildImplementationConstraints,
  buildAcceptanceCriteria,
  buildValidationChecklist,
  buildImplementationRequest,
  renderMarkdown,
  writeOutputs,
};
