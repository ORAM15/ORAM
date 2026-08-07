#!/usr/bin/env node
// Autonomous Engineering Orchestrator v1
//
// NOT another pipeline engine -- the conductor that runs all nine existing, frozen stages in sequence:
//   Repository Intelligence -> Engineering Knowledge -> Recommendation Engine -> Decision Engine ->
//   Implementation Request Engine -> Implementation Executor -> Validation Engine -> Pull Request
//   Generator -> GitHub Publisher Adapter
// Each stage is invoked exactly as its own CLI (`node scripts/<stage>.js`), inheriting the current
// environment untouched -- this orchestrator never sets, forges, or bypasses any stage's own safety gates
// (e.g. it does NOT inject EXECUTION_APPROVED or GITHUB_PUBLISH_DRY_RUN=false on anyone's behalf; if a human
// hasn't approved execution, Implementation Executor will legitimately report "blocked" exactly as it always
// does, and this orchestrator will correctly stop there). A stage's own exit code is the only signal this
// orchestrator trusts -- it never re-interprets or second-guesses why a stage succeeded or failed, since
// each stage's own contract already defines what "success" means for it.
//
// If any stage exits non-zero, the run stops immediately and every remaining stage is recorded SKIPPED.
//
// Run with:   node scripts/autonomous-orchestrator.js
// Output dir defaults to `run/` at the repository root; override with RUN_OUTPUT_DIR.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.resolve(root, process.env.RUN_OUTPUT_DIR || "run");

const STAGES = [
  { name: "Repository Intelligence", script: "repository-intelligence.js" },
  { name: "Engineering Knowledge", script: "engineering-knowledge.js" },
  { name: "Recommendation Engine", script: "recommendation-engine.js" },
  { name: "Decision Engine", script: "decision-engine.js" },
  { name: "Implementation Request Engine", script: "implementation-request-engine.js" },
  { name: "Implementation Executor", script: "implementation-executor.js" },
  { name: "Validation Engine", script: "validation-engine.js" },
  { name: "Pull Request Generator", script: "pull-request-generator.js" },
  { name: "GitHub Publisher Adapter", script: "github-publisher.js" },
];

// Every artifact any stage might produce, relative to the repository root. Existence-checked only -- this
// orchestrator never opens or parses any of these; validating their content is each producing engine's own
// job, not this conductor's.
const KNOWN_ARTIFACTS = [
  "repository-intelligence/repository-analysis.json",
  "repository-intelligence/repository-analysis.md",
  "engineering-knowledge/engineering-knowledge.json",
  "engineering-knowledge/engineering-knowledge.md",
  "recommendations/recommendations.json",
  "recommendations/recommendations.md",
  "decision/decision.json",
  "decision/decision.md",
  "implementation-request/implementation-request.json",
  "implementation-request/implementation-request.md",
  "execution/execution.json",
  "execution/execution.md",
  "execution/patch-summary.json",
  "validation/validation.json",
  "validation/validation.md",
  "pull-request/pull-request.json",
  "pull-request/pull-request.md",
  "publish/publish.json",
  "publish/publish.md",
];

function truncate(text, max) {
  const value = typeof text === "string" ? text : "";
  return value.length > max ? `${value.slice(0, max)}... (truncated)` : value;
}

function resolveSpawnFn(deps) {
  return (deps && deps.spawnFn) || spawnSync;
}

/**
 * Runs a single stage as its own real CLI subprocess (`node scripts/<stage>.js`), capturing its exit code,
 * timing, and truncated stdout/stderr. The stage's exit code is the only signal trusted: 0 is PASS, anything
 * else (including a spawn-level error, e.g. the script file being missing) is FAIL.
 * @param {{name: string, script: string}} stage
 * @param {{spawnFn?: Function, cwd?: string, env?: object, nodeBin?: string}} [deps]
 * @returns {{name: string, script: string, status: string, exitCode: (number|null), startTime: string, endTime: string, durationMs: number, stdout: string, stderr: string}}
 */
