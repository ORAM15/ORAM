#!/usr/bin/env node
// Implementation Executor v1
//
// A deterministic, provider-neutral engine that reads implementation-request/implementation-request.json
// (Implementation Request Engine v1's output) and executes it through a Provider Adapter. v1 implements only
// a deterministic stub Provider Adapter -- it never invokes Claude Code, never calls any AI/LLM, never
// scans the repository, never generates recommendations, and never makes engineering decisions. Its only
// job is: load the request, validate its execution policy, hand it to a Provider Adapter, normalize
// whatever that provider returns into a fixed schema, and report the result. It never modifies
// implementation-request.json.
//
// Run with:   node scripts/implementation-executor.js
// Input path defaults to implementation-request/implementation-request.json; override with
// IMPLEMENTATION_REQUEST_PATH (relative to the repository root, or absolute).
// Output dir defaults to `execution/` at the repository root; override with EXECUTION_OUTPUT_DIR.
// Provider defaults to "stub-deterministic-v1" (the only provider implemented in v1); override with
// EXECUTION_PROVIDER (an unknown provider name fails closed).
// Human approval (required whenever the request's executionPolicy.requireHumanApproval is true, which
// Implementation Request Engine v1 always sets): set EXECUTION_APPROVED=true only after a human has reviewed
// implementation-request.md and approved it.
// The stub provider's simulated outcome can be forced for testing via EXECUTION_STUB_OUTCOME
// (success | failure | cancelled | throw); it defaults to "success".
//
// Architecture (each a distinct, separately testable stage):
//   1. Request Loader    -- loadImplementationRequest(): reads + validates implementation-request.json.
//   2. Policy Validator   -- validateExecutionPolicy(): enforces the request's own executionPolicy.
//   3. Runtime Adapter     -- invokeProvider(): resolves + calls a Provider Adapter, isolating its timing
//                             and any exception it throws so a broken provider can never crash this engine.
//   4. Provider Adapter    -- stubProviderAdapter(): v1's only implemented provider, fully deterministic.
//   5. Result Normalizer   -- normalizeProviderResult(): maps a provider's own raw response shape into the
//                             fixed execution.json schema, so any future provider can plug in without this
//                             engine's output schema ever changing.
//   6. Report Generator    -- renderMarkdown(): renders execution.md from the normalized execution record.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestPath = path.resolve(root, process.env.IMPLEMENTATION_REQUEST_PATH || "implementation-request/implementation-request.json");
const outputDir = path.resolve(root, process.env.EXECUTION_OUTPUT_DIR || "execution");

const DEFAULT_PROVIDER = "stub-deterministic-v1";
const providerName = process.env.EXECUTION_PROVIDER || DEFAULT_PROVIDER;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ---------------------------------------------------------------------------------------------------------
// 1. Request Loader
// ---------------------------------------------------------------------------------------------------------

/**
 * Validates that a parsed implementation-request.json has the shape this engine depends on. Fails closed
 * with a clear, actionable error on anything malformed -- this engine never guesses at missing fields.
 * @param {object} request parsed implementation-request.json
 */
function assertValidRequestShape(request) {
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    throw new Error(`implementation-request.json at ${path.relative(root, requestPath)} is not a valid implementation request object. Run \`node scripts/implementation-request-engine.js\` again.`);
  }
  const hasSelection = request.recommendationId !== null && request.recommendationId !== undefined;
  if (!hasSelection) return;

  const requiredFields = ["requestId", "title", "goal", "affectedFiles", "executionPolicy"];
  const missing = requiredFields.filter((field) => request[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `implementation-request.json at ${path.relative(root, requestPath)} is missing required field(s): ${missing.join(", ")}. Run \`node scripts/implementation-request-engine.js\` again.`
    );
  }
  if (!Array.isArray(request.affectedFiles)) {
    throw new Error(`implementation-request.json at ${path.relative(root, requestPath)} has a non-array affectedFiles field. Run \`node scripts/implementation-request-engine.js\` again.`);
  }
  if (typeof request.executionPolicy !== "object" || request.executionPolicy === null || Array.isArray(request.executionPolicy)) {
    throw new Error(`implementation-request.json at ${path.relative(root, requestPath)} has a non-object executionPolicy field. Run \`node scripts/implementation-request-engine.js\` again.`);
  }
}

