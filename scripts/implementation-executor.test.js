#!/usr/bin/env node
// Implementation Executor v1 regression coverage: every deterministic stage (Request Loader, Policy
// Validator, Runtime Adapter, Provider Adapter, Result Normalizer, Report Generator) is exercised against
// hand-crafted implementation-request.json fixtures (decoupling these tests from Implementation Request
// Engine's own internals), plus one true end-to-end run proving the real six-stage chain actually works
// together -- including the human-approval policy gate against the real request shape.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/implementation-executor.js"), "utf8");
const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");
const decisionEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");
const implRequestEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-request-engine.js"), "utf8");

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function requestFixture(overrides) {
  return {
    generatedFrom: "decision/decision.json",
    recommendationsSource: "recommendations/recommendations.json",
    sourceProjectName: "Fixture Project",
    sourceDecisionId: "2026-01-02T00:00:00.000Z",
    executionPolicy: {
      allowBreakingChanges: false,
      allowDatabaseMigration: false,
      allowDependencyUpdates: false,
      requireTests: true,
      requireHumanApproval: true,
    },
    timestamp: "2026-01-02T00:05:00.000Z",
    requestId: "IR-1-20260102T000000000Z",
    recommendationId: 1,
    title: "Extract Test logic into smaller units",
    goal: "Test module has grown complex. Extracting focused units would reduce complexity without changing behavior.",
    affectedModules: ["Test"],
    affectedFiles: ["backend/test/a.js", "backend/test/b.js"],
    implementationConstraints: ["Implement only within the affected modules and files listed in this request."],
    acceptanceCriteria: ["All existing automated tests continue to pass."],
    validationChecklist: ["Run all relevant automated tests for every affected module."],
    nextStep: "This implementation request is ready for human review.",
    ...overrides,
  };
}

const EMPTY_REQUEST_FIXTURE = requestFixture({
  requestId: null,
  recommendationId: null,
  title: null,
  goal: null,
  affectedModules: [],
  affectedFiles: [],
  implementationConstraints: [],
  acceptanceCriteria: [],
  validationChecklist: [],
  nextStep: "No decision was available to act on.",
});

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "implementation-executor-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/implementation-executor.js"), source);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), decisionEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-request-engine.js"), implRequestEngineSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/implementation-executor.js"));
}

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Missing implementation request fails closed with a clear, actionable message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadImplementationRequest(path.join(dir, "implementation-request/implementation-request.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/implementation-request-engine\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadImplementationRequest fails closed with an actionable error when implementation-request.json is missing");
}

