#!/usr/bin/env node
// Autonomous Engineering Orchestrator v1 regression coverage: the pure orchestration logic (runOrchestration,
// findArtifactsProduced, buildRunRecord, renderMarkdown) is exercised with an injected fake spawn function
// (fast, deterministic, no real engines needed), the CLI is exercised against real subprocesses using tiny
// fake stage scripts (controllable exit codes, mirroring the fake-"claude"/fake-"gh" technique used
// elsewhere in this pipeline), and one true end-to-end run drives the real nine-stage chain.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/autonomous-orchestrator.js"), "utf8");

const ENGINE_SCRIPTS = [
  "repository-intelligence.js",
  "engineering-knowledge.js",
  "recommendation-engine.js",
  "decision-engine.js",
  "implementation-request-engine.js",
  "implementation-executor.js",
  "validation-engine.js",
  "pull-request-generator.js",
  "github-publisher.js",
];

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomous-orchestrator-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/autonomous-orchestrator.js"), source);
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/autonomous-orchestrator.js"));
}

function makeFakeSpawn(failOnScript, callLog) {
  return (nodeBin, args) => {
    const scriptName = path.basename(args[0]);
    if (callLog) callLog.push(scriptName);
    if (failOnScript && scriptName === failOnScript) {
      return { status: 1, stdout: "", stderr: `simulated failure in ${scriptName}`, error: null };
    }
    return { status: 0, stdout: `ok: ${scriptName}`, stderr: "", error: null };
  };
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Stage failure: a mid-pipeline stage fails -- it is recorded FAIL, every stage before it PASSes, and
//    overall orchestration status is "failed".
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const result = mod.runOrchestration({ spawnFn: makeFakeSpawn("decision-engine.js") });
  if (result.status !== "failed") throw new Error(`expected overall status "failed", got: ${result.status}`);
  const failedIndex = mod.STAGES.findIndex((s) => s.script === "decision-engine.js");
  if (result.stages[failedIndex].status !== "FAIL") throw new Error(`expected Decision Engine to FAIL, got: ${result.stages[failedIndex].status}`);
  if (result.stages.slice(0, failedIndex).some((s) => s.status !== "PASS")) throw new Error("expected every stage before the failure to PASS");
  ok("a mid-pipeline stage failure is correctly recorded, and overall status becomes \"failed\"");
}

// 2. Skipped stages: every stage after the failure is recorded SKIPPED, never attempted (no exit code, no
//    timing).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const result = mod.runOrchestration({ spawnFn: makeFakeSpawn("implementation-executor.js") });
  const failedIndex = mod.STAGES.findIndex((s) => s.script === "implementation-executor.js");
  const remaining = result.stages.slice(failedIndex + 1);
  if (remaining.length === 0) throw new Error("expected at least one stage after the failure to verify SKIPPED behavior");
  if (remaining.some((s) => s.status !== "SKIPPED" || s.exitCode !== null || s.startTime !== null || s.durationMs !== null)) {
    throw new Error(`expected every remaining stage to be cleanly SKIPPED (no exit code, no timing), got: ${JSON.stringify(remaining)}`);
  }
  ok("every stage after a failure is recorded SKIPPED with no exit code or timing, never attempted");
}

// 3. Successful execution: every stage passes, and overall status is "success".
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const callLog = [];
  const result = mod.runOrchestration({ spawnFn: makeFakeSpawn(null, callLog) });
  if (result.status !== "success") throw new Error(`expected overall status "success", got: ${result.status}`);
  if (result.stages.some((s) => s.status !== "PASS")) throw new Error("expected every stage to PASS");
  if (callLog.length !== mod.STAGES.length) throw new Error(`expected exactly ${mod.STAGES.length} stage invocations, got: ${callLog.length}`);
  ok("a fully successful run passes every stage and reports overall status \"success\"");
}

// 4. Missing artifacts: findArtifactsProduced() against an empty directory correctly reports nothing
//    produced.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomous-orchestrator-empty-"));
  const artifacts = mod.findArtifactsProduced(emptyDir);
  if (artifacts.length !== 0) throw new Error(`expected no artifacts for an empty directory, got: ${JSON.stringify(artifacts)}`);
  ok("findArtifactsProduced reports nothing produced when no known artifact files exist");
}