/**
 * Loads, parses, and structurally validates implementation-request.json. Fails closed with a clear,
 * actionable error if the file is missing, not valid JSON, or structurally invalid. Never writes to this
 * file -- the executor only ever reads the implementation request.
 * @param {string} file absolute path to implementation-request.json
 * @returns {object} the parsed, validated implementation request
 */
function loadImplementationRequest(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`implementation-request.json not found at ${path.relative(root, file)}. Run \`node scripts/implementation-request-engine.js\` first (or set IMPLEMENTATION_REQUEST_PATH).`);
  }
  let request;
  try {
    request = readJson(file);
  } catch (error) {
    throw new Error(`implementation-request.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
  assertValidRequestShape(request);
  return request;
}

// ---------------------------------------------------------------------------------------------------------
// 2. Policy Validator
// ---------------------------------------------------------------------------------------------------------

/**
 * Checks whether a human approval signal has been recorded for this run. v1 has no interactive approval
 * flow, so approval is recorded deterministically via the EXECUTION_APPROVED environment variable, set only
 * after a human has actually reviewed implementation-request.md.
 * @returns {boolean}
 */
function isApproved() {
  const value = (process.env.EXECUTION_APPROVED || "").trim().toLowerCase();
  return value === "true" || value === "1";
}

/**
 * Validates a request's executionPolicy before any Provider Adapter is invoked. Implementation Executor v1
 * never permits breaking changes, database migrations, or dependency updates regardless of what the request
 * claims, and always requires a recorded human approval signal whenever executionPolicy.requireHumanApproval
 * is true. This is enforcement of an already-declared policy, not a new engineering decision.
 * @param {{executionPolicy: object}} request
 * @returns {{allowed: boolean, violations: string[]}}
 */
function validateExecutionPolicy(request) {
  const policy = request.executionPolicy || {};
  const violations = [];

  if (policy.allowBreakingChanges === true) {
    violations.push("executionPolicy.allowBreakingChanges is true, but Implementation Executor v1 never permits breaking changes.");
  }
  if (policy.allowDatabaseMigration === true) {
    violations.push("executionPolicy.allowDatabaseMigration is true, but Implementation Executor v1 never permits database migrations.");
  }
  if (policy.allowDependencyUpdates === true) {
    violations.push("executionPolicy.allowDependencyUpdates is true, but Implementation Executor v1 never permits dependency updates.");
  }
  if (policy.requireHumanApproval === true && !isApproved()) {
    violations.push(
      "executionPolicy.requireHumanApproval is true, but no human approval was recorded. Review implementation-request.md, then re-run with EXECUTION_APPROVED=true once a human has approved it."
    );
  }

  return { allowed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------------------------------------
// 4. Provider Adapter (stub-deterministic-v1) -- v1's only implemented provider.
// ---------------------------------------------------------------------------------------------------------

/**
 * A fully deterministic, no-op-on-disk Provider Adapter: it never touches the real repository and never
 * calls Claude Code, an LLM, or any network service. It simulates a provider's response so the execution
 * pipeline (Runtime Adapter, Result Normalizer, Report Generator) can be built and tested independently of
 * any real implementation provider. Its outcome is derived from the request's own affectedFiles (for the
 * deterministic test count) and, only for testability, from EXECUTION_STUB_OUTCOME.
 *
 * Intentionally returns a provider-specific raw shape (filesChanged/testsRun/testsOk/notes/problems) rather
 * than the canonical execution.json field names, so normalizeProviderResult() has real translation work to
 * do -- proving this engine's provider-neutral contract rather than merely passing one provider's shape
 * through unchanged.
 * @param {{requestId: string, affectedFiles: string[]}} request
 * @returns {object} provider-specific raw result
 */
function stubProviderAdapter(request) {
  const outcome = (process.env.EXECUTION_STUB_OUTCOME || "success").trim().toLowerCase();
  const affectedFiles = request.affectedFiles || [];
  const testCount = Math.max(1, affectedFiles.length);

  if (outcome === "throw") {
    throw new Error("stub-deterministic-v1 provider forced to throw via EXECUTION_STUB_OUTCOME=throw.");
  }
  if (outcome === "cancelled") {
    return {
      outcome: "cancelled",
      filesChanged: [],
      testsRun: 0,
      testsOk: 0,
      notes: ["Execution was cancelled before any changes were made (forced via EXECUTION_STUB_OUTCOME=cancelled)."],
      problems: [],
      summary: `Execution of request ${request.requestId} was cancelled before completion.`,
    };
  }
  if (outcome === "failure") {
    return {
      outcome: "failure",
      filesChanged: [],
      testsRun: testCount,
      testsOk: 0,
      notes: [],
      problems: ["Simulated deterministic failure from stub-deterministic-v1 (forced via EXECUTION_STUB_OUTCOME=failure)."],
      summary: `Execution of request ${request.requestId} failed: ${testCount} test(s) run, 0 passed.`,
    };
  }
  if (outcome !== "success") {
    throw new Error(`Unknown EXECUTION_STUB_OUTCOME "${outcome}"; expected one of: success, failure, cancelled, throw.`);
  }
  return {
    outcome: "success",
    filesChanged: [...affectedFiles],
    testsRun: testCount,
    testsOk: testCount,
    notes: [],
    problems: [],
    summary: `Execution of request ${request.requestId} succeeded: ${testCount} test(s) run, ${testCount} passed, ${affectedFiles.length} file(s) simulated as modified.`,
  };
}

const PROVIDERS = {
  "stub-deterministic-v1": stubProviderAdapter,
};

// External providers whose implementation lives outside this file (see providers/<name>/) are required
// lazily, only when actually selected -- so environments/tests that never use them never need that
// directory to exist, and this file's own architecture stays untouched by any single provider's internals.
const EXTERNAL_PROVIDER_LOADERS = {
  "claude-code-v1": () => require("../providers/claude/adapter").claudeProviderAdapter,
};

/**
 * Resolves a provider name to its Provider Adapter function. Fails closed on an unknown provider.
 * @param {string} name
 * @returns {(request: object) => object}
 */
function resolveProvider(name) {
  if (PROVIDERS[name]) return PROVIDERS[name];
  if (EXTERNAL_PROVIDER_LOADERS[name]) return EXTERNAL_PROVIDER_LOADERS[name]();
  const known = [...Object.keys(PROVIDERS), ...Object.keys(EXTERNAL_PROVIDER_LOADERS)];
  throw new Error(`Unknown execution provider "${name}". Implementation Executor v1 only implements: ${known.join(", ")}.`);
}

// ---------------------------------------------------------------------------------------------------------
// 3. Runtime Adapter
// ---------------------------------------------------------------------------------------------------------

/**
 * Invokes a Provider Adapter, recording start/end timestamps and isolating any exception the provider
 * throws so a broken or misbehaving provider can never crash the executor itself -- an uncaught provider
 * exception is converted into a normal, reportable "failure" result instead.
 * @param {(request: object) => object} providerFn a Provider Adapter function
 * @param {object} request the implementation request being executed
 * @returns {{raw: object, startTime: string, endTime: string}}
 */
function invokeProvider(providerFn, request) {
  const startTime = new Date().toISOString();
  let raw;
  try {
    raw = providerFn(request);
  } catch (error) {
    raw = {
      outcome: "failure",
      filesChanged: [],
      testsRun: 0,
      testsOk: 0,
      notes: [],
      problems: [`Provider adapter threw an unexpected error: ${error.message}`],
      summary: `Execution of request ${request.requestId} failed: the provider adapter threw an unexpected error.`,
    };
  }
  const endTime = new Date().toISOString();
  return { raw, startTime, endTime };
}

// ---------------------------------------------------------------------------------------------------------
// 5. Result Normalizer
// ---------------------------------------------------------------------------------------------------------

const KNOWN_OUTCOMES = new Set(["success", "failure", "cancelled"]);

/**
 * Normalizes a Provider Adapter's own raw response shape into the fixed, provider-neutral execution result
 * schema (status/modifiedFiles/testsExecuted/testsPassed/warnings/errors/executionSummary/providerEvidence).
 * This is the one place any future provider's response shape gets translated -- callers downstream of this
 * function never need to know which provider actually ran. Fails closed on an unrecognized outcome rather
 * than guessing. providerEvidence is optional on the raw response (the stub provider never sets it, since it
 * never actually invoked anything real to give evidence about) and defaults to null rather than being
 * fabricated.
 * @param {object} raw a Provider Adapter's raw response
 * @returns {{status: string, modifiedFiles: string[], testsExecuted: number, testsPassed: number, warnings: string[], errors: string[], executionSummary: string, providerEvidence: (object|null)}}
 */
function normalizeProviderResult(raw) {
  if (!raw || !KNOWN_OUTCOMES.has(raw.outcome)) {
    throw new Error(`Provider returned an unrecognized outcome "${raw && raw.outcome}"; expected one of: ${[...KNOWN_OUTCOMES].join(", ")}.`);
  }
  return {
    status: raw.outcome,
    modifiedFiles: raw.filesChanged || [],
    testsExecuted: raw.testsRun || 0,
    testsPassed: raw.testsOk || 0,
    warnings: raw.notes || [],
    errors: raw.problems || [],
    executionSummary: raw.summary || `Execution completed with status ${raw.outcome}.`,
    providerEvidence: raw.providerEvidence || null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Execution record builders
// ---------------------------------------------------------------------------------------------------------

function baseExecutionFields() {
  return {
    generatedFrom: path.relative(root, requestPath).split(path.sep).join("/"),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Builds the execution record for the case where implementation-request.json had no selected recommendation
 * to begin with -- a valid, expected upstream state (Decision Engine v1 selected nothing), not a failure.
 * @param {object} request parsed implementation-request.json
 * @returns {object} matching execution.json's shape
 */
function buildSkippedExecution(request) {
  return {
    ...baseExecutionFields(),
    status: "skipped",
    provider: null,
    requestId: request.requestId ?? null,
    requestTitle: request.title ?? null,
    startTime: null,
    endTime: null,
    modifiedFiles: [],
    testsExecuted: 0,
    testsPassed: 0,
    warnings: [],
    errors: [],
    executionSummary: "implementation-request.json contained no selected recommendation; there is nothing to execute.",
    providerEvidence: null,
  };
}

/**
 * Builds the execution record for the case where Policy Validator refused to allow execution. The Provider
 * Adapter is never invoked in this case.
 * @param {object} request parsed implementation-request.json
 * @param {{violations: string[]}} policy result of validateExecutionPolicy()
 * @returns {object} matching execution.json's shape
 */
function buildBlockedExecution(request, policy) {
  return {
    ...baseExecutionFields(),
    status: "blocked",
    provider: null,
    requestId: request.requestId,
    requestTitle: request.title ?? null,
    startTime: null,
    endTime: null,
    modifiedFiles: [],
    testsExecuted: 0,
    testsPassed: 0,
    warnings: [],
    errors: policy.violations,
    executionSummary: `Execution was blocked by policy: ${policy.violations.length} violation(s) found.`,
    providerEvidence: null,
  };
}

/**
 * Builds the execution record for a request that actually ran through a Provider Adapter (regardless of
 * whether the provider itself reported success, failure, or cancellation).
 * @param {object} request parsed implementation-request.json
 * @param {string} provider the provider name that was invoked
 * @param {string} startTime
 * @param {string} endTime
 * @param {object} normalized result of normalizeProviderResult()
 * @returns {object} matching execution.json's shape
 */
function buildCompletedExecution(request, provider, startTime, endTime, normalized) {
  return {
    ...baseExecutionFields(),
    status: normalized.status,
    provider,
    requestId: request.requestId,
    requestTitle: request.title ?? null,
    startTime,
    endTime,
    modifiedFiles: normalized.modifiedFiles,
    testsExecuted: normalized.testsExecuted,
    testsPassed: normalized.testsPassed,
    warnings: normalized.warnings,
    errors: normalized.errors,
    executionSummary: normalized.executionSummary,
    providerEvidence: normalized.providerEvidence,
  };
}

// ---------------------------------------------------------------------------------------------------------
// 6. Report Generator
// ---------------------------------------------------------------------------------------------------------

function buildNextStepText(execution) {
  switch (execution.status) {
    case "skipped":
      return "Run the earlier stages of the pipeline again once Decision Engine v1 has selected a recommendation and Implementation Request Engine v1 has produced a request for it.";
    case "blocked":
      return "Resolve the policy violation(s) listed above -- typically by obtaining and recording human approval via EXECUTION_APPROVED=true -- then re-run this engine.";
    case "success":
      return "Review the modified files and test results above, then proceed with the repository's normal human review/merge process.";
    case "failure":
      return "Review the errors above, address the underlying issue, then re-run the Implementation Executor.";
    case "cancelled":
      return "No changes were made. Re-run the Implementation Executor once ready to proceed.";
    default:
      return "Review this report and decide the appropriate next step.";
  }
}

/**
 * Renders the human-readable Markdown report for a given execution record.
 * @param {object} execution result of buildSkippedExecution() / buildBlockedExecution() / buildCompletedExecution()
 * @returns {string}
 */
function renderMarkdown(execution) {
  const lines = [];
  lines.push("# Implementation Executor Report", "");
  lines.push(
    "Generated by `scripts/implementation-executor.js` -- this engine only invokes a Provider Adapter (stub-deterministic-v1 or claude-code-v1) against an already-built implementation request; it never generates recommendations, analyzes the repository, or makes engineering decisions.",
    ""
  );
  lines.push(`Source request: \`${execution.generatedFrom}\``, "");
  lines.push(`Timestamp: ${execution.timestamp}`, "");

  lines.push("## Status", "");
  lines.push(`**${execution.status}**`, "");

  lines.push("## Request", "");
  lines.push(`- Request ID: ${execution.requestId ?? "None"}`);
  lines.push(`- Title: ${execution.requestTitle ?? "None"}`);
  lines.push("");

  lines.push("## Provider", "");
  lines.push(execution.provider ? `\`${execution.provider}\`` : "None (not invoked)", "");

  lines.push("## Timing", "");
  lines.push(`- Start: ${execution.startTime ?? "N/A"}`);
  lines.push(`- End: ${execution.endTime ?? "N/A"}`);
  lines.push("");

  lines.push("## Modified Files", "");
  (execution.modifiedFiles.length ? execution.modifiedFiles : ["None"]).forEach((file) => lines.push(`- \`${file}\``));
  lines.push("");

  lines.push("## Tests", "");
  lines.push(`- Executed: ${execution.testsExecuted}`);
  lines.push(`- Passed: ${execution.testsPassed}`);
  lines.push("");

  lines.push("## Warnings", "");
  (execution.warnings.length ? execution.warnings : ["None"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Errors", "");
  (execution.errors.length ? execution.errors : ["None"]).forEach((entry) => lines.push(`- ${entry}`));
  lines.push("");

  lines.push("## Provider Evidence", "");
  if (execution.providerEvidence) {
    Object.entries(execution.providerEvidence).forEach(([key, value]) => lines.push(`- ${key}: ${value ?? "None"}`));
  } else {
    lines.push("None (no real provider evidence to report -- either no provider ran, or the provider that ran was simulated).");
  }
  lines.push("");

  lines.push("## Execution Summary", "");
  lines.push(execution.executionSummary, "");

  lines.push("## Next Step", "");
  lines.push(buildNextStepText(execution), "");

  return lines.join("\n");
}

/**
 * Builds patch-summary.json: a structured summary of what an execution actually changed, intended as the
 * primary input for a future Validation Engine and Pull Request Generator. v1's provider contract only
 * reports a flat list of modified files -- it does not distinguish created/modified/deleted files or
 * function-level changes, and does not report added/modified test counts separately from aggregate
 * testsExecuted/testsPassed. Rather than guess at that finer-grained detail, those fields are always left at
 * their honest empty/zero/false defaults until a future provider or parser can actually determine them from
 * real diff data.
 * @param {object} execution result of buildSkippedExecution() / buildBlockedExecution() / buildCompletedExecution()
 * @returns {object} matching patch-summary.json's shape
 */
function buildPatchSummary(execution) {
  return {
    requestId: execution.requestId,
    provider: execution.provider,
    modifiedFiles: execution.modifiedFiles,
    createdFiles: [],
    deletedFiles: [],
    functionsAdded: [],
    functionsModified: [],
    functionsRemoved: [],
    testsAdded: 0,
    testsModified: 0,
    breakingChangesDetected: false,
    summary: execution.executionSummary,
  };
}

/**
 * Writes execution.json, execution.md, and patch-summary.json into the output directory (created if
 * needed), returning their absolute paths.
 * @param {object} execution
 * @returns {{jsonPath: string, mdPath: string, patchPath: string}}
 */
function writeOutputs(execution) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "execution.json");
  const mdPath = path.join(outputDir, "execution.md");
  const patchPath = path.join(outputDir, "patch-summary.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(execution, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(execution)}\n`);
  fs.writeFileSync(patchPath, `${JSON.stringify(buildPatchSummary(execution), null, 2)}\n`);
  return { jsonPath, mdPath, patchPath };
}

function main() {
  const request = loadImplementationRequest(requestPath);
  const hasSelection = request.recommendationId !== null && request.recommendationId !== undefined;

  if (!hasSelection) {
    const execution = buildSkippedExecution(request);
    const { jsonPath, mdPath } = writeOutputs(execution);
    console.log(`Wrote ${path.relative(root, jsonPath)}`);
    console.log(`Wrote ${path.relative(root, mdPath)}`);
    return;
  }

  const policy = validateExecutionPolicy(request);
  if (!policy.allowed) {
    const execution = buildBlockedExecution(request, policy);
    const { jsonPath, mdPath } = writeOutputs(execution);
    console.log(`Wrote ${path.relative(root, jsonPath)}`);
    console.log(`Wrote ${path.relative(root, mdPath)}`);
    process.exitCode = 1;
    return;
  }

  const providerFn = resolveProvider(providerName);
  const { raw, startTime, endTime } = invokeProvider(providerFn, request);
  const normalized = normalizeProviderResult(raw);
  const execution = buildCompletedExecution(request, providerName, startTime, endTime, normalized);
  const { jsonPath, mdPath } = writeOutputs(execution);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
  if (execution.status !== "success") process.exitCode = 1;
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
  outputDir,
  DEFAULT_PROVIDER,
  providerName,
  PROVIDERS,
  loadImplementationRequest,
  isApproved,
  validateExecutionPolicy,
  resolveProvider,
  stubProviderAdapter,
  invokeProvider,
  normalizeProviderResult,
  buildSkippedExecution,
  buildBlockedExecution,
  buildCompletedExecution,
  buildPatchSummary,
  renderMarkdown,
  writeOutputs,
};
