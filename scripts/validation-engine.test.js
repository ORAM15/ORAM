#!/usr/bin/env node
// Validation Engine v1 regression coverage: every deterministic rule (RULE-001..RULE-006) is exercised
// against hand-crafted implementation-request.json/execution.json/patch-summary.json fixtures (decoupling
// these tests from the upstream engines' own internals), plus one true end-to-end run proving the real
// seven-stage chain actually works together.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/validation-engine.js"), "utf8");
const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");
const decisionEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");
const implRequestEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-request-engine.js"), "utf8");
const implExecutorSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-executor.js"), "utf8");

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
    goal: "Test module has grown complex.",
    affectedModules: ["Test"],
    affectedFiles: ["backend/test/a.js", "backend/test/b.js"],
    implementationConstraints: ["Implement only within the affected modules and files listed in this request."],
    acceptanceCriteria: ["All existing automated tests continue to pass."],
    validationChecklist: ["Run all relevant automated tests for every affected module."],
    nextStep: "This implementation request is ready for human review.",
    ...overrides,
  };
}

function executionFixture(overrides) {
  return {
    generatedFrom: "implementation-request/implementation-request.json",
    timestamp: "2026-01-02T00:10:00.000Z",
    status: "success",
    provider: "stub-deterministic-v1",
    requestId: "IR-1-20260102T000000000Z",
    requestTitle: "Extract Test logic into smaller units",
    startTime: "2026-01-02T00:09:00.000Z",
    endTime: "2026-01-02T00:09:01.000Z",
    modifiedFiles: ["backend/test/a.js", "backend/test/b.js"],
    testsExecuted: 2,
    testsPassed: 2,
    warnings: [],
    errors: [],
    executionSummary: "Execution succeeded.",
    providerEvidence: null,
    ...overrides,
  };
}

function patchSummaryFixture(overrides) {
  return {
    requestId: "IR-1-20260102T000000000Z",
    provider: "stub-deterministic-v1",
    modifiedFiles: ["backend/test/a.js", "backend/test/b.js"],
    createdFiles: [],
    deletedFiles: [],
    functionsAdded: [],
    functionsModified: [],
    functionsRemoved: [],
    testsAdded: 0,
    testsModified: 0,
    breakingChangesDetected: false,
    summary: "Execution succeeded.",
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

const SKIPPED_EXECUTION_FIXTURE = executionFixture({
  status: "skipped",
  provider: null,
  requestId: null,
  requestTitle: null,
  startTime: null,
  endTime: null,
  modifiedFiles: [],
  testsExecuted: 0,
  testsPassed: 0,
  executionSummary: "implementation-request.json contained no selected recommendation; there is nothing to execute.",
});

const SKIPPED_PATCH_SUMMARY_FIXTURE = patchSummaryFixture({
  requestId: null,
  provider: null,
  modifiedFiles: [],
  summary: SKIPPED_EXECUTION_FIXTURE.executionSummary,
});

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validation-engine-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/validation-engine.js"), source);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), decisionEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-request-engine.js"), implRequestEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-executor.js"), implExecutorSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/validation-engine.js"));
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

// 2. Missing execution artifact fails closed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadExecution(path.join(dir, "execution/execution.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/implementation-executor\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadExecution fails closed with an actionable error when execution.json is missing");
}

// 3. Missing patch summary fails closed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadPatchSummary(path.join(dir, "execution/patch-summary.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/implementation-executor\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadPatchSummary fails closed with an actionable error when patch-summary.json is missing");
}