// 5. Malformed artifacts: an artifact file that exists but contains invalid JSON is still correctly reported
//    as produced (existence-only check, never parsed) -- proving a leftover malformed file can never crash
//    this orchestrator.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomous-orchestrator-malformed-"));
  writeFile(path.join(fixtureDir, "decision", "decision.json"), "{ this is not valid JSON at all !!");
  const artifacts = mod.findArtifactsProduced(fixtureDir);
  if (!artifacts.includes("decision/decision.json")) throw new Error("expected a malformed-but-present artifact to still be reported as produced");
  ok("a malformed artifact file is still correctly reported as produced (existence-only, never parsed)");
}

// 6. Duration: every ran stage has a non-negative, finite durationMs; every skipped stage has durationMs
//    null; the overall run's finishTime is not before its startTime.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const result = mod.runOrchestration({ spawnFn: makeFakeSpawn("recommendation-engine.js") });
  for (const stage of result.stages) {
    if (stage.status === "SKIPPED") {
      if (stage.durationMs !== null) throw new Error("expected a SKIPPED stage's durationMs to be null");
    } else if (typeof stage.durationMs !== "number" || !Number.isFinite(stage.durationMs) || stage.durationMs < 0) {
      throw new Error(`expected a non-negative finite durationMs for a ran stage, got: ${stage.durationMs}`);
    }
  }
  if (typeof result.durationMs !== "number" || !Number.isFinite(result.durationMs) || result.durationMs < 0) throw new Error(`expected a non-negative finite overall durationMs, got: ${result.durationMs}`);
  if (Date.parse(result.finishTime) < Date.parse(result.startTime)) throw new Error("expected finishTime to not be before startTime");
  ok("duration is correctly tracked per stage (null when skipped) and for the overall run, with finishTime never before startTime");
}

// 7. Report generation: renderMarkdown includes every required section, the full stage table, and a
//    Failure Detail section only when a stage actually failed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const failedResult = mod.runOrchestration({ spawnFn: makeFakeSpawn("validation-engine.js") });
  const failedRun = mod.buildRunRecord(failedResult, dir);
  const failedMarkdown = mod.renderMarkdown(failedRun);
  for (const heading of ["# Autonomous Engineering Orchestrator Report", "## Status", "## Timing", "## Stages", "## Failure Detail", "## Artifacts Produced", "## Next Step"]) {
    if (!failedMarkdown.includes(heading)) throw new Error(`expected markdown to include "${heading}" for a failed run`);
  }
  for (const stage of failedRun.stages) {
    if (!failedMarkdown.includes(stage.name)) throw new Error(`expected the stages table to include ${stage.name}`);
  }

  const successResult = mod.runOrchestration({ spawnFn: makeFakeSpawn(null) });
  const successRun = mod.buildRunRecord(successResult, dir);
  const successMarkdown = mod.renderMarkdown(successRun);
  if (successMarkdown.includes("## Failure Detail")) throw new Error("expected no Failure Detail section for a fully successful run");

  ok("renderMarkdown includes every required section, the full stage table, and a conditional Failure Detail section");
}

