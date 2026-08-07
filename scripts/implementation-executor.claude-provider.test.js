#!/usr/bin/env node
// Claude Code Provider Adapter v1 regression coverage (providers/claude/{adapter,prompt-builder,parser}.js),
// plus its integration into Implementation Executor v1 (provider registration, providerEvidence passthrough,
// patch-summary.json generation). Unit-level scenarios inject a fake spawn function so they never depend on
// a real Claude Code executable being installed; CLI-integration scenarios spawn the real
// scripts/implementation-executor.js CLI against small fake "claude" subprocess scripts (plain Node scripts
// that read stdin and print a result block), proving the real stdin/stdout/exit-code/timeout plumbing works
// end to end without needing the real Claude Code CLI.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const promptBuilder = require(path.join(repoRoot, "providers/claude/prompt-builder"));
const parser = require(path.join(repoRoot, "providers/claude/parser"));
const adapter = require(path.join(repoRoot, "providers/claude/adapter"));

const executorSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-executor.js"), "utf8");
const promptBuilderSource = fs.readFileSync(path.join(repoRoot, "providers/claude/prompt-builder.js"), "utf8");
const parserSource = fs.readFileSync(path.join(repoRoot, "providers/claude/parser.js"), "utf8");
const adapterSource = fs.readFileSync(path.join(repoRoot, "providers/claude/adapter.js"), "utf8");

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

// A fake "claude" executable: a plain Node script invoked as `node <this file>`. It reads the prompt from
// stdin (never inspects the real repository or any real Claude Code binary) and prints a result block, so
// CLI-integration tests exercise the real spawnSync/stdin/stdout/exit-code path without needing the real CLI.
function fakeClaudeScript(behavior) {
  switch (behavior) {
    case "success":
      return `
        let input = "";
        process.stdin.on("data", (c) => { input += c; });
        process.stdin.on("end", () => {
          console.log("(some preamble Claude Code might print)");
          console.log("===GVAMS_EXECUTION_RESULT===");
          console.log(JSON.stringify({ outcome: "success", filesChanged: ["backend/test/a.js"], testsRun: 3, testsOk: 3, notes: [], problems: [], summary: "Simulated real Claude Code success." }));
          console.log("===END_GVAMS_EXECUTION_RESULT===");
          process.exit(0);
        });
      `;
    case "failure":
      return `
        let input = "";
        process.stdin.on("data", (c) => { input += c; });
        process.stdin.on("end", () => {
          console.log("===GVAMS_EXECUTION_RESULT===");
          console.log(JSON.stringify({ outcome: "failure", filesChanged: [], testsRun: 2, testsOk: 0, notes: [], problems: ["a test failed"], summary: "Simulated real Claude Code failure." }));
          console.log("===END_GVAMS_EXECUTION_RESULT===");
          process.exit(1);
        });
      `;
    case "malformed":
      return `
        let input = "";
        process.stdin.on("data", (c) => { input += c; });
        process.stdin.on("end", () => {
          console.log("I could not understand the task and did not produce a result block.");
          process.exit(0);
        });
      `;
    case "sleep":
      return `
        setTimeout(() => { process.stdout.write("too late\\n"); process.exit(0); }, 5000);
      `;
    default:
      throw new Error(`unknown fake claude behavior: ${behavior}`);
  }
}

