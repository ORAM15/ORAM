#!/usr/bin/env node
// Pull Request Generator v1 regression coverage: every deterministic derivation (title/branch name/summary/
// approval) is exercised against hand-crafted implementation-request.json/execution.json/patch-summary.json/
// validation.json fixtures (decoupling these tests from the upstream engines' own internals), plus one true
// end-to-end run proving the real eight-stage chain actually works together.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/pull-request-generator.js"), "utf8");
const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");
const decisionEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");
const implRequestEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-request-engine.js"), "utf8");
const implExecutorSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-executor.js"), "utf8");
const validationEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/validation-engine.js"), "utf8");

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
    acceptanceCriteria: ["All existing automated tests continue to pass.", "No behavior change is observable outside the modules/files listed as affected."],
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

function validationFixture(overrides) {
  return {
    generatedFrom: {
      implementationRequest: "implementation-request/implementation-request.json",
      execution: "execution/execution.json",
      patchSummary: "execution/patch-summary.json",
    },
    status: "approved",
    score: 100,
    approvedForPR: true,
    rules: [
      { id: "RULE-001", description: "Execution completed successfully.", status: "PASS", details: "ok" },
      { id: "RULE-002", description: "Only approved files modified.", status: "PASS", details: "ok" },
      { id: "RULE-003", description: "Tests executed.", status: "PASS", details: "ok" },
      { id: "RULE-004", description: "Tests passed.", status: "PASS", details: "ok" },
      { id: "RULE-005", description: "Provider evidence present for real providers.", status: "SKIPPED", details: "stub" },
      { id: "RULE-006", description: "Execution policy respected.", status: "PASS", details: "ok" },
    ],
    warnings: ["RULE-005: skipped for the stub provider"],
    errors: [],
    timestamp: "2026-01-02T00:15:00.000Z",
    ...overrides,
  };
}

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pull-request-generator-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/pull-request-generator.js"), source);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), decisionEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-request-engine.js"), implRequestEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-executor.js"), implExecutorSource);
    fs.writeFileSync(path.join(dir, "scripts/validation-engine.js"), validationEngineSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/pull-request-generator.js"));
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Missing validation artifact fails closed with a clear, actionable message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadValidation(path.join(dir, "validation/validation.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/validation-engine\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadValidation fails closed with an actionable error when validation.json is missing");
}

// 1b. Missing implementation-request/execution/patch-summary also fail closed (same loader convention).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  for (const [loader, name, command] of [
    [mod.loadImplementationRequest, "implementation-request.json", "node scripts/implementation-request-engine.js"],
    [mod.loadExecution, "execution.json", "node scripts/implementation-executor.js"],
    [mod.loadPatchSummary, "patch-summary.json", "node scripts/implementation-executor.js"],
  ]) {
    let threw = null;
    try {
      loader(path.join(dir, `does-not-exist/${name}`));
    } catch (error) {
      threw = error;
    }
    if (!threw || !new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(threw.message)) {
      throw new Error(`expected a clear missing-file error for ${name}, got: ${threw && threw.message}`);
    }
  }
  ok("loadImplementationRequest/loadExecution/loadPatchSummary all fail closed with actionable errors when missing");
}