// 8. CLI + exit codes: a real subprocess run against tiny fake stage scripts (controllable exit codes)
//    proves the real CLI stops immediately on failure (exit 1) and succeeds (exit 0) when every stage
//    passes.
{
  const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomous-orchestrator-cli-"));
  fs.mkdirSync(path.join(cliDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(cliDir, "scripts/autonomous-orchestrator.js"), source);
  for (const script of ENGINE_SCRIPTS) {
    const shouldFail = script === "decision-engine.js";
    writeFile(
      path.join(cliDir, "scripts", script),
      shouldFail ? 'console.error("simulated fake-stage failure"); process.exit(1);\n' : `console.log("fake stage ok: ${script}"); process.exit(0);\n`
    );
  }
  const failingRun = spawnSync("node", ["scripts/autonomous-orchestrator.js"], { cwd: cliDir, encoding: "utf8" });
  if (failingRun.status !== 1) throw new Error(`expected the CLI to exit 1 when a stage fails, got exit ${failingRun.status}:\n${failingRun.stdout}\n${failingRun.stderr}`);
  if (!failingRun.stdout.includes("Decision Engine... FAIL")) throw new Error(`expected clean console progress to show the failing stage, got:\n${failingRun.stdout}`);
  if (!failingRun.stdout.includes("Pull Request Generator... SKIPPED")) throw new Error(`expected clean console progress to show skipped stages, got:\n${failingRun.stdout}`);
  const failedRunJson = JSON.parse(fs.readFileSync(path.join(cliDir, "run/run.json"), "utf8"));
  if (failedRunJson.status !== "failed") throw new Error(`expected run.json status "failed", got: ${failedRunJson.status}`);

  for (const script of ENGINE_SCRIPTS) {
    writeFile(path.join(cliDir, "scripts", script), `console.log("fake stage ok: ${script}"); process.exit(0);\n`);
  }
  const successRun = spawnSync("node", ["scripts/autonomous-orchestrator.js"], { cwd: cliDir, encoding: "utf8" });
  if (successRun.status !== 0) throw new Error(`expected the CLI to exit 0 when every stage passes, got exit ${successRun.status}:\n${successRun.stdout}\n${successRun.stderr}`);
  const successRunJson = JSON.parse(fs.readFileSync(path.join(cliDir, "run/run.json"), "utf8"));
  if (successRunJson.status !== "success" || successRunJson.stages.some((s) => s.status !== "PASS")) throw new Error(`expected a fully passing run.json, got: ${JSON.stringify(successRunJson)}`);

  ok("the real CLI, run against real (fake) stage subprocesses, exits 1 and stops immediately on failure, and exits 0 when every stage passes");
}

// 9. End-to-end execution: the real nine-stage chain, driven entirely by the real orchestrator CLI using
//    the real engine sources, produces a valid, internally-consistent run.json/run.md.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomous-orchestrator-e2e-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/autonomous-orchestrator.js"), source);
  fs.mkdirSync(path.join(dir, "providers/claude"), { recursive: true });
  for (const relPath of [
    "scripts/repository-intelligence.js",
    "scripts/engineering-knowledge.js",
    "scripts/recommendation-engine.js",
    "scripts/decision-engine.js",
    "scripts/implementation-request-engine.js",
    "scripts/implementation-executor.js",
    "scripts/validation-engine.js",
    "scripts/pull-request-generator.js",
    "scripts/github-publisher.js",
    "publisher/github/client.js",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, relPath)), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relPath), path.join(dir, relPath));
  }

  const run = spawnSync("node", ["scripts/autonomous-orchestrator.js"], { cwd: dir, encoding: "utf8", env: { ...process.env, EXECUTION_APPROVED: "true" } });
  const jsonPath = path.join(dir, "run", "run.json");
  const mdPath = path.join(dir, "run", "run.md");
  if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error(`expected run.json and run.md to be produced by the real end-to-end chain:\n${run.stdout}\n${run.stderr}`);

  const runRecord = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (runRecord.stages.length !== 9) throw new Error(`expected all 9 real stages to be recorded, got: ${runRecord.stages.length}`);
  if (run.status === 0) {
    if (runRecord.status !== "success" || runRecord.stages.some((s) => s.status !== "PASS")) throw new Error(`expected a fully passing real run.json, got: ${JSON.stringify(runRecord.stages)}`);
    if (!runRecord.artifactsProduced.includes("publish/publish.json")) throw new Error("expected publish/publish.json to be listed as a produced artifact for a fully successful real run");
  } else {
    if (runRecord.status !== "failed") throw new Error(`expected run.json status "failed" to match a non-zero CLI exit code, got: ${runRecord.status}`);
  }

  ok("the real nine-stage chain, driven by the real orchestrator CLI, produces a valid and internally-consistent run.json/run.md end to end");
}

console.log("All Autonomous Engineering Orchestrator v1 regression scenarios passed.");
