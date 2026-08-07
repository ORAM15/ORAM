#!/usr/bin/env node
// Pull Request Generator v1
//
// A deterministic engine that turns four already-produced artifacts -- implementation-request.json,
// execution.json, patch-summary.json, and validation.json -- into a proposed pull request document. It
// never talks to GitHub, never invokes Git, never invokes AI, never inspects the repository, and never
// modifies any artifact it reads. It only formats already-known, already-approved facts into a title,
// branch name, and description.
//
// Run with:   node scripts/pull-request-generator.js
// Input paths default to implementation-request/implementation-request.json, execution/execution.json,
// execution/patch-summary.json, and validation/validation.json; override with IMPLEMENTATION_REQUEST_PATH,
// EXECUTION_PATH, PATCH_SUMMARY_PATH, and VALIDATION_PATH (relative to the repository root, or absolute).
// Output dir defaults to `pull-request/` at the repository root; override with PULL_REQUEST_OUTPUT_DIR.
//
// Validation gate: unlike every previous engine, this one does NOT produce a graceful "nothing to do"
// artifact when there is nothing approved. validation.approvedForPR must be exactly true or this engine
// fails closed and writes nothing at all -- a half-formed pull request document for an unapproved or
// non-existent change is not a useful, safe artifact to produce.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestPath = path.resolve(root, process.env.IMPLEMENTATION_REQUEST_PATH || "implementation-request/implementation-request.json");
const executionPath = path.resolve(root, process.env.EXECUTION_PATH || "execution/execution.json");
const patchSummaryPath = path.resolve(root, process.env.PATCH_SUMMARY_PATH || "execution/patch-summary.json");
const validationPath = path.resolve(root, process.env.VALIDATION_PATH || "validation/validation.json");
const outputDir = path.resolve(root, process.env.PULL_REQUEST_OUTPUT_DIR || "pull-request");

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
/** @param {string} file @returns {object} */
function loadValidation(file) {
  return loadJsonArtifact(file, "node scripts/validation-engine.js");
}

/**
 * Verifies the four loaded artifacts actually describe the same pipeline run before anything is generated.
 * requestId/provider are cross-checked directly (execution.json and patch-summary.json are always written
 * together by the same Implementation Executor run, and both must reference the same implementation
 * request). validation.json does not carry a requestId of its own (Validation Engine v1's own frozen
 * schema), so it is instead checked for a legitimate invariant: a validation can only ever have been
 * produced AFTER the execution it validated, so validation.timestamp must not predate execution.timestamp.
 * @param {object} request
 * @param {object} execution
 * @param {object} patchSummary
 * @param {object} validation
 */
function assertConsistentArtifacts(request, execution, patchSummary, validation) {
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
  const validationTime = Date.parse(validation.timestamp);
  const executionTime = Date.parse(execution.timestamp);
  if (Number.isFinite(validationTime) && Number.isFinite(executionTime) && validationTime < executionTime) {
    throw new Error(
      `validation.json (timestamp ${validation.timestamp}) predates execution.json (timestamp ${execution.timestamp}); validation.json is stale and cannot have validated this execution. Re-run \`node scripts/validation-engine.js\`.`
    );
  }
}

/**
 * The validation gate: refuses to generate any artifact unless validation.json's own approvedForPR is
 * exactly true. Fails closed with an actionable message naming what to do next.
 * @param {{approvedForPR: boolean, status: string, score: number}} validation
 */