// 2. Invalid request: both invalid JSON and structurally-invalid (but parseable) content fail closed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const file = path.join(dir, "implementation-request/implementation-request.json");

  writeFile(file, "{ not valid json");
  let threw = null;
  try {
    mod.loadImplementationRequest(file);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error, got: ${threw && threw.message}`);

  writeJson(file, requestFixture({ executionPolicy: undefined }));
  let threw2 = null;
  try {
    mod.loadImplementationRequest(file);
  } catch (error) {
    threw2 = error;
  }
  if (!threw2 || !/missing required field\(s\).*executionPolicy/.test(threw2.message)) {
    throw new Error(`expected a clear missing-field error for a structurally invalid request, got: ${threw2 && threw2.message}`);
  }

  writeJson(file, requestFixture({ affectedFiles: "not-an-array" }));
  let threw3 = null;
  try {
    mod.loadImplementationRequest(file);
  } catch (error) {
    threw3 = error;
  }
  if (!threw3 || !/non-array affectedFiles/.test(threw3.message)) throw new Error(`expected a clear non-array affectedFiles error, got: ${threw3 && threw3.message}`);

  ok("loadImplementationRequest fails closed on invalid JSON and on structurally invalid requests");
}

// 3. An empty request (no selected recommendation) is handled gracefully: skipped, not an error, and the
//    Provider Adapter is never invoked.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const execution = mod.buildSkippedExecution(EMPTY_REQUEST_FIXTURE);
  if (execution.status !== "skipped") throw new Error(`expected status "skipped", got: ${execution.status}`);
  if (execution.provider !== null) throw new Error("expected provider to be null when nothing was executed");
  if (execution.modifiedFiles.length !== 0 || execution.testsExecuted !== 0) throw new Error("expected no simulated activity for a skipped execution");
  ok("an empty implementation request produces a graceful skipped execution without invoking any provider");
}

// 4. Policy violations: breaking changes / database migration / dependency updates are never permitted, and
//    a required-but-unrecorded human approval blocks execution -- in every case the Provider Adapter must
//    never be invoked.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);

  const breaking = mod.validateExecutionPolicy(requestFixture({ executionPolicy: { ...requestFixture().executionPolicy, allowBreakingChanges: true, requireHumanApproval: false } }));
  if (breaking.allowed || !breaking.violations.some((v) => /allowBreakingChanges/.test(v))) throw new Error("expected allowBreakingChanges:true to be a policy violation");

  const migration = mod.validateExecutionPolicy(requestFixture({ executionPolicy: { ...requestFixture().executionPolicy, allowDatabaseMigration: true, requireHumanApproval: false } }));
  if (migration.allowed || !migration.violations.some((v) => /allowDatabaseMigration/.test(v))) throw new Error("expected allowDatabaseMigration:true to be a policy violation");

  const deps = mod.validateExecutionPolicy(requestFixture({ executionPolicy: { ...requestFixture().executionPolicy, allowDependencyUpdates: true, requireHumanApproval: false } }));
  if (deps.allowed || !deps.violations.some((v) => /allowDependencyUpdates/.test(v))) throw new Error("expected allowDependencyUpdates:true to be a policy violation");

  const unapproved = mod.validateExecutionPolicy(requestFixture());
  if (unapproved.allowed || !unapproved.violations.some((v) => /human approval/.test(v))) throw new Error("expected requireHumanApproval:true without EXECUTION_APPROVED to be a policy violation");

  const approved = withEnv({ EXECUTION_APPROVED: "true" }, () => mod.validateExecutionPolicy(requestFixture()));
  if (!approved.allowed) throw new Error("expected EXECUTION_APPROVED=true to satisfy executionPolicy.requireHumanApproval");

  const safe = mod.validateExecutionPolicy(requestFixture({ executionPolicy: { ...requestFixture().executionPolicy, requireHumanApproval: false } }));
  if (!safe.allowed) throw new Error("expected an all-safe policy with no approval requirement to be allowed");

  const blockedExecution = mod.buildBlockedExecution(requestFixture(), unapproved);
  if (blockedExecution.status !== "blocked" || blockedExecution.provider !== null) throw new Error("expected a blocked execution record with no provider invoked");
  if (blockedExecution.errors.length !== unapproved.violations.length) throw new Error("expected blocked execution errors to carry every policy violation");

  ok("policy violations (breaking changes, database migration, dependency updates, unrecorded human approval) are all correctly detected and block execution before any provider runs");
}

// 5. Successful execution: the stub provider deterministically reports success, and modifiedFiles/tests are
//    grounded in the request's own affectedFiles.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const { raw, startTime, endTime } = withEnv({ EXECUTION_STUB_OUTCOME: "success" }, () => mod.invokeProvider(mod.stubProviderAdapter, request));
  const normalized = mod.normalizeProviderResult(raw);
  if (normalized.status !== "success") throw new Error(`expected status "success", got: ${normalized.status}`);
  if (JSON.stringify(normalized.modifiedFiles) !== JSON.stringify(request.affectedFiles)) throw new Error("expected modifiedFiles to equal the request's affectedFiles on success");
  if (normalized.testsExecuted !== request.affectedFiles.length || normalized.testsPassed !== request.affectedFiles.length) throw new Error("expected all simulated tests to pass on success");
  if (normalized.errors.length !== 0) throw new Error("expected no errors on a successful execution");
  const execution = mod.buildCompletedExecution(request, "stub-deterministic-v1", startTime, endTime, normalized);
  if (execution.status !== "success" || !execution.startTime || !execution.endTime) throw new Error("expected a fully-populated successful execution record");
  ok("a successful stub execution produces a grounded execution record with matching modifiedFiles/tests");
}

// 6. Failed execution: the stub provider deterministically reports failure (tests ran but none passed, no
//    files modified), and a provider that throws is isolated by the Runtime Adapter into the same failure
//    shape instead of crashing the executor.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();

  const { raw } = withEnv({ EXECUTION_STUB_OUTCOME: "failure" }, () => mod.invokeProvider(mod.stubProviderAdapter, request));
  const normalized = mod.normalizeProviderResult(raw);
  if (normalized.status !== "failure") throw new Error(`expected status "failure", got: ${normalized.status}`);
  if (normalized.modifiedFiles.length !== 0 || normalized.testsPassed !== 0) throw new Error("expected no modified files and zero passing tests on failure");
  if (normalized.errors.length === 0) throw new Error("expected at least one error message on failure");

  const thrown = withEnv({ EXECUTION_STUB_OUTCOME: "throw" }, () => mod.invokeProvider(mod.stubProviderAdapter, request));
  const normalizedThrown = mod.normalizeProviderResult(thrown.raw);
  if (normalizedThrown.status !== "failure") throw new Error("expected the Runtime Adapter to isolate a thrown provider exception into a failure result");
  if (!normalizedThrown.errors.some((e) => /threw an unexpected error/.test(e))) throw new Error("expected the isolated failure to explain that the provider threw");

  ok("failed execution is correctly reported both when the provider self-reports failure and when it throws unexpectedly");
}

// 7. Cancelled execution: the stub provider deterministically reports cancellation with no changes made.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const { raw } = withEnv({ EXECUTION_STUB_OUTCOME: "cancelled" }, () => mod.invokeProvider(mod.stubProviderAdapter, request));
  const normalized = mod.normalizeProviderResult(raw);
  if (normalized.status !== "cancelled") throw new Error(`expected status "cancelled", got: ${normalized.status}`);
  if (normalized.modifiedFiles.length !== 0 || normalized.testsExecuted !== 0) throw new Error("expected no activity for a cancelled execution");
  if (normalized.warnings.length === 0) throw new Error("expected a warning explaining the cancellation");
  ok("cancelled execution is correctly reported with no simulated changes and no tests run");
}

// 8. Normalization: Result Normalizer correctly translates a provider-specific raw shape (as the stub
//    provider itself uses: filesChanged/testsRun/testsOk/notes/problems) into the fixed canonical schema,
//    independent of any specific provider -- and fails closed on an unrecognized outcome.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const normalized = mod.normalizeProviderResult({
    outcome: "success",
    filesChanged: ["x.js", "y.js"],
    testsRun: 4,
    testsOk: 4,
    notes: ["a note"],
    problems: [],
    summary: "custom summary",
  });
  if (normalized.status !== "success") throw new Error("expected outcome to map to status");
  if (JSON.stringify(normalized.modifiedFiles) !== JSON.stringify(["x.js", "y.js"])) throw new Error("expected filesChanged to map to modifiedFiles");
  if (normalized.testsExecuted !== 4 || normalized.testsPassed !== 4) throw new Error("expected testsRun/testsOk to map to testsExecuted/testsPassed");
  if (JSON.stringify(normalized.warnings) !== JSON.stringify(["a note"])) throw new Error("expected notes to map to warnings");
  if (normalized.executionSummary !== "custom summary") throw new Error("expected summary to map to executionSummary");

  const defaulted = mod.normalizeProviderResult({ outcome: "cancelled" });
  if (JSON.stringify(defaulted.modifiedFiles) !== "[]" || defaulted.testsExecuted !== 0) throw new Error("expected missing provider fields to default to empty/zero, not throw");

  let threw = null;
  try {
    mod.normalizeProviderResult({ outcome: "not-a-real-outcome" });
  } catch (error) {
    threw = error;
  }
  if (!threw || !/unrecognized outcome/.test(threw.message)) throw new Error(`expected normalizeProviderResult to fail closed on an unrecognized outcome, got: ${threw && threw.message}`);

  ok("Result Normalizer correctly translates provider-specific field names into the canonical schema and fails closed on unrecognized outcomes");
}

// 9. CLI: fails closed with no implementation-request.json; succeeds (status success) once approved; is
//    blocked (status blocked, non-zero exit) without approval; and an unknown EXECUTION_PROVIDER fails closed.
{
  const dir = makeFixture();
  const failResult = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8" });
  if (failResult.status === 0) throw new Error(`expected the CLI to fail closed with no implementation-request.json present:\n${failResult.stdout}`);
  if (!/implementation-request\.json not found/.test(failResult.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${failResult.stderr}`);

  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());

  const blockedResult = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8" });
  if (blockedResult.status === 0) throw new Error(`expected the CLI to exit non-zero when execution is blocked by policy:\n${blockedResult.stdout}`);
  const blockedWritten = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (blockedWritten.status !== "blocked") throw new Error(`expected a blocked execution record without EXECUTION_APPROVED, got: ${blockedWritten.status}`);

  const successResult = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8", env: { ...process.env, EXECUTION_APPROVED: "true" } });
  if (successResult.status !== 0) throw new Error(`expected the CLI to succeed once approved:\n${successResult.stdout}\n${successResult.stderr}`);
  const successWritten = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (successWritten.status !== "success" || successWritten.provider !== "stub-deterministic-v1") throw new Error(`expected a successful stub-deterministic-v1 execution, got: ${JSON.stringify(successWritten)}`);

  const unknownProviderResult = spawnSync("node", ["scripts/implementation-executor.js"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXECUTION_APPROVED: "true", EXECUTION_PROVIDER: "not-a-real-provider" },
  });
  if (unknownProviderResult.status === 0) throw new Error(`expected the CLI to fail closed on an unknown provider:\n${unknownProviderResult.stdout}`);
  if (!/Unknown execution provider/.test(unknownProviderResult.stderr)) throw new Error(`expected a clear unknown-provider error, got:\n${unknownProviderResult.stderr}`);

  ok("the CLI fails closed with no input, blocks without approval, succeeds once approved, and fails closed on an unknown provider");
}