// 4. Malformed JSON fails closed for all three artifacts.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  for (const [loader, file] of [
    [mod.loadImplementationRequest, path.join(dir, "implementation-request/implementation-request.json")],
    [mod.loadExecution, path.join(dir, "execution/execution.json")],
    [mod.loadPatchSummary, path.join(dir, "execution/patch-summary.json")],
  ]) {
    writeFile(file, "{ not valid json");
    let threw = null;
    try {
      loader(file);
    } catch (error) {
      threw = error;
    }
    if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error for ${file}, got: ${threw && threw.message}`);
  }
  ok("all three loaders fail closed on invalid JSON");
}

// 5. Successful validation: a clean success execution with only approved files modified, tests all passing,
//    and a compliant policy is approved for PR with every applicable rule passing.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const execution = executionFixture();
  const patchSummary = patchSummaryFixture();
  const validation = mod.buildValidation(request, execution, patchSummary);
  if (validation.status !== "approved" || validation.approvedForPR !== true) throw new Error(`expected an approved validation, got: ${JSON.stringify(validation)}`);
  if (validation.score !== 100) throw new Error(`expected a perfect score for an all-passing validation, got: ${validation.score}`);
  if (validation.errors.length !== 0) throw new Error("expected no errors for a fully passing validation");
  if (!validation.rules.every((rule) => rule.status === "PASS" || rule.status === "SKIPPED")) throw new Error("expected no FAIL rules in a fully passing validation");
  ok("a clean successful execution is approved for PR with a perfect score and no errors");
}

// 6. Failed execution: execution.json reports status "failure" -- RULE-001 fails, and approval is refused
//    regardless of any other rule's outcome.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const execution = executionFixture({ status: "failure", modifiedFiles: [], testsExecuted: 2, testsPassed: 0, errors: ["something failed"] });
  const patchSummary = patchSummaryFixture({ modifiedFiles: [] });
  const validation = mod.buildValidation(request, execution, patchSummary);
  if (validation.approvedForPR !== false || validation.status !== "rejected") throw new Error("expected a failed execution to never be approved for PR");
  const rule001 = validation.rules.find((rule) => rule.id === "RULE-001");
  if (rule001.status !== "FAIL") throw new Error(`expected RULE-001 to FAIL for a failed execution, got: ${rule001.status}`);
  ok("a failed execution correctly fails RULE-001 and is never approved for PR");
}

// 7. Modified unapproved files: a file outside implementation-request.json's affectedFiles was modified --
//    RULE-002 fails even though the execution otherwise reports success.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const execution = executionFixture({ modifiedFiles: ["backend/test/a.js", "backend/test/b.js", "backend/UNAPPROVED/rogue.js"] });
  const patchSummary = patchSummaryFixture({ modifiedFiles: execution.modifiedFiles });
  const validation = mod.buildValidation(request, execution, patchSummary);
  const rule002 = validation.rules.find((rule) => rule.id === "RULE-002");
  if (rule002.status !== "FAIL" || !rule002.details.includes("backend/UNAPPROVED/rogue.js")) throw new Error(`expected RULE-002 to FAIL and name the unapproved file, got: ${JSON.stringify(rule002)}`);
  if (validation.approvedForPR !== false) throw new Error("expected an out-of-scope file modification to block PR approval");
  ok("a file modified outside the approved affectedFiles list fails RULE-002 and blocks PR approval");
}

// 8. Failed tests: some executed tests did not pass -- RULE-004 fails.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const execution = executionFixture({ testsExecuted: 5, testsPassed: 3 });
  const patchSummary = patchSummaryFixture();
  const validation = mod.buildValidation(request, execution, patchSummary);
  const rule003 = validation.rules.find((rule) => rule.id === "RULE-003");
  const rule004 = validation.rules.find((rule) => rule.id === "RULE-004");
  if (rule003.status !== "PASS") throw new Error(`expected RULE-003 to PASS (tests did execute), got: ${rule003.status}`);
  if (rule004.status !== "FAIL" || !/2 of 5/.test(rule004.details)) throw new Error(`expected RULE-004 to FAIL naming 2 of 5 failing, got: ${JSON.stringify(rule004)}`);
  if (validation.approvedForPR !== false) throw new Error("expected failing tests to block PR approval");
  ok("failing tests correctly pass RULE-003 (tests did execute) but fail RULE-004 (not all passed), blocking approval");
}

// 9. Provider evidence: complete, well-formed evidence for a real provider passes RULE-005; incomplete
//    evidence fails it.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();

  const goodEvidence = { providerName: "Claude Code", providerVersion: null, executionMode: "real", invocationId: "inv-1", exitCode: 0, durationMs: 42 };
  const goodExecution = executionFixture({ provider: "claude-code-v1", providerEvidence: goodEvidence });
  const goodValidation = mod.buildValidation(request, goodExecution, patchSummaryFixture({ provider: "claude-code-v1" }));
  const goodRule005 = goodValidation.rules.find((rule) => rule.id === "RULE-005");
  if (goodRule005.status !== "PASS") throw new Error(`expected RULE-005 to PASS for complete providerEvidence, got: ${JSON.stringify(goodRule005)}`);

  const badEvidence = { providerName: "", executionMode: "real" };
  const badExecution = executionFixture({ provider: "claude-code-v1", providerEvidence: badEvidence });
  const badValidation = mod.buildValidation(request, badExecution, patchSummaryFixture({ provider: "claude-code-v1" }));
  const badRule005 = badValidation.rules.find((rule) => rule.id === "RULE-005");
  if (badRule005.status !== "FAIL") throw new Error(`expected RULE-005 to FAIL for incomplete providerEvidence, got: ${JSON.stringify(badRule005)}`);

  ok("complete providerEvidence passes RULE-005, and incomplete/malformed evidence fails it");
}

// 10. Policy violation: implementation-request.json's executionPolicy declares a disallowed permission --
//     RULE-006 fails even though execution itself succeeded; and a "blocked" execution also fails RULE-006.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture({ executionPolicy: { ...requestFixture().executionPolicy, allowBreakingChanges: true } });
  const validation = mod.buildValidation(request, executionFixture(), patchSummaryFixture());
  const rule006 = validation.rules.find((rule) => rule.id === "RULE-006");
  if (rule006.status !== "FAIL" || !/allowBreakingChanges/.test(rule006.details)) throw new Error(`expected RULE-006 to FAIL naming allowBreakingChanges, got: ${JSON.stringify(rule006)}`);
  if (validation.approvedForPR !== false) throw new Error("expected a disallowed policy permission to block PR approval");

  const blockedExecution = executionFixture({ status: "blocked", modifiedFiles: [], testsExecuted: 0, testsPassed: 0, errors: ["executionPolicy.requireHumanApproval is true, but no human approval was recorded."] });
  const blockedValidation = mod.buildValidation(requestFixture(), blockedExecution, patchSummaryFixture({ modifiedFiles: [] }));
  const blockedRule006 = blockedValidation.rules.find((rule) => rule.id === "RULE-006");
  if (blockedRule006.status !== "FAIL") throw new Error(`expected RULE-006 to FAIL for a blocked execution, got: ${blockedRule006.status}`);

  ok("a disallowed executionPolicy permission and a blocked execution both fail RULE-006 and block PR approval");
}

// 11. Stub provider: providerEvidence is null (as the deterministic stub always produces) -- RULE-005 is
//     correctly SKIPPED, not FAILed, and does not block approval.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = mod.buildValidation(requestFixture(), executionFixture(), patchSummaryFixture());
  const rule005 = validation.rules.find((rule) => rule.id === "RULE-005");
  if (rule005.status !== "SKIPPED") throw new Error(`expected RULE-005 to be SKIPPED for the stub provider (no providerEvidence), got: ${rule005.status}`);
  if (validation.approvedForPR !== true) throw new Error("expected a SKIPPED rule to never block PR approval on its own");
  ok("the stub provider's null providerEvidence correctly SKIPs RULE-005 rather than failing it, and does not block approval");
}

// 12. CLI: fails closed with no artifacts present; succeeds (approved, exit 0) for a clean success; exits
//     non-zero (rejected) when a rule fails.
{
  const dir = makeFixture();
  const failResult = spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });
  if (failResult.status === 0) throw new Error(`expected the CLI to fail closed with no artifacts present:\n${failResult.stdout}`);
  if (!/implementation-request\.json not found/.test(failResult.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${failResult.stderr}`);

  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  writeJson(path.join(dir, "execution/execution.json"), executionFixture());
  writeJson(path.join(dir, "execution/patch-summary.json"), patchSummaryFixture());
  const okResult = spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });
  if (okResult.status !== 0) throw new Error(`expected the CLI to succeed for a clean validation:\n${okResult.stdout}\n${okResult.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(dir, "validation/validation.json"), "utf8"));
  if (written.approvedForPR !== true) throw new Error("expected the CLI-written validation to be approved");

  writeJson(path.join(dir, "execution/execution.json"), executionFixture({ status: "failure" }));
  const rejectedResult = spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });
  if (rejectedResult.status === 0) throw new Error("expected the CLI to exit non-zero for a rejected validation");
  const rejectedWritten = JSON.parse(fs.readFileSync(path.join(dir, "validation/validation.json"), "utf8"));
  if (rejectedWritten.status !== "rejected") throw new Error(`expected a rejected validation to be written, got: ${rejectedWritten.status}`);

  ok("the CLI fails closed with no artifacts, succeeds (exit 0) for an approved validation, and exits non-zero for a rejected one");
}

// 13. Markdown generation includes every required section and renders the rules table.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = mod.buildValidation(requestFixture(), executionFixture(), patchSummaryFixture());
  const markdown = mod.renderMarkdown(validation);
  for (const heading of ["# Validation Engine Report", "## Status", "## Score", "## Approved For PR", "## Rules", "## Warnings", "## Errors", "## Next Step"]) {
    if (!markdown.includes(heading)) throw new Error(`expected markdown to include "${heading}"`);
  }
  for (const rule of validation.rules) {
    if (!markdown.includes(rule.id)) throw new Error(`expected the rules table to include ${rule.id}`);
  }
  ok("renderMarkdown includes every required section and lists every rule");
}

// 14. Empty implementation request: nothing was selected upstream -- every applicable rule is SKIPPED,
//     overall status is "skipped", and it is never approved for PR (there is nothing to approve).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = mod.buildValidation(EMPTY_REQUEST_FIXTURE, SKIPPED_EXECUTION_FIXTURE, SKIPPED_PATCH_SUMMARY_FIXTURE);
  if (validation.status !== "skipped") throw new Error(`expected status "skipped" for an empty implementation request, got: ${validation.status}`);
  if (validation.approvedForPR !== false) throw new Error("expected an empty implementation request to never be approved for PR");
  if (!validation.rules.every((rule) => rule.status === "SKIPPED")) throw new Error(`expected every rule to be SKIPPED for an empty implementation request, got: ${JSON.stringify(validation.rules)}`);
  if (validation.score !== 0) throw new Error(`expected an honest score of 0 when nothing was applicable, got: ${validation.score}`);
  ok("an empty implementation request correctly SKIPs every rule and is never approved for PR");
}

// 15. Artifact consistency: mismatched requestId/provider across execution.json and patch-summary.json (a
//     stale-artifact scenario) fails closed before any rule is evaluated.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.assertConsistentArtifacts(requestFixture(), executionFixture(), patchSummaryFixture({ requestId: "IR-999-different" }));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/does not match/.test(threw.message)) throw new Error(`expected a clear artifact-mismatch error, got: ${threw && threw.message}`);

  let threw2 = null;
  try {
    mod.assertConsistentArtifacts(requestFixture(), executionFixture({ requestId: "IR-999-different" }), patchSummaryFixture());
  } catch (error) {
    threw2 = error;
  }
  if (!threw2 || !/does not match/.test(threw2.message)) throw new Error(`expected a clear artifact-mismatch error, got: ${threw2 && threw2.message}`);

  // A genuinely consistent skipped-pipeline triple (all requestId/provider null) must NOT be treated as a
  // mismatch -- null === null is a legitimate match, not a contradiction.
  mod.assertConsistentArtifacts(EMPTY_REQUEST_FIXTURE, SKIPPED_EXECUTION_FIXTURE, SKIPPED_PATCH_SUMMARY_FIXTURE);

  ok("mismatched requestId/provider across artifacts fails closed before any rule runs, while a consistent all-null skipped triple is correctly accepted");
}

// 16. End-to-end execution: the real seven-stage chain (repository-intelligence.js -> engineering-
//     knowledge.js -> recommendation-engine.js -> decision-engine.js -> implementation-request-engine.js ->
//     implementation-executor.js -> validation-engine.js), using the real upstream sources and the real
//     deterministic stub provider, produces a valid, internally-consistent validation record.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js", "implementation-request-engine.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }
  const executorRun = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8", env: { ...process.env, EXECUTION_APPROVED: "true" } });
  if (executorRun.status !== 0) throw new Error(`implementation-executor.js run failed:\n${executorRun.stdout}\n${executorRun.stderr}`);

  const validationRun = spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });
  const jsonPath = path.join(dir, "validation", "validation.json");
  const mdPath = path.join(dir, "validation", "validation.md");
  if (!fs.existsSync(jsonPath)) throw new Error("expected validation.json to be produced by the real end-to-end chain");
  if (!fs.existsSync(mdPath)) throw new Error("expected validation.md to be produced by the real end-to-end chain");

  const validation = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const execution = JSON.parse(fs.readFileSync(path.join(dir, "execution", "execution.json"), "utf8"));
  if (execution.status === "skipped") {
    if (validation.status !== "skipped" || validationRun.status !== 0) throw new Error("expected a skipped real execution to produce a skipped, exit-0 validation");
  } else if (execution.status === "success") {
    if (validation.status !== "approved" || validationRun.status !== 0) throw new Error(`expected a real successful stub execution to be approved, got: ${JSON.stringify(validation)}`);
  }

  ok("the real seven-stage chain produces a valid, internally-consistent validation record end to end");
}

console.log("All Validation Engine v1 regression scenarios passed.");