function runStage(stage, deps) {
  const spawnFn = resolveSpawnFn(deps);
  const nodeBin = (deps && deps.nodeBin) || process.execPath;
  const scriptPath = path.join((deps && deps.cwd) || root, "scripts", stage.script);
  const startTime = new Date().toISOString();
  const startedAt = Date.now();
  const result = spawnFn(nodeBin, [scriptPath], { cwd: (deps && deps.cwd) || root, encoding: "utf8", env: (deps && deps.env) || process.env });
  const durationMs = Date.now() - startedAt;
  const endTime = new Date().toISOString();

  const spawnErrorMessage = result && result.error ? result.error.message : null;
  const exitCode = result ? result.status : null;
  const ok = !spawnErrorMessage && exitCode === 0;

  return {
    name: stage.name,
    script: stage.script,
    status: ok ? "PASS" : "FAIL",
    exitCode,
    startTime,
    endTime,
    durationMs,
    stdout: truncate((result && result.stdout) || "", 2000),
    stderr: truncate((result && result.stderr) || spawnErrorMessage || "", 2000),
  };
}

/**
 * Runs every stage in order, stopping immediately (recording every remaining stage as SKIPPED) the moment
 * one stage's exit code is non-zero. This is the single entry point both the CLI and any other caller (e.g.
 * tests) should use for the actual orchestration logic.
 * @param {{spawnFn?: Function, cwd?: string, env?: object, nodeBin?: string, onStageEvent?: Function}} [deps]
 *   onStageEvent, if supplied, is called with {phase: "start"|"end"|"skip", stage, result?} for progress
 *   reporting -- purely a side effect hook, never required for correctness.
 * @returns {{startTime: string, finishTime: string, durationMs: number, status: string, stages: object[]}}
 */
function runOrchestration(deps) {
  const startTime = new Date().toISOString();
  const startedAt = Date.now();
  const stages = [];
  let stopped = false;

  for (const stage of STAGES) {
    if (stopped) {
      const skipped = { name: stage.name, script: stage.script, status: "SKIPPED", exitCode: null, startTime: null, endTime: null, durationMs: null, stdout: "", stderr: "" };
      stages.push(skipped);
      if (deps && deps.onStageEvent) deps.onStageEvent({ phase: "skip", stage });
      continue;
    }
    if (deps && deps.onStageEvent) deps.onStageEvent({ phase: "start", stage });
    const result = runStage(stage, deps);
    stages.push(result);
    if (deps && deps.onStageEvent) deps.onStageEvent({ phase: "end", stage, result });
    if (result.status !== "PASS") stopped = true;
  }

  const finishTime = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  const status = stages.every((stage) => stage.status === "PASS") ? "success" : "failed";
  return { startTime, finishTime, durationMs, status, stages };
}

/**
 * Lists every known artifact that actually exists on disk after a run, relative to the repository root.
 * Existence-checked only -- never parsed, so a malformed leftover JSON file from a previous run is still
 * correctly reported as "produced" without this orchestrator ever needing to understand its contents.
 * @param {string} [baseDir] defaults to the repository root
 * @returns {string[]}
 */
function findArtifactsProduced(baseDir) {
  const base = baseDir || root;
  return KNOWN_ARTIFACTS.filter((relativePath) => fs.existsSync(path.join(base, ...relativePath.split("/"))));
}

/**
 * Derives a run id from the run's own start time -- unique per run, with no separate clock read of its own.
 * @param {string} startTime ISO timestamp
 * @returns {string}
 */
function buildRunId(startTime) {
  return `RUN-${startTime.replace(/[^0-9A-Za-z]/g, "")}`;
}

/**
 * Builds the complete run record from an already-computed orchestration result.
 * @param {{startTime: string, finishTime: string, durationMs: number, status: string, stages: object[]}} orchestrationResult
 * @param {string} [baseDir] defaults to the repository root; used by tests running against a temp fixture
 * @returns {object} matching run.json's shape
 */