// 10. Environment overrides: IMPLEMENTATION_REQUEST_PATH and EXECUTION_OUTPUT_DIR both override the default
//     locations, and EXECUTION_PROVIDER overrides the default provider name.
{
  const dir = makeFixture();
  const customRequest = path.join(dir, "custom-request/implementation-request.json");
  writeJson(customRequest, requestFixture());
  withEnv(
    {
      IMPLEMENTATION_REQUEST_PATH: "custom-request/implementation-request.json",
      EXECUTION_OUTPUT_DIR: "custom-output/nested",
      EXECUTION_PROVIDER: "stub-deterministic-v1",
    },
    () => {
      const mod = requireFixture(dir);
      if (mod.requestPath !== customRequest) throw new Error(`expected overridden request path, got: ${mod.requestPath}`);
      if (mod.outputDir !== path.join(dir, "custom-output", "nested")) throw new Error(`expected overridden output directory, got: ${mod.outputDir}`);
      if (mod.providerName !== "stub-deterministic-v1") throw new Error(`expected overridden provider name, got: ${mod.providerName}`);
      const request = mod.loadImplementationRequest(mod.requestPath);
      const { jsonPath, mdPath } = mod.writeOutputs(mod.buildSkippedExecution(request));
      if (path.basename(jsonPath) !== "execution.json" || path.basename(mdPath) !== "execution.md") throw new Error("expected the fixed execution.json/execution.md output filenames");
      if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error("expected both output files to exist under the overridden output directory");
    }
  );
  ok("IMPLEMENTATION_REQUEST_PATH, EXECUTION_OUTPUT_DIR, and EXECUTION_PROVIDER override the default locations/provider");
}