// 2. Malformed (invalid JSON) validation.json fails closed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const file = path.join(dir, "validation/validation.json");
  writeFile(file, "{ not valid json");
  let threw = null;
  try {
    mod.loadValidation(file);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error, got: ${threw && threw.message}`);
  ok("loadValidation fails closed on invalid JSON");
}

// 3. Rejected validation (approvedForPR: false, status "rejected") fails closed: no artifact is generated.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = validationFixture({ approvedForPR: false, status: "rejected", score: 50 });
  let threw = null;
  try {
    mod.assertApprovedForPR(validation);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not approved/.test(threw.message) || !/rejected/.test(threw.message)) throw new Error(`expected a clear rejected-validation error, got: ${threw && threw.message}`);
  ok("a rejected validation fails closed with a clear, actionable error and generates nothing");
}

// 4. Skipped validation (nothing was executed upstream) also fails closed, with a distinct message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = validationFixture({ approvedForPR: false, status: "skipped", score: 0, rules: [] });
  let threw = null;
  try {
    mod.assertApprovedForPR(validation);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/nothing was executed/.test(threw.message)) throw new Error(`expected a clear skipped-validation error, got: ${threw && threw.message}`);
  ok("a skipped validation fails closed with a distinct, clear message");
}

// 5. Approved validation: the gate passes, and buildPullRequest produces a fully-grounded document.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const validation = validationFixture();
  mod.assertApprovedForPR(validation); // must not throw
  const request = requestFixture();
  const execution = executionFixture();
  const patchSummary = patchSummaryFixture();
  const pr = mod.buildPullRequest(request, execution, patchSummary, validation);
  if (pr.requestId !== request.requestId) throw new Error("expected requestId to be carried through verbatim");
  if (pr.recommendationId !== request.recommendationId) throw new Error("expected recommendationId to be carried through verbatim");
  if (pr.provider !== execution.provider) throw new Error("expected provider to be carried through verbatim");
  if (pr.testsExecuted !== execution.testsExecuted || pr.testsPassed !== execution.testsPassed) throw new Error("expected test counts to be carried through verbatim");
  if (JSON.stringify(pr.modifiedFiles) !== JSON.stringify(patchSummary.modifiedFiles)) throw new Error("expected modifiedFiles to come from patch-summary.json");
  if (pr.validationStatus !== validation.status) throw new Error("expected validationStatus to be carried through verbatim");
  if (pr.approval.approvedForPR !== true || pr.approval.rulesPassed !== 5 || pr.approval.rulesSkipped !== 1) throw new Error(`expected a correctly-derived approval summary, got: ${JSON.stringify(pr.approval)}`);
  ok("an approved validation passes the gate and produces a fully-grounded pull request document");
}

// 6. Markdown generation includes every required section.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const validation = validationFixture();
  const pr = mod.buildPullRequest(request, executionFixture(), patchSummaryFixture(), validation);
  const markdown = mod.renderMarkdown(pr, request, validation);
  for (const heading of [
    `# ${pr.title}`,
    "## Branch Name",
    "## Summary",
    "## Modified Files",
    "## Tests Executed",
    "## Tests Passed",
    "## Validation Status",
    "## Provider",
    "## Approval",
    "## Acceptance Criteria",
    "## Validation Checklist",
    "## Validation Rules",
    "## Next Step",
  ]) {
    if (!markdown.includes(heading)) throw new Error(`expected markdown to include "${heading}"`);
  }
  if (!markdown.includes(pr.branchName)) throw new Error("expected the markdown to include the branch name");
  ok("renderMarkdown includes every required section plus grounded bonus context");
}

// 7. JSON generation: pull-request.json contains every field required by the spec, verbatim.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const pr = mod.buildPullRequest(requestFixture(), executionFixture(), patchSummaryFixture(), validationFixture());
  for (const key of ["title", "branchName", "summary", "modifiedFiles", "testsExecuted", "testsPassed", "validationStatus", "provider", "approval"]) {
    if (!(key in pr)) throw new Error(`pull-request.json is missing required field: ${key}`);
  }
  ok("pull-request.json contains every field required by the spec");
}

// 8. Deterministic branch name generation: same request -> same branch, every time; git-safe characters
//    only; unique per requestId.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const first = mod.buildBranchName(request);
  const second = mod.buildBranchName(request);
  if (first !== second) throw new Error("expected buildBranchName to be deterministic");
  if (!/^autonomous\/[a-z0-9-]+$/.test(first)) throw new Error(`expected a git-safe branch name, got: ${first}`);
  const differentRequest = requestFixture({ requestId: "IR-1-20260103T000000000Z" });
  if (mod.buildBranchName(differentRequest) === first) throw new Error("expected a different requestId to produce a different branch name");
  ok("buildBranchName is deterministic, git-safe, and unique per requestId");
}

// 9. Deterministic title generation: same request -> same title, every time; never invented prose (the
//    request's own title appears verbatim).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = requestFixture();
  const first = mod.buildTitle(request);
  const second = mod.buildTitle(request);
  if (first !== second) throw new Error("expected buildTitle to be deterministic");
  if (!first.includes(request.title)) throw new Error("expected the PR title to include the request's own title verbatim");
  ok("buildTitle is deterministic and reuses the request's own title verbatim");
}

