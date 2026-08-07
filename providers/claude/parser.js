#!/usr/bin/env node
// Claude Code Provider Adapter v1 -- parser.js
//
// Converts Claude Code's captured raw execution output (stdout/stderr/exit code/timing/spawn errors) into
// the fixed provider contract every Provider Adapter must return to Implementation Executor v1:
//   { outcome, filesChanged, testsRun, testsOk, notes, problems, summary, providerEvidence }
// This function never throws and never returns a provider-specific shape: a missing executable, a timeout,
// unparseable stdout, or a malformed/contradictory result block are all converted into a well-formed
// outcome:"failure" result rather than crashing the executor or leaking Claude-specific fields upstream.
const { RESULT_START_MARKER, RESULT_END_MARKER } = require("./prompt-builder");

const VALID_OUTCOMES = new Set(["success", "failure", "cancelled"]);

function truncate(text, max) {
  if (typeof text !== "string") return "";
  return text.length > max ? `${text.slice(0, max)}... (truncated)` : text;
}

function buildProviderEvidence(raw) {
  return {
    providerName: "Claude Code",
    providerVersion: (raw && raw.providerVersion) || null,
    executionMode: "real",
    invocationId: (raw && raw.invocationId) || null,
    exitCode: raw && raw.exitCode !== undefined ? raw.exitCode : null,
    durationMs: raw && raw.durationMs !== undefined ? raw.durationMs : null,
  };
}

function failureResult(raw, problems, notes) {
  return {
    outcome: "failure",
    filesChanged: [],
    testsRun: 0,
    testsOk: 0,
    notes: notes || [],
    problems,
    summary: problems[0] || "Claude Code execution failed.",
    providerEvidence: buildProviderEvidence(raw),
  };
}

/**
 * Locates and parses the single JSON result block Claude Code was instructed (by prompt-builder.js) to
 * output between RESULT_START_MARKER/RESULT_END_MARKER. Returns a discriminated result rather than
 * throwing, so callers can report exactly why extraction failed.
 * @param {string} stdout
 * @returns {{ok: true, parsed: object} | {ok: false, reason: string}}
 */
function extractResultBlock(stdout) {
  if (typeof stdout !== "string") return { ok: false, reason: "stdout was not a string" };

  const startIndex = stdout.indexOf(RESULT_START_MARKER);
  const endIndex = stdout.indexOf(RESULT_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { ok: false, reason: `output did not contain a valid ${RESULT_START_MARKER} / ${RESULT_END_MARKER} block` };
  }

  const jsonText = stdout.slice(startIndex + RESULT_START_MARKER.length, endIndex).trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return { ok: false, reason: `result block was not valid JSON: ${error.message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "result block was not a JSON object" };
  }
  if (!VALID_OUTCOMES.has(parsed.outcome)) {
    return { ok: false, reason: `result block had an invalid or missing "outcome" (got: ${JSON.stringify(parsed.outcome)})` };
  }
  if (parsed.filesChanged !== undefined && !Array.isArray(parsed.filesChanged)) {
    return { ok: false, reason: '"filesChanged" was present but not an array' };
  }

  return { ok: true, parsed };
}

function parseClaudeOutputInner(raw) {
  raw = raw && typeof raw === "object" ? raw : {};

  if (raw.spawnError) {
    return failureResult(raw, [`Claude Code executable could not be launched: ${raw.spawnError.message}`]);
  }
  if (raw.timedOut) {
    return failureResult(raw, [`Claude Code execution timed out after ${raw.durationMs}ms.`]);
  }

  const extracted = extractResultBlock(raw.stdout);
  if (!extracted.ok) {
    const excerpt = truncate(raw.stdout, 500);
    return failureResult(raw, [`Could not parse Claude Code's output: ${extracted.reason}.`], excerpt ? [`Raw output excerpt: ${excerpt}`] : []);
  }

  const parsed = extracted.parsed;
  let outcome = parsed.outcome;
  const problems = Array.isArray(parsed.problems) ? [...parsed.problems] : [];

  if (typeof raw.exitCode === "number" && raw.exitCode !== 0 && outcome === "success") {
    outcome = "failure";
    problems.push(
      `Claude Code process exited with code ${raw.exitCode} but reported outcome "success"; treating this as a failure since the process exit code takes precedence.`
    );
  }

  return {
    outcome,
    filesChanged: Array.isArray(parsed.filesChanged) ? parsed.filesChanged : [],
    testsRun: typeof parsed.testsRun === "number" ? parsed.testsRun : 0,
    testsOk: typeof parsed.testsOk === "number" ? parsed.testsOk : 0,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    problems,
    summary: typeof parsed.summary === "string" && parsed.summary ? parsed.summary : `Claude Code execution completed with outcome "${outcome}".`,
    providerEvidence: buildProviderEvidence(raw),
  };
}

/**
 * Converts Claude Code's captured raw execution output into the fixed provider contract. Never throws --
 * any missing executable, timeout, or malformed/contradictory output becomes a well-formed
 * outcome:"failure" result instead of crashing the executor.
 * @param {{stdout: string, stderr: string, exitCode: (number|null), timedOut: boolean, spawnError: ({code: string, message: string}|null), durationMs: number, invocationId: string, providerVersion: (string|null)}} raw
 * @returns {{outcome: string, filesChanged: string[], testsRun: number, testsOk: number, notes: string[], problems: string[], summary: string, providerEvidence: object}}
 */
function parseClaudeOutput(raw) {
  try {
    return parseClaudeOutputInner(raw);
  } catch (error) {
    const safeRaw = raw && typeof raw === "object" ? raw : {};
    return failureResult(safeRaw, [`Parser encountered an unexpected internal error: ${error.message}`]);
  }
}

module.exports = { parseClaudeOutput, extractResultBlock, buildProviderEvidence, VALID_OUTCOMES };