// 11. Markdown generation includes every required section for the success, blocked, and skipped cases.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const { raw, startTime, endTime } = withEnv({ EXECUTION_STUB_OUTCOME: "success" }, () => mod.invokeProvider(mod.stubProviderAdapter, request));
  const successMd = mod.renderMarkdown(mod.buildCompletedExecution(request, "stub-deterministic-v1", startTime, endTime, mod.normalizeProviderResult(raw)));
  for (const heading of ["# Implementation Executor Report", "## Status", "## Request", "## Provider", "## Timing", "## Modified Files", "## Tests", "## Warnings", "## Errors", "## Execution Summary", "## Next Step"]) {
    if (!successMd.includes(heading)) throw new Error(`expected markdown to include "${heading}"`);
  }
  const blockedMd = mod.renderMarkdown(mod.buildBlockedExecution(request, { violations: ["some violation"] }));
  if (!blockedMd.includes("some violation")) throw new Error("expected blocked markdown to list policy violations");
  const skippedMd = mod.renderMarkdown(mod.buildSkippedExecution(EMPTY_REQUEST_FIXTURE));
  if (!skippedMd.includes("None (not invoked)")) throw new Error("expected skipped markdown to report no provider was invoked");
  ok("renderMarkdown includes every required section across the success, blocked, and skipped cases");
}