// 10. CLI: fails closed with no artifacts present; fails closed (no output written) for a rejected
//     validation; succeeds and writes both files for an approved validation.
{
  const dir = makeFixture();
  const failResult = spawnSync("node", ["scripts/pull-request-generator.js"], { cwd: dir, encoding: "utf8" });
  if (failResult.status === 0) throw new Error(`expected the CLI to fail closed with no artifacts present:\n${failResult.stdout}`);
  if (!/implementation-request\.json not found/.test(failResult.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${failResult.stderr}`);

  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  writeJson(path.join(dir, "execution/execution.json"), executionFixture());
  writeJson(path.join(dir, "execution/patch-summary.json"), patchSummaryFixture());
  writeJson(path.join(dir, "validation/validation.json"), validationFixture({ approvedForPR: false, status: "rejected" }));

  const rejectedResult = spawnSync("node", ["scripts/pull-request-generator.js"], { cwd: dir, encoding: "utf8" });
  if (rejectedResult.status === 0) throw new Error(`expected the CLI to fail closed for a rejected validation:\n${rejectedResult.stdout}`);
  if (fs.existsSync(path.join(dir, "pull-request/pull-request.json"))) throw new Error("expected no pull-request.json to be written for a rejected validation");

  writeJson(path.join(dir, "validation/validation.json"), validationFixture());
  const okResult = spawnSync("node", ["scripts/pull-request-generator.js"], { cwd: dir, encoding: "utf8" });
  if (okResult.status !== 0) throw new Error(`expected the CLI to succeed for an approved validation:\n${okResult.stdout}\n${okResult.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(dir, "pull-request/pull-request.json"), "utf8"));
  if (written.requestId !== "IR-1-20260102T000000000Z") throw new Error("expected the CLI-written pull request to reflect the fixture request");

  ok("the CLI fails closed with no artifacts and for a rejected validation, and succeeds (writing both files) for an approved one");
}

// 11. Artifact mismatch: a requestId/provider disagreement across artifacts, and a validation.json that
//     predates the execution.json it supposedly validated, both fail closed before anything is generated.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);

  let threw = null;
  try {
    mod.assertConsistentArtifacts(requestFixture(), executionFixture(), patchSummaryFixture({ requestId: "IR-999-different" }), validationFixture());
  } catch (error) {
    threw = error;
  }
  if (!threw || !/does not match/.test(threw.message)) throw new Error(`expected a clear requestId-mismatch error, got: ${threw && threw.message}`);

  let threw2 = null;
  try {
    mod.assertConsistentArtifacts(requestFixture(), executionFixture(), patchSummaryFixture({ provider: "claude-code-v1" }), validationFixture());
  } catch (error) {
    threw2 = error;
  }
  if (!threw2 || !/does not match/.test(threw2.message)) throw new Error(`expected a clear provider-mismatch error, got: ${threw2 && threw2.message}`);

  let threw3 = null;
  try {
    mod.assertConsistentArtifacts(requestFixture(), executionFixture(), patchSummaryFixture(), validationFixture({ timestamp: "2020-01-01T00:00:00.000Z" }));
  } catch (error) {
    threw3 = error;
  }
  if (!threw3 || !/predates/.test(threw3.message)) throw new Error(`expected a clear stale-validation error, got: ${threw3 && threw3.message}`);

  // A genuinely consistent set of artifacts must not be rejected.
  mod.assertConsistentArtifacts(requestFixture(), executionFixture(), patchSummaryFixture(), validationFixture());

  ok("mismatched requestId/provider and a stale (predating) validation.json all fail closed, while consistent artifacts are accepted");
}

// 12. End-to-end execution: the real eight-stage chain (repository-intelligence.js -> engineering-
//     knowledge.js -> recommendation-engine.js -> decision-engine.js -> implementation-request-engine.js ->
//     implementation-executor.js -> validation-engine.js -> pull-request-generator.js), using the real
//     upstream sources and the real deterministic stub provider, produces a valid pull request document
//     whenever the real validation was approved.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js", "implementation-request-engine.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }
  const executorRun = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8", env: { ...process.env, EXECUTION_APPROVED: "true" } });
  if (executorRun.status !== 0) throw new Error(`implementation-executor.js run failed:\n${executorRun.stdout}\n${executorRun.stderr}`);
  const validationRun = spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });

  const prRun = spawnSync("node", ["scripts/pull-request-generator.js"], { cwd: dir, encoding: "utf8" });
  const validation = JSON.parse(fs.readFileSync(path.join(dir, "validation", "validation.json"), "utf8"));

  if (validation.approvedForPR) {
    if (prRun.status !== 0) throw new Error(`expected the CLI to succeed for a real approved validation:\n${prRun.stdout}\n${prRun.stderr}`);
    const jsonPath = path.join(dir, "pull-request", "pull-request.json");
    const mdPath = path.join(dir, "pull-request", "pull-request.md");
    if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error("expected both pull-request.json and pull-request.md to be produced by the real end-to-end chain");
    const pr = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const request = JSON.parse(fs.readFileSync(path.join(dir, "implementation-request", "implementation-request.json"), "utf8"));
    if (pr.requestId !== request.requestId) throw new Error("expected the real pull request to reference the real request's own requestId");
    if (!pr.branchName.startsWith("autonomous/")) throw new Error("expected a deterministic autonomous/ branch name");
  } else {
    if (prRun.status === 0) throw new Error("expected the CLI to fail closed for a real non-approved validation");
    if (fs.existsSync(path.join(dir, "pull-request", "pull-request.json"))) throw new Error("expected no pull-request.json when the real validation was not approved");
  }

  ok("the real eight-stage chain produces a valid pull request document whenever the real validation was approved, and fails closed otherwise");
}

console.log("All Pull Request Generator v1 regression scenarios passed.");
