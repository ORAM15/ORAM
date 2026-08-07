#!/usr/bin/env node
// Validation Engine v1
//
// A deterministic engine that validates the three artifacts an execution actually produced --
// implementation-request/implementation-request.json, execution/execution.json, and
// execution/patch-summary.json -- against a fixed set of rules, and decides whether the result is approved
// for a pull request. It never invokes AI, never inspects the repository, never modifies any artifact it
// reads, and never makes an engineering decision (which recommendation to act on was already decided
// upstream by Decision Engine v1; what actually happened was already decided by whichever Provider Adapter
// ran). It only checks that what happened matches what was approved.
//
// Run with:   node scripts/validation-engine.js
// Input paths default to implementation-request/implementation-request.json, execution/execution.json, and
// execution/patch-summary.json; override with IMPLEMENTATION_REQUEST_PATH, EXECUTION_PATH, and
// PATCH_SUMMARY_PATH (relative to the repository root, or absolute).
// Output dir defaults to `validation/` at the repository root; override with VALIDATION_OUTPUT_DIR.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestPath = path.resolve(root, process.env.IMPLEMENTATION_REQUEST_PATH || "implementation-request/implementation-request.json");
const executionPath = path.resolve(root, process.env.EXECUTION_PATH || "execution/execution.json");
const patchSummaryPath = path.resolve(root, process.env.PATCH_SUMMARY_PATH || "execution/patch-summary.json");
const outputDir = path.resolve(root, process.env.VALIDATION_OUTPUT_DIR || "validation");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadJsonArtifact(file, rerunCommand) {
  if (!fs.existsSync(file)) {
    throw new Error(`${path.basename(file)} not found at ${path.relative(root, file)}. Run \`${rerunCommand}\` first (or set the matching *_PATH environment variable).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`${path.basename(file)} at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/** @param {string} file @returns {object} */
function loadImplementationRequest(file) {
  return loadJsonArtifact(file, "node scripts/implementation-request-engine.js");
}
/** @param {string} file @returns {object} */
function loadExecution(file) {
  return loadJsonArtifact(file, "node scripts/implementation-executor.js");
}
/** @param {string} file @returns {object} */
function loadPatchSummary(file) {
  return loadJsonArtifact(file, "node scripts/implementation-executor.js");
}

/**
 * Verifies the three loaded artifacts actually describe the same pipeline run before any rule is evaluated.
 * execution.json and patch-summary.json are always written together by the same Implementation Executor
 * run, so any mismatch between them (or against the implementation request they both claim to reference)
 * means these are stale/mixed artifacts from different runs -- fails closed rather than validating a
 * contradictory combination.
 * @param {object} request
 * @param {object} execution
 * @param {object} patchSummary
 */
function assertConsistentArtifacts(request, execution, patchSummary) {
  if (execution.requestId !== null && execution.requestId !== undefined && execution.requestId !== request.requestId) {
    throw new Error(
      `execution.json's requestId ("${execution.requestId}") does not match implementation-request.json's requestId ("${request.requestId}"); these artifacts were not generated from the same pipeline run. Re-run the pipeline from Implementation Request Engine onward.`
    );
  }
  if (patchSummary.requestId !== execution.requestId) {
    throw new Error(
      `patch-summary.json's requestId ("${patchSummary.requestId}") does not match execution.json's requestId ("${execution.requestId}"); these artifacts were not generated from the same pipeline run. Re-run \`node scripts/implementation-executor.js\`.`
    );
  }
  if (patchSummary.provider !== execution.provider) {
    throw new Error(
      `patch-summary.json's provider ("${patchSummary.provider}") does not match execution.json's provider ("${execution.provider}"); these artifacts were not generated from the same pipeline run. Re-run \`node scripts/implementation-executor.js\`.`
    );
  }
}

// ---------------------------------------------------------------------------------------------------------
// Deterministic validation rules
// ---------------------------------------------------------------------------------------------------------

function evaluateRule001(ctx) {
  const { execution } = ctx;
  if (execution.status === "success") return { status: "PASS", details: 'execution.json reports status "success".' };
  if (execution.status === "skipped") return { status: "SKIPPED", details: "implementation-request.json had no selected recommendation; nothing was executed." };
  return { status: "FAIL", details: `execution.json reports status "${execution.status}", not "success".` };
}

function evaluateRule002(ctx) {
  const { request, execution, patchSummary, hasSelection } = ctx;
  if (!hasSelection) return { status: "SKIPPED", details: "No selected recommendation; there is no approved file list to validate against." };

  const executionModified = [...(execution.modifiedFiles || [])].sort();
  const patchModified = [...(patchSummary.modifiedFiles || [])].sort();
  if (JSON.stringify(executionModified) !== JSON.stringify(patchModified)) {
    return { status: "FAIL", details: "patch-summary.json's modifiedFiles does not match execution.json's modifiedFiles; these artifacts disagree about what was actually changed." };
  }

  const approved = new Set(request.affectedFiles || []);
  const unapproved = patchModified.filter((file) => !approved.has(file));
  if (unapproved.length > 0) {
    return { status: "FAIL", details: `${unapproved.length} modified file(s) were not in implementation-request.json's affectedFiles: ${unapproved.join(", ")}.` };
  }
  return { status: "PASS", details: `All ${patchModified.length} modified file(s) were within the approved affectedFiles list.` };
}

function evaluateRule003(ctx) {
  const { request, execution, hasSelection } = ctx;
  if (!hasSelection) return { status: "SKIPPED", details: "No selected recommendation; nothing to test." };
  if (execution.status === "skipped" || execution.status === "blocked") {
    return { status: "SKIPPED", details: `execution.json reports status "${execution.status}"; no provider ran, so no tests could execute.` };
  }
  if (!request.executionPolicy || request.executionPolicy.requireTests !== true) {
    return { status: "SKIPPED", details: "implementation-request.json's executionPolicy.requireTests is not true; tests were not required." };
  }
  if (execution.testsExecuted > 0) return { status: "PASS", details: `${execution.testsExecuted} test(s) were executed.` };
  return { status: "FAIL", details: "executionPolicy.requireTests is true, but execution.json reports 0 tests executed." };
}

function evaluateRule004(ctx) {
  const { request, execution, hasSelection } = ctx;
  if (!hasSelection) return { status: "SKIPPED", details: "No selected recommendation; nothing to test." };
  if (execution.status === "skipped" || execution.status === "blocked") {
    return { status: "SKIPPED", details: `execution.json reports status "${execution.status}"; no provider ran, so no tests could execute.` };
  }
  if (!request.executionPolicy || request.executionPolicy.requireTests !== true) {
    return { status: "SKIPPED", details: "implementation-request.json's executionPolicy.requireTests is not true; tests were not required." };
  }
  if (execution.testsExecuted === 0) return { status: "SKIPPED", details: "0 tests were executed (see RULE-003); there is no pass rate to evaluate." };
  if (execution.testsPassed === execution.testsExecuted) return { status: "PASS", details: `All ${execution.testsExecuted} executed test(s) passed.` };
  return { status: "FAIL", details: `${execution.testsExecuted - execution.testsPassed} of ${execution.testsExecuted} executed test(s) failed.` };
}

function evaluateRule005(ctx) {
  const evidence = ctx.execution.providerEvidence;
  if (!evidence) {
    return { status: "SKIPPED", details: "execution.json's providerEvidence is null (a simulated/stub provider, or no provider ran); this rule only applies to real providers." };
  }
  const hasRequiredShape =
    typeof evidence.providerName === "string" &&
    evidence.providerName.length > 0 &&
    evidence.executionMode === "real" &&
    typeof evidence.invocationId === "string" &&
    evidence.invocationId.length > 0 &&
    "exitCode" in evidence &&
    "durationMs" in evidence;
  if (hasRequiredShape) return { status: "PASS", details: `providerEvidence present for "${evidence.providerName}" (invocation ${evidence.invocationId}).` };
  return { status: "FAIL", details: "execution.json's providerEvidence is present but incomplete or malformed." };
}

function evaluateRule006(ctx) {
  const { request, execution, hasSelection } = ctx;
  if (!hasSelection) return { status: "SKIPPED", details: "No selected recommendation; there is no execution policy to enforce." };
  if (execution.status === "blocked") {
    return { status: "FAIL", details: `execution.json reports status "blocked": ${(execution.errors || []).join(" ") || "policy validation failed."}` };
  }
  const policy = request.executionPolicy || {};
  const violations = [];
  if (policy.allowBreakingChanges === true) violations.push("allowBreakingChanges is true");
  if (policy.allowDatabaseMigration === true) violations.push("allowDatabaseMigration is true");
  if (policy.allowDependencyUpdates === true) violations.push("allowDependencyUpdates is true");
  if (violations.length > 0) {
    return { status: "FAIL", details: `implementation-request.json's executionPolicy declares disallowed permission(s): ${violations.join(", ")}.` };
  }
  return { status: "PASS", details: "executionPolicy contains no disallowed permissions, and execution was not blocked." };
}

const RULES = [
  { id: "RULE-001", description: "Execution completed successfully.", evaluate: evaluateRule001 },
  { id: "RULE-002", description: "Only approved files modified.", evaluate: evaluateRule002 },
  { id: "RULE-003", description: "Tests executed.", evaluate: evaluateRule003 },
  { id: "RULE-004", description: "Tests passed.", evaluate: evaluateRule004 },
  { id: "RULE-005", description: "Provider evidence present for real providers.", evaluate: evaluateRule005 },
  { id: "RULE-006", description: "Execution policy respected.", evaluate: evaluateRule006 },
];

/**
 * Evaluates every deterministic validation rule against the three loaded artifacts, in fixed RULE-001..
 * RULE-006 order. Each rule returns PASS, FAIL, or SKIPPED (never anything else, and never a fuzzy score).
 * @param {object} request parsed implementation-request.json
 * @param {object} execution parsed execution.json
 * @param {object} patchSummary parsed patch-summary.json
 * @returns {{id: string, description: string, status: string, details: string}[]}
 */
function evaluateRules(request, execution, patchSummary) {
  const hasSelection = request.recommendationId !== null && request.recommendationId !== undefined;
  const ctx = { request, execution, patchSummary, hasSelection };
  return RULES.map((rule) => {
    const { status, details } = rule.evaluate(ctx);
    return { id: rule.id, description: rule.description, status, details };
  });
}

/**
 * Computes a simple, deterministic, informational score: the percentage of applicable (non-SKIPPED) rules
 * that passed. This score is purely for human-readable reporting -- approvedForPR never uses it (see
 * computeApprovedForPR()), so there is no fuzzy scoring in the approval decision itself.
 * @param {{status: string}[]} rules
 * @returns {number} 0-100
 */
function computeScore(rules) {
  const applicable = rules.filter((rule) => rule.status !== "SKIPPED");
  if (applicable.length === 0) return 0;
  const passed = applicable.filter((rule) => rule.status === "PASS").length;
  return Math.round((passed / applicable.length) * 100);
}

/**
 * Decides pull-request approval with a strict, non-fuzzy rule: the execution must have actually succeeded,
 * and every mandatory rule (RULE-001..RULE-006, all mandatory in v1) must not have FAILed. A SKIPPED rule
 * never blocks approval (it means the rule did not apply), but any single FAIL always does.
 * @param {{status: string}} execution parsed execution.json
 * @param {{status: string}[]} rules
 * @returns {boolean}
 */
function computeApprovedForPR(execution, rules) {
  if (execution.status !== "success") return false;
  return rules.every((rule) => rule.status !== "FAIL");
}

function computeOverallStatus(execution, approvedForPR) {
  if (execution.status === "skipped") return "skipped";
  return approvedForPR ? "approved" : "rejected";
}

/**
 * Builds the complete validation document. This is the single entry point both the CLI and any other caller
 * (e.g. tests) should use.
 * @param {object} request parsed implementation-request.json
 * @param {object} execution parsed execution.json
 * @param {object} patchSummary parsed patch-summary.json
 * @returns {object} matching validation.json's shape
 */
function buildValidation(request, execution, patchSummary) {
  const rules = evaluateRules(request, execution, patchSummary);
  const score = computeScore(rules);
  const approvedForPR = computeApprovedForPR(execution, rules);
  const status = computeOverallStatus(execution, approvedForPR);
  const errors = rules.filter((rule) => rule.status === "FAIL").map((rule) => `${rule.id}: ${rule.description} -- ${rule.details}`);
  const warnings = rules.filter((rule) => rule.status === "SKIPPED").map((rule) => `${rule.id}: ${rule.description} -- ${rule.details}`);

  return {
    generatedFrom: {
      implementationRequest: path.relative(root, requestPath).split(path.sep).join("/"),
      execution: path.relative(root, executionPath).split(path.sep).join("/"),
      patchSummary: path.relative(root, patchSummaryPath).split(path.sep).join("/"),
    },
    status,
    score,
    approvedForPR,
    rules,
    warnings,
    errors,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Report Generator
// ---------------------------------------------------------------------------------------------------------

function buildNextStepText(validation) {
  switch (validation.status) {
    case "skipped":
      return "Nothing was executed. Run the earlier pipeline stages once Decision Engine v1 has selected a recommendation and it has been executed.";
    case "approved":
      return "This change is approved for a pull request. Proceed with the repository's normal PR process.";
    case "rejected":
      return "This change is NOT approved for a pull request. Resolve the failed rule(s) above, then re-run the pipeline as needed.";
    default:
      return "Review this report and decide the appropriate next step.";
  }
}

/**
 * Renders the human-readable Markdown report for a given validation record.
 * @param {object} validation result of buildValidation()
 * @returns {string}
 */
function renderMarkdown(validation) {
  const lines = [];
  lines.push("# Validation Engine Report", "");
  lines.push(
    "Generated by `scripts/validation-engine.js` -- deterministic, no AI/LLM involved. This engine only validates already-produced artifacts against fixed rules; it never inspects the repository, modifies any artifact, or makes engineering decisions.",
    ""
  );
  lines.push(
    `Source artifacts: \`${validation.generatedFrom.implementationRequest}\`, \`${validation.generatedFrom.execution}\`, \`${validation.generatedFrom.patchSummary}\``,
    ""
  );
  lines.push(`Timestamp: ${validation.timestamp}`, "");

  lines.push("## Status", "");
  lines.push(`**${validation.status}**`, "");

  lines.push("## Score", "");
  lines.push(`${validation.score}/100 (percentage of applicable rules that passed; informational only, never used to decide approval)`, "");

  lines.push("## Approved For PR", "");
  lines.push(validation.approvedForPR ? "**Yes**" : "**No**", "");

  lines.push("## Rules", "");
  lines.push("| ID | Description | Status | Details |", "| --- | --- | :---: | --- |");
  validation.rules.forEach((rule) => lines.push(`| ${rule.id} | ${rule.description} | ${rule.status} | ${rule.details} |`));
  lines.push("");

  lines.push("## Warnings", "");
  (validation.warnings.length ? validation.warnings : ["None"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Errors", "");
  (validation.errors.length ? validation.errors : ["None"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Next Step", "");
  lines.push(buildNextStepText(validation), "");

  return lines.join("\n");
}

/**
 * Writes validation.json and validation.md into the output directory (created if needed), returning their
 * absolute paths.
 * @param {object} validation
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(validation) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "validation.json");
  const mdPath = path.join(outputDir, "validation.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(validation, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(validation)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const request = loadImplementationRequest(requestPath);
  const execution = loadExecution(executionPath);
  const patchSummary = loadPatchSummary(patchSummaryPath);
  assertConsistentArtifacts(request, execution, patchSummary);

  const validation = buildValidation(request, execution, patchSummary);
  const { jsonPath, mdPath } = writeOutputs(validation);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
  if (validation.status === "rejected") process.exitCode = 1;
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
  requestPath,
  executionPath,
  patchSummaryPath,
  outputDir,
  RULES,
  loadImplementationRequest,
  loadExecution,
  loadPatchSummary,
  assertConsistentArtifacts,
  evaluateRules,
  computeScore,
  computeApprovedForPR,
  computeOverallStatus,
  buildValidation,
  renderMarkdown,
  writeOutputs,
};