// 12. End-to-end execution: the real six-stage chain (repository-intelligence.js -> engineering-knowledge.js
//     -> recommendation-engine.js -> decision-engine.js -> implementation-request-engine.js ->
//     implementation-executor.js), using the real upstream sources, actually wires together. The isolated
//     temp directory contains only a handful of copied script files, so the real chain honestly selects
//     nothing to do (exactly like Implementation Request Engine's own end-to-end test observed) -- this
//     proves the chain integrates correctly end to end and that the executor's graceful "skipped" path (not
//     a fabricated result) is what a real empty selection produces. The policy-gate (blocked vs. success)
//     behavior against a real, non-empty, requireHumanApproval:true request is covered by CLI scenario 9
//     above using a realistic implementation-request.json fixture.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js", "implementation-request-engine.js", "implementation-executor.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }

  const jsonPath = path.join(dir, "execution", "execution.json");
  const mdPath = path.join(dir, "execution", "execution.md");
  if (!fs.existsSync(jsonPath)) throw new Error("expected execution.json to be produced by the real end-to-end chain");
  if (!fs.existsSync(mdPath)) throw new Error("expected execution.md to be produced by the real end-to-end chain");

  const execution = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const request = JSON.parse(fs.readFileSync(path.join(dir, "implementation-request", "implementation-request.json"), "utf8"));
  if (execution.requestId !== request.requestId) throw new Error("expected the execution record to reference the real request's own requestId");
  if (request.recommendationId === null && execution.status !== "skipped") throw new Error(`expected status "skipped" for a real empty selection, got: ${execution.status}`);

  ok("the real six-stage chain produces a valid, internally-consistent execution record end to end");
}

// 13. providerEvidence defaults to null for the stub provider (and for the skipped/blocked cases): it is
//     never fabricated for a provider that has no real evidence to report.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  if (mod.buildSkippedExecution(EMPTY_REQUEST_FIXTURE).providerEvidence !== null) throw new Error("expected providerEvidence to be null for a skipped execution");
  if (mod.buildBlockedExecution(requestFixture(), { violations: ["x"] }).providerEvidence !== null) throw new Error("expected providerEvidence to be null for a blocked execution");
  const normalized = mod.normalizeProviderResult({ outcome: "success", filesChanged: [], testsRun: 1, testsOk: 1, notes: [], problems: [], summary: "ok" });
  if (normalized.providerEvidence !== null) throw new Error("expected providerEvidence to default to null when the provider's raw response did not include it (as the stub never does)");
  ok("providerEvidence defaults to null for the stub provider and for skipped/blocked executions, rather than being fabricated");
}

// 14. patch-summary.json is generated alongside execution.json/execution.md, with v1's honest empty
//     defaults for fields the generic provider contract cannot determine.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const { raw, startTime, endTime } = mod.invokeProvider(mod.stubProviderAdapter, request);
  const execution = mod.buildCompletedExecution(request, "stub-deterministic-v1", startTime, endTime, mod.normalizeProviderResult(raw));
  const patchSummary = mod.buildPatchSummary(execution);
  if (patchSummary.requestId !== execution.requestId || patchSummary.provider !== execution.provider) throw new Error("expected patch-summary.json to reference the same request/provider as execution.json");
  if (JSON.stringify(patchSummary.modifiedFiles) !== JSON.stringify(execution.modifiedFiles)) throw new Error("expected patch-summary.json's modifiedFiles to match execution.json's");
  for (const field of ["createdFiles", "deletedFiles", "functionsAdded", "functionsModified", "functionsRemoved"]) {
    if (!Array.isArray(patchSummary[field]) || patchSummary[field].length !== 0) throw new Error(`expected v1's honest empty default for ${field}`);
  }
  if (patchSummary.testsAdded !== 0 || patchSummary.testsModified !== 0) throw new Error("expected v1's honest zero default for testsAdded/testsModified");
  if (patchSummary.breakingChangesDetected !== false) throw new Error("expected breakingChangesDetected to default to false, never assumed");

  const { jsonPath, mdPath, patchPath } = mod.writeOutputs(execution);
  if (path.basename(patchPath) !== "patch-summary.json") throw new Error(`expected the output named patch-summary.json, got ${patchPath}`);
  if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath) || !fs.existsSync(patchPath)) throw new Error("expected execution.json, execution.md, and patch-summary.json to all be written");
  const writtenPatchSummary = JSON.parse(fs.readFileSync(patchPath, "utf8"));
  if (writtenPatchSummary.provider !== "stub-deterministic-v1") throw new Error("expected the written patch-summary.json to reflect the actual provider used");
  ok("writeOutputs generates patch-summary.json alongside execution.json/execution.md, with honest empty defaults for undeterminable fields");
}

console.log("All Implementation Executor v1 regression scenarios passed.");