function makeExecutorFixture(claudeScriptBehavior) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-provider-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "providers/claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/implementation-executor.js"), executorSource);
  fs.writeFileSync(path.join(dir, "providers/claude/prompt-builder.js"), promptBuilderSource);
  fs.writeFileSync(path.join(dir, "providers/claude/parser.js"), parserSource);
  fs.writeFileSync(path.join(dir, "providers/claude/adapter.js"), adapterSource);
  if (claudeScriptBehavior) {
    fs.writeFileSync(path.join(dir, "fake-claude.js"), fakeClaudeScript(claudeScriptBehavior));
  }
  return dir;
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Prompt generation: uses ONLY the six specified inputs, is fully deterministic, and includes the fixed
//    response-format contract with its markers.
{
  const request = requestFixture();
  const first = promptBuilder.buildPrompt(request);
  const second = promptBuilder.buildPrompt(request);
  if (first !== second) throw new Error("expected buildPrompt to be a pure, deterministic function of the request");
  if (!first.includes(request.title)) throw new Error("expected the prompt to include the request's title under Goal");
  if (!first.includes(request.goal)) throw new Error("expected the prompt to include the request's goal under Description");
  for (const file of request.affectedFiles) if (!first.includes(file)) throw new Error(`expected the prompt to list affected file ${file}`);
  for (const c of request.implementationConstraints) if (!first.includes(c)) throw new Error("expected the prompt to list every constraint");
  for (const a of request.acceptanceCriteria) if (!first.includes(a)) throw new Error("expected the prompt to list every acceptance criterion");
  for (const v of request.validationChecklist) if (!first.includes(v)) throw new Error("expected the prompt to list every validation checklist item");
  if (!first.includes(promptBuilder.RESULT_START_MARKER) || !first.includes(promptBuilder.RESULT_END_MARKER)) {
    throw new Error("expected the prompt to include the fixed result-block markers");
  }
  if (first.includes(request.requestId) || first.includes(request.recommendationsSource) || first.includes(request.sourceProjectName)) {
    throw new Error("expected the prompt to use ONLY Goal/Description/Affected Files/Constraints/Acceptance Criteria/Validation Checklist, not other request metadata");
  }
  ok("buildPrompt is deterministic, includes every required section, and uses only the six specified inputs");
}

// 2. Provider evidence structure: always has the fixed shape, regardless of which code path produced it.
{
  const spawnErrorResult = parser.parseClaudeOutput({ spawnError: { code: "ENOENT", message: "not found" }, durationMs: 5, invocationId: "inv-1" });
  const timeoutResult = parser.parseClaudeOutput({ timedOut: true, durationMs: 1000, invocationId: "inv-2" });
  const successResult = parser.parseClaudeOutput({
    stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "success", filesChanged: [], testsRun: 0, testsOk: 0, notes: [], problems: [], summary: "ok" })}\n${promptBuilder.RESULT_END_MARKER}`,
    exitCode: 0,
    durationMs: 42,
    invocationId: "inv-3",
    providerVersion: "1.2.3",
  });
  for (const [name, result] of [["spawnError", spawnErrorResult], ["timeout", timeoutResult], ["success", successResult]]) {
    const evidence = result.providerEvidence;
    if (!evidence || evidence.providerName !== "Claude Code") throw new Error(`expected providerEvidence.providerName "Claude Code" for ${name}`);
    if (evidence.executionMode !== "real") throw new Error(`expected providerEvidence.executionMode "real" for ${name}`);
    if (!("invocationId" in evidence) || !("exitCode" in evidence) || !("durationMs" in evidence) || !("providerVersion" in evidence)) {
      throw new Error(`expected providerEvidence to have the full fixed shape for ${name}`);
    }
  }
  if (successResult.providerEvidence.providerVersion !== "1.2.3") throw new Error("expected providerVersion to be carried through when supplied");
  if (successResult.providerEvidence.exitCode !== 0) throw new Error("expected exitCode to be carried through");
  ok("providerEvidence always has the fixed shape (providerName/providerVersion/executionMode/invocationId/exitCode/durationMs) across every code path");
}

// 3. Malformed provider output: no markers, invalid JSON inside markers, wrong shape, non-array
//    filesChanged, and an invalid outcome value -- all fail closed to outcome:"failure", never throw, and
//    never leak provider-specific fields.
{
  const cases = [
    { name: "no markers at all", stdout: "Claude just wrote some prose with no result block." },
    { name: "invalid JSON inside markers", stdout: `${promptBuilder.RESULT_START_MARKER}\n{ not valid json\n${promptBuilder.RESULT_END_MARKER}` },
    { name: "valid JSON but wrong shape (array, not object)", stdout: `${promptBuilder.RESULT_START_MARKER}\n[1,2,3]\n${promptBuilder.RESULT_END_MARKER}` },
    { name: "missing outcome", stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ filesChanged: [] })}\n${promptBuilder.RESULT_END_MARKER}` },
    { name: "invalid outcome value", stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "maybe" })}\n${promptBuilder.RESULT_END_MARKER}` },
    { name: "non-array filesChanged", stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "success", filesChanged: "not-an-array" })}\n${promptBuilder.RESULT_END_MARKER}` },
  ];
  for (const testCase of cases) {
    const result = parser.parseClaudeOutput({ stdout: testCase.stdout, exitCode: 0, durationMs: 1, invocationId: "inv" });
    if (result.outcome !== "failure") throw new Error(`expected malformed output ("${testCase.name}") to fail closed to outcome "failure", got: ${result.outcome}`);
    if (!Object.keys(result).every((key) => ["outcome", "filesChanged", "testsRun", "testsOk", "notes", "problems", "summary", "providerEvidence"].includes(key))) {
      throw new Error(`expected only the fixed contract keys for malformed output ("${testCase.name}"), got: ${Object.keys(result).join(", ")}`);
    }
  }
  ok("malformed provider output (missing markers, invalid JSON, wrong shape, non-array filesChanged, invalid outcome) always fails closed to the fixed contract");
}