function buildRunRecord(orchestrationResult, baseDir) {
  return {
    runId: buildRunId(orchestrationResult.startTime),
    startTime: orchestrationResult.startTime,
    finishTime: orchestrationResult.finishTime,
    durationMs: orchestrationResult.durationMs,
    status: orchestrationResult.status,
    stages: orchestrationResult.stages,
    artifactsProduced: findArtifactsProduced(baseDir),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Report Generator
// ---------------------------------------------------------------------------------------------------------

/**
 * Renders the human-readable Markdown report for a given run record.
 * @param {object} run result of buildRunRecord()
 * @returns {string}
 */
function renderMarkdown(run) {
  const lines = [];
  lines.push("# Autonomous Engineering Orchestrator Report", "");
  lines.push(
    "Generated by `scripts/autonomous-orchestrator.js` -- this is the conductor, not another pipeline engine. It only runs the nine existing stages in order and records what each one's own exit code reported; it never re-implements or re-decides anything any stage already owns.",
    ""
  );
  lines.push(`Run ID: \`${run.runId}\``, "");
  lines.push(`Timestamp: ${run.timestamp}`, "");

  lines.push("## Status", "");
  lines.push(`**${run.status}**`, "");

  lines.push("## Timing", "");
  lines.push(`- Start: ${run.startTime}`);
  lines.push(`- Finish: ${run.finishTime}`);
  lines.push(`- Duration: ${run.durationMs}ms`);
  lines.push("");

  lines.push("## Stages", "");
  lines.push("| # | Stage | Status | Exit Code | Duration |", "| ---: | --- | :---: | ---: | ---: |");
  run.stages.forEach((stage, index) => {
    lines.push(`| ${index + 1} | ${stage.name} | ${stage.status} | ${stage.exitCode === null ? "-" : stage.exitCode} | ${stage.durationMs === null ? "-" : `${stage.durationMs}ms`} |`);
  });
  lines.push("");

  const failed = run.stages.find((stage) => stage.status === "FAIL");
  if (failed) {
    lines.push("## Failure Detail", "");
    lines.push(`Stage **${failed.name}** (\`${failed.script}\`) exited with code ${failed.exitCode === null ? "unknown" : failed.exitCode}.`, "");
    if (failed.stderr) {
      lines.push("```", failed.stderr, "```", "");
    }
  }

  lines.push("## Artifacts Produced", "");
  (run.artifactsProduced.length ? run.artifactsProduced : ["None"]).forEach((artifact) => lines.push(`- \`${artifact}\``));
  lines.push("");

  lines.push("## Next Step", "");
  lines.push(
    run.status === "success"
      ? "Every stage completed successfully. Review `publish/publish.md` for the outcome (a dry run by default -- see GitHub Publisher Adapter's own documentation to publish for real)."
      : "Review the failed stage's details above (and its own report under its output directory), resolve the underlying issue, and re-run this orchestrator.",
    ""
  );

  return lines.join("\n");
}

/**
 * Writes run.json and run.md into the output directory (created if needed), returning their absolute paths.
 * @param {object} run
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(run) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "run.json");
  const mdPath = path.join(outputDir, "run.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(run, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(run)}\n`);
  return { jsonPath, mdPath };
}

/**
 * Prints clean, incremental console progress for a live run. A pure side effect -- never required for
 * correctness, and never used by runOrchestration() unless the caller opts in via deps.onStageEvent.
 * @param {{phase: string, stage: {name: string}, result?: object}} event
 */
function printProgress(event) {
  const index = STAGES.findIndex((stage) => stage.script === event.stage.script) + 1;
  const total = STAGES.length;
  if (event.phase === "start") {
    process.stdout.write(`[${index}/${total}] ${event.stage.name}... `);
  } else if (event.phase === "end") {
    const { status, exitCode, durationMs } = event.result;
    console.log(`${status}${exitCode !== null ? ` (exit ${exitCode})` : ""} - ${durationMs}ms`);
  } else if (event.phase === "skip") {
    console.log(`[${index}/${total}] ${event.stage.name}... SKIPPED`);
  }
}

function main() {
  console.log(`Autonomous Engineering Orchestrator v1 -- running ${STAGES.length} stages sequentially.\n`);
  const orchestrationResult = runOrchestration({ onStageEvent: printProgress });
  const run = buildRunRecord(orchestrationResult);
  const { jsonPath, mdPath } = writeOutputs(run);
  console.log(`\nWrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
  console.log(`\nRun ${run.status === "success" ? "SUCCEEDED" : "FAILED"} in ${run.durationMs}ms.`);
  if (run.status !== "success") process.exitCode = 1;
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
  outputDir,
  STAGES,
  KNOWN_ARTIFACTS,
  runStage,
  runOrchestration,
  findArtifactsProduced,
  buildRunId,
  buildRunRecord,
  renderMarkdown,
  writeOutputs,
  printProgress,
};