function assertApprovedForPR(validation) {
  if (validation.approvedForPR !== true) {
    const reason =
      validation.status === "skipped"
        ? 'nothing was executed (validation.json status: "skipped")'
        : `the change was not approved (validation.json status: "${validation.status}", score ${validation.score}/100)`;
    throw new Error(`Pull Request Generator refuses to generate a pull request: ${reason}. Review validation.md, resolve any failing rule(s), and re-run the pipeline.`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Deterministic title / branch name / summary -- fixed templates around real, already-known fields only.
// Never AI-generated prose, never derived from anything other than these four artifacts.
// ---------------------------------------------------------------------------------------------------------

/**
 * Converts arbitrary text into a git-branch-safe slug: lowercase, alphanumeric runs separated by single
 * hyphens, no leading/trailing hyphens, capped at 60 characters.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  const slug = (text || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "change";
}

/** @param {{title: string}} request @returns {string} */
function buildTitle(request) {
  return `autonomous: ${request.title}`;
}

/**
 * Builds a deterministic, unique branch name: a slug of the request's own title, suffixed with the
 * request's own requestId (already unique per Decision Engine run -- see Implementation Request Engine v1),
 * so re-running the pipeline never produces a colliding branch name for a different execution.
 * @param {{title: string, requestId: string}} request
 * @returns {string}
 */
function buildBranchName(request) {
  const slug = slugify(request.title);
  const suffix = (request.requestId || "no-request-id").toString().toLowerCase();
  return `autonomous/${slug}-${suffix}`;
}

/**
 * Builds the PR summary from fixed connector text wrapped around real fields only (the request's own goal
 * and the execution's own summary) -- never invented prose.
 * @param {{goal: string}} request
 * @param {{provider: string, executionSummary: string}} execution
 * @param {{modifiedFiles: string[]}} patchSummary
 * @returns {string}
 */
function buildSummary(request, execution, patchSummary) {
  const fileCount = (patchSummary.modifiedFiles || []).length;
  return [request.goal || "", "", `Executed automatically by the G-VAMS Autonomous Engineering System (provider: ${execution.provider}). ${fileCount} file(s) modified. ${execution.executionSummary}`].join(
    "\n"
  );
}

/**
 * Builds the approval summary from validation.json's own rules array -- pass/fail/skip counts, never a
 * fuzzy re-derivation of the approval decision itself (that decision was already made by Validation Engine).
 * @param {{approvedForPR: boolean, score: number, rules: {status: string}[]}} validation
 * @returns {{approvedForPR: boolean, validationScore: number, rulesPassed: number, rulesFailed: number, rulesSkipped: number, rulesTotal: number}}
 */
function buildApproval(validation) {
  const rules = validation.rules || [];
  return {
    approvedForPR: validation.approvedForPR,
    validationScore: validation.score,
    rulesPassed: rules.filter((rule) => rule.status === "PASS").length,
    rulesFailed: rules.filter((rule) => rule.status === "FAIL").length,
    rulesSkipped: rules.filter((rule) => rule.status === "SKIPPED").length,
    rulesTotal: rules.length,
  };
}

/**
 * Builds the complete pull request document. This is the single entry point both the CLI and any other
 * caller (e.g. tests) should use. Callers must have already checked assertApprovedForPR() -- this function
 * does not re-check it, so it can also be used directly in tests against hand-crafted "already approved"
 * fixtures.
 * @param {object} request parsed implementation-request.json
 * @param {object} execution parsed execution.json
 * @param {object} patchSummary parsed patch-summary.json
 * @param {object} validation parsed validation.json
 * @returns {object} matching pull-request.json's shape
 */
function buildPullRequest(request, execution, patchSummary, validation) {
  return {
    generatedFrom: {
      implementationRequest: path.relative(root, requestPath).split(path.sep).join("/"),
      execution: path.relative(root, executionPath).split(path.sep).join("/"),
      patchSummary: path.relative(root, patchSummaryPath).split(path.sep).join("/"),
      validation: path.relative(root, validationPath).split(path.sep).join("/"),
    },
    requestId: request.requestId,
    recommendationId: request.recommendationId,
    title: buildTitle(request),
    branchName: buildBranchName(request),
    summary: buildSummary(request, execution, patchSummary),
    modifiedFiles: patchSummary.modifiedFiles || [],
    testsExecuted: execution.testsExecuted,
    testsPassed: execution.testsPassed,
    validationStatus: validation.status,
    provider: execution.provider,
    approval: buildApproval(validation),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Report Generator
// ---------------------------------------------------------------------------------------------------------

/**
 * Renders the human-readable Markdown pull request document, suitable for pasting directly into GitHub.
 * Includes a little more context than pull-request.json carries (acceptance criteria, validation checklist,
 * and the full validation rules table) since a real PR reviewer benefits from it -- all of it reused
 * verbatim from the source artifacts, never invented.
 * @param {object} pr result of buildPullRequest()
 * @param {object} request parsed implementation-request.json
 * @param {object} validation parsed validation.json
 * @returns {string}
 */
function renderMarkdown(pr, request, validation) {
  const lines = [];
  lines.push(`# ${pr.title}`, "");
  lines.push(
    "Generated by `scripts/pull-request-generator.js` -- deterministic, no AI/LLM involved, no repository inspection, no Git invoked. This document is a proposed pull request description only; nothing has been pushed or opened on GitHub.",
    ""
  );
  lines.push(
    `Source artifacts: \`${pr.generatedFrom.implementationRequest}\`, \`${pr.generatedFrom.execution}\`, \`${pr.generatedFrom.patchSummary}\`, \`${pr.generatedFrom.validation}\``,
    ""
  );
  lines.push(`Timestamp: ${pr.timestamp}`, "");

  lines.push("## Branch Name", "");
  lines.push(`\`${pr.branchName}\``, "");

  lines.push("## Summary", "");
  lines.push(pr.summary, "");

  lines.push("## Modified Files", "");
  (pr.modifiedFiles.length ? pr.modifiedFiles : ["None"]).forEach((file) => lines.push(`- \`${file}\``));
  lines.push("");

  lines.push("## Tests Executed", "");
  lines.push(`${pr.testsExecuted}`, "");

  lines.push("## Tests Passed", "");
  lines.push(`${pr.testsPassed}`, "");

  lines.push("## Validation Status", "");
  lines.push(`**${pr.validationStatus}** (score ${pr.approval.validationScore}/100)`, "");

  lines.push("## Provider", "");
  lines.push(`\`${pr.provider}\``, "");

  lines.push("## Approval", "");
  lines.push(`- Approved for PR: ${pr.approval.approvedForPR ? "Yes" : "No"}`);
  lines.push(`- Validation rules: ${pr.approval.rulesPassed} passed, ${pr.approval.rulesFailed} failed, ${pr.approval.rulesSkipped} skipped (of ${pr.approval.rulesTotal})`);
  lines.push("");

  if (request.acceptanceCriteria && request.acceptanceCriteria.length) {
    lines.push("## Acceptance Criteria", "");
    request.acceptanceCriteria.forEach((entry) => lines.push(`- ${entry}`));
    lines.push("");
  }

  if (request.validationChecklist && request.validationChecklist.length) {
    lines.push("## Validation Checklist", "");
    request.validationChecklist.forEach((entry) => lines.push(`- [x] ${entry}`));
    lines.push("");
  }

  if (validation.rules && validation.rules.length) {
    lines.push("## Validation Rules", "");
    lines.push("| ID | Description | Status |", "| --- | --- | :---: |");
    validation.rules.forEach((rule) => lines.push(`| ${rule.id} | ${rule.description} | ${rule.status} |`));
    lines.push("");
  }

  lines.push("## Next Step", "");
  lines.push(
    "Review this document, then open a pull request using this title, branch name, and summary through the repository's normal process. This engine does not create, push, or open anything itself.",
    ""
  );

  return lines.join("\n");
}

/**
 * Writes pull-request.json and pull-request.md into the output directory (created if needed), returning
 * their absolute paths.
 * @param {object} pr
 * @param {object} request
 * @param {object} validation
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(pr, request, validation) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "pull-request.json");
  const mdPath = path.join(outputDir, "pull-request.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(pr, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(pr, request, validation)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const request = loadImplementationRequest(requestPath);
  const execution = loadExecution(executionPath);
  const patchSummary = loadPatchSummary(patchSummaryPath);
  const validation = loadValidation(validationPath);

  assertConsistentArtifacts(request, execution, patchSummary, validation);
  assertApprovedForPR(validation);

  const pr = buildPullRequest(request, execution, patchSummary, validation);
  const { jsonPath, mdPath } = writeOutputs(pr, request, validation);
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
  requestPath,
  executionPath,
  patchSummaryPath,
  validationPath,
  outputDir,
  loadImplementationRequest,
  loadExecution,
  loadPatchSummary,
  loadValidation,
  assertConsistentArtifacts,
  assertApprovedForPR,
  slugify,
  buildTitle,
  buildBranchName,
  buildSummary,
  buildApproval,
  buildPullRequest,
  renderMarkdown,
  writeOutputs,
};