// 4. Parser failures: a robustness sweep across outright garbage raw inputs -- parseClaudeOutput must never
//    throw, no matter what it is given.
{
  const garbageInputs = [null, undefined, 42, "a plain string", [], true, { stdout: 12345 }, { stdout: null, exitCode: "not-a-number" }];
  for (const garbage of garbageInputs) {
    let threw = null;
    let result = null;
    try {
      result = parser.parseClaudeOutput(garbage);
    } catch (error) {
      threw = error;
    }
    if (threw) throw new Error(`expected parseClaudeOutput to never throw, but it threw for input ${JSON.stringify(garbage)}: ${threw.message}`);
    if (!result || result.outcome !== "failure" || !result.providerEvidence) throw new Error(`expected a well-formed failure result for garbage input ${JSON.stringify(garbage)}`);
  }
  ok("parseClaudeOutput never throws and always returns a well-formed failure result for garbage input");
}

// 5. Exit-code contradiction: a process that exits non-zero but reports outcome "success" is treated as a
//    failure, since the process's own exit code takes precedence over its self-reported outcome.
{
  const result = parser.parseClaudeOutput({
    stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "success", filesChanged: ["x.js"], summary: "claims success" })}\n${promptBuilder.RESULT_END_MARKER}`,
    exitCode: 1,
    durationMs: 1,
    invocationId: "inv",
  });
  if (result.outcome !== "failure") throw new Error(`expected a non-zero exit code to override a self-reported "success", got: ${result.outcome}`);
  if (!result.problems.some((p) => /exit code takes precedence/.test(p))) throw new Error("expected an explanatory problem about the exit-code contradiction");
  ok("a non-zero exit code overrides a contradictory self-reported success outcome");
}

// 6. Successful execution (adapter level, injected spawn function -- no real subprocess).
{
  const request = requestFixture();
  const spawnCalls = [];
  const fakeSpawn = (bin, args, options) => {
    spawnCalls.push({ bin, args, options });
    return {
      status: 0,
      stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "success", filesChanged: request.affectedFiles, testsRun: 2, testsOk: 2, notes: [], problems: [], summary: "done" })}\n${promptBuilder.RESULT_END_MARKER}`,
      stderr: "",
      error: null,
    };
  };
  const result = adapter.claudeProviderAdapter(request, { spawnFn: fakeSpawn, invocationId: "inv-success" });
  if (result.outcome !== "success") throw new Error(`expected outcome "success", got: ${result.outcome}`);
  if (JSON.stringify(result.filesChanged) !== JSON.stringify(request.affectedFiles)) throw new Error("expected filesChanged to match what Claude reported");
  if (spawnCalls.length !== 1) throw new Error("expected exactly one spawn invocation");
  if (spawnCalls[0].options.input !== promptBuilder.buildPrompt(request)) throw new Error("expected the exact deterministic prompt to be piped in via stdin");
  ok("a successful Claude Code execution is correctly captured, parsed, and grounded in what the process actually reported");
}

// 7. Failed execution (adapter level, injected spawn function reporting a self-described failure).
{
  const request = requestFixture();
  const fakeSpawn = () => ({
    status: 1,
    stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "failure", filesChanged: [], testsRun: 2, testsOk: 0, notes: [], problems: ["a test failed"], summary: "failed" })}\n${promptBuilder.RESULT_END_MARKER}`,
    stderr: "some stderr output",
    error: null,
  });
  const result = adapter.claudeProviderAdapter(request, { spawnFn: fakeSpawn, invocationId: "inv-fail" });
  if (result.outcome !== "failure") throw new Error(`expected outcome "failure", got: ${result.outcome}`);
  if (result.providerEvidence.exitCode !== 1) throw new Error("expected the real exit code to be captured in providerEvidence");
  ok("a failed Claude Code execution is correctly captured and parsed");
}

// 8. Timeout (adapter level, injected spawn function simulating Node's ETIMEDOUT signal).
{
  const request = requestFixture();
  const fakeSpawn = () => ({ status: null, stdout: "", stderr: "", error: { code: "ETIMEDOUT", message: "spawnSync ETIMEDOUT" }, signal: "SIGTERM" });
  const result = adapter.claudeProviderAdapter(request, { spawnFn: fakeSpawn, invocationId: "inv-timeout" });
  if (result.outcome !== "failure") throw new Error(`expected a timeout to produce outcome "failure", got: ${result.outcome}`);
  if (!result.problems.some((p) => /timed out/.test(p))) throw new Error("expected an explanatory timeout problem message");
  ok("a Claude Code execution that times out is correctly reported as a failure with a clear message");
}

// 9. Claude executable unavailable (adapter level, injected ENOENT-shaped spawn function AND a real
//    spawnSync call against a guaranteed-nonexistent binary name).
{
  const request = requestFixture();
  const fakeSpawn = () => ({ status: null, stdout: null, stderr: null, error: { code: "ENOENT", message: "spawnSync fake-claude ENOENT" } });
  const injectedResult = adapter.claudeProviderAdapter(request, { spawnFn: fakeSpawn, invocationId: "inv-enoent" });
  if (injectedResult.outcome !== "failure" || !injectedResult.problems.some((p) => /could not be launched/.test(p))) {
    throw new Error("expected a missing executable to fail closed with a clear message (injected spawn)");
  }

  const realResult = adapter.claudeProviderAdapter(request, { bin: "definitely-not-a-real-claude-binary-xyz123", invocationId: "inv-enoent-real" });
  if (realResult.outcome !== "failure" || !realResult.problems.some((p) => /could not be launched/.test(p))) {
    throw new Error("expected a real ENOENT from spawnSync to fail closed with a clear message");
  }
  ok("a missing Claude Code executable fails closed with a clear message, both via an injected error and a real ENOENT from spawnSync");
}

// 10. assertValidRequest fails closed on a missing or malformed implementation request.
{
  let threw = null;
  try {
    adapter.claudeProviderAdapter({ requestId: "x" }, { spawnFn: () => ({ status: 0, stdout: "", stderr: "", error: null }) });
  } catch (error) {
    threw = error;
  }
  if (!threw || !/missing required field/.test(threw.message)) throw new Error(`expected a clear missing-field error, got: ${threw && threw.message}`);

  let threw2 = null;
  try {
    adapter.claudeProviderAdapter(requestFixture({ affectedFiles: "not-an-array" }), { spawnFn: () => ({ status: 0, stdout: "", stderr: "", error: null }) });
  } catch (error) {
    threw2 = error;
  }
  if (!threw2 || !/non-array field/.test(threw2.message)) throw new Error(`expected a clear non-array-field error, got: ${threw2 && threw2.message}`);
  ok("the adapter fails closed (throws) when given an invalid implementation request, rather than guessing at missing fields");
}

// 11. Configuration resolution: bin/args/timeoutMs are correctly resolved from injected deps and from
//     environment variables, with documented defaults otherwise.
{
  const previous = { CLAUDE_CODE_BIN: process.env.CLAUDE_CODE_BIN, CLAUDE_CODE_ARGS: process.env.CLAUDE_CODE_ARGS, CLAUDE_CODE_TIMEOUT_MS: process.env.CLAUDE_CODE_TIMEOUT_MS };
  try {
    delete process.env.CLAUDE_CODE_BIN;
    delete process.env.CLAUDE_CODE_ARGS;
    delete process.env.CLAUDE_CODE_TIMEOUT_MS;
    if (adapter.resolveBin() !== adapter.DEFAULT_BIN) throw new Error("expected the documented default bin when nothing is configured");
    if (JSON.stringify(adapter.resolveArgs()) !== JSON.stringify(adapter.DEFAULT_ARGS)) throw new Error("expected the documented default args when nothing is configured");
    if (adapter.resolveTimeoutMs() !== adapter.DEFAULT_TIMEOUT_MS) throw new Error("expected the documented default timeout when nothing is configured");

    process.env.CLAUDE_CODE_BIN = "my-claude";
    process.env.CLAUDE_CODE_ARGS = "--foo --bar baz";
    process.env.CLAUDE_CODE_TIMEOUT_MS = "1234";
    if (adapter.resolveBin() !== "my-claude") throw new Error("expected CLAUDE_CODE_BIN to override the default");
    if (JSON.stringify(adapter.resolveArgs()) !== JSON.stringify(["--foo", "--bar", "baz"])) throw new Error("expected CLAUDE_CODE_ARGS to override the default");
    if (adapter.resolveTimeoutMs() !== 1234) throw new Error("expected CLAUDE_CODE_TIMEOUT_MS to override the default");

    if (adapter.resolveBin({ bin: "explicit" }) !== "explicit") throw new Error("expected an explicit dep to take precedence over the environment");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  ok("bin/args/timeoutMs resolve correctly from injected deps, environment variables, and documented defaults, in that precedence order");
}

// 12. Executor integration: implementation-executor.js's resolveProvider("claude-code-v1") lazily loads the
//     real adapter, and providerEvidence flows all the way into buildCompletedExecution and buildPatchSummary.
{
  const dir = makeExecutorFixture();
  const mod = require(path.join(dir, "scripts/implementation-executor.js"));
  const providerFn = mod.resolveProvider("claude-code-v1");
  if (typeof providerFn !== "function") throw new Error('expected resolveProvider("claude-code-v1") to return a callable Provider Adapter');

  const request = requestFixture();
  const fakeSpawn = () => ({
    status: 0,
    stdout: `${promptBuilder.RESULT_START_MARKER}\n${JSON.stringify({ outcome: "success", filesChanged: request.affectedFiles, testsRun: 1, testsOk: 1, notes: [], problems: [], summary: "ok" })}\n${promptBuilder.RESULT_END_MARKER}`,
    stderr: "",
    error: null,
  });
  const raw = adapter.claudeProviderAdapter(request, { spawnFn: fakeSpawn, invocationId: "inv-integration" });
  const normalized = mod.normalizeProviderResult(raw);
  if (!normalized.providerEvidence || normalized.providerEvidence.providerName !== "Claude Code") throw new Error("expected normalizeProviderResult to carry providerEvidence through");

  const execution = mod.buildCompletedExecution(request, "claude-code-v1", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z", normalized);
  if (!execution.providerEvidence || execution.providerEvidence.invocationId !== "inv-integration") throw new Error("expected the execution record to carry providerEvidence through");

  const patchSummary = mod.buildPatchSummary(execution);
  if (patchSummary.provider !== "claude-code-v1") throw new Error("expected patch-summary.json's provider field to reflect the provider that actually ran");
  if (JSON.stringify(patchSummary.modifiedFiles) !== JSON.stringify(request.affectedFiles)) throw new Error("expected patch-summary.json's modifiedFiles to reflect what was actually reported");
  if (patchSummary.createdFiles.length !== 0 || patchSummary.deletedFiles.length !== 0 || patchSummary.functionsAdded.length !== 0) {
    throw new Error("expected v1's honestly-empty defaults for fields the provider contract cannot determine");
  }
  if (patchSummary.breakingChangesDetected !== false) throw new Error("expected breakingChangesDetected to default to false, never assumed");

  ok("resolveProvider wires in the real Claude adapter lazily, and providerEvidence/patch-summary correctly carry through the executor's own pipeline");
}

// 13. CLI integration: the Claude executable is unavailable, end to end through the real
//     implementation-executor.js CLI (EXECUTION_PROVIDER=claude-code-v1, a nonexistent CLAUDE_CODE_BIN).
{
  const dir = makeExecutorFixture();
  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  const result = spawnSync("node", ["scripts/implementation-executor.js"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXECUTION_APPROVED: "true", EXECUTION_PROVIDER: "claude-code-v1", CLAUDE_CODE_BIN: "definitely-not-a-real-claude-binary-xyz123" },
  });
  if (result.status === 0) throw new Error(`expected the CLI to exit non-zero when the Claude executable is unavailable:\n${result.stdout}\n${result.stderr}`);
  const execution = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (execution.status !== "failure" || execution.provider !== "claude-code-v1") throw new Error(`expected a failed claude-code-v1 execution, got: ${JSON.stringify(execution)}`);
  if (!execution.providerEvidence || execution.providerEvidence.providerName !== "Claude Code" || execution.providerEvidence.executionMode !== "real") {
    throw new Error("expected real providerEvidence even for a failed launch");
  }
  const patchSummary = JSON.parse(fs.readFileSync(path.join(dir, "execution/patch-summary.json"), "utf8"));
  if (patchSummary.provider !== "claude-code-v1") throw new Error("expected patch-summary.json to be written even for a failed execution");
  ok("CLI integration: an unavailable Claude Code executable fails closed end to end, with execution.json and patch-summary.json both correctly written");
}

// 14. CLI integration: a real subprocess round trip (spawnSync -> stdin -> stdout -> parser) through a fake
//     "claude" script that actually succeeds, proving the full real I/O path works, not just parsing logic.
{
  const dir = makeExecutorFixture("success");
  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  const result = spawnSync("node", ["scripts/implementation-executor.js"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXECUTION_APPROVED: "true", EXECUTION_PROVIDER: "claude-code-v1", CLAUDE_CODE_BIN: process.execPath, CLAUDE_CODE_ARGS: "fake-claude.js" },
  });
  if (result.status !== 0) throw new Error(`expected the CLI to succeed via the real subprocess round trip:\n${result.stdout}\n${result.stderr}`);
  const execution = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (execution.status !== "success" || execution.provider !== "claude-code-v1") throw new Error(`expected a successful claude-code-v1 execution, got: ${JSON.stringify(execution)}`);
  if (JSON.stringify(execution.modifiedFiles) !== JSON.stringify(["backend/test/a.js"])) throw new Error("expected modifiedFiles to reflect what the real subprocess actually reported");
  if (execution.providerEvidence.exitCode !== 0) throw new Error("expected the real subprocess exit code 0 to be captured");
  ok("CLI integration: a real subprocess round trip through a fake Claude Code executable succeeds end to end, exercising the actual stdin/stdout/exit-code path");
}

// 15. CLI integration: the fake "claude" script produces malformed output (no result block) -- fails closed.
{
  const dir = makeExecutorFixture("malformed");
  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  const result = spawnSync("node", ["scripts/implementation-executor.js"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXECUTION_APPROVED: "true", EXECUTION_PROVIDER: "claude-code-v1", CLAUDE_CODE_BIN: process.execPath, CLAUDE_CODE_ARGS: "fake-claude.js" },
  });
  if (result.status === 0) throw new Error(`expected the CLI to fail closed on malformed provider output:\n${result.stdout}`);
  const execution = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (execution.status !== "failure" || !execution.errors.some((e) => /Could not parse/.test(e))) throw new Error(`expected a clear parse-failure error, got: ${JSON.stringify(execution.errors)}`);
  ok("CLI integration: malformed real provider output (no result block) fails closed end to end with a clear error");
}

// 16. CLI integration: a real timeout -- the fake "claude" script sleeps far longer than a short configured
//     CLAUDE_CODE_TIMEOUT_MS, proving Node's real subprocess timeout/kill behavior is correctly detected.
{
  const dir = makeExecutorFixture("sleep");
  writeJson(path.join(dir, "implementation-request/implementation-request.json"), requestFixture());
  const result = spawnSync("node", ["scripts/implementation-executor.js"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EXECUTION_APPROVED: "true", EXECUTION_PROVIDER: "claude-code-v1", CLAUDE_CODE_BIN: process.execPath, CLAUDE_CODE_ARGS: "fake-claude.js", CLAUDE_CODE_TIMEOUT_MS: "300" },
    timeout: 15000,
  });
  if (result.status === 0) throw new Error(`expected the CLI to fail closed on a real timeout:\n${result.stdout}`);
  const execution = JSON.parse(fs.readFileSync(path.join(dir, "execution/execution.json"), "utf8"));
  if (execution.status !== "failure" || !execution.errors.some((e) => /timed out/.test(e))) throw new Error(`expected a clear timeout error, got: ${JSON.stringify(execution.errors)}`);
  ok("CLI integration: a real subprocess timeout is correctly detected and reported end to end");
}

console.log("All Claude Code Provider Adapter v1 regression scenarios passed.");
