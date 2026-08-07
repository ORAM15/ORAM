#!/usr/bin/env node
// Claude Code Provider Adapter v1 -- adapter.js
//
// The real Claude Code Provider Adapter: receives an implementation request from Implementation Executor
// v1, validates it, builds a deterministic prompt (prompt-builder.js), invokes the real Claude Code
// executable as a subprocess, captures its stdout/stderr/exit code/duration/execution metadata, and hands
// that raw output to parser.js to be converted into the fixed provider contract every provider must return.
// All Claude-specific logic (how the executable is invoked, what its output looks like) is isolated to this
// providers/claude/ directory -- Implementation Executor v1 itself only ever sees the fixed contract.
//
// This adapter never throws for operational failures (missing executable, timeout, malformed output) --
// those are legitimate execution outcomes, reported as a normal outcome:"failure" result via parser.js. It
// throws only when the request itself is invalid (a caller/wiring error, not a runtime execution outcome),
// consistent with fail-closed behavior used throughout this pipeline.
//
// Configuration (all overridable so this adapter works across Claude Code CLI versions/environments):
//   CLAUDE_CODE_BIN         executable name or path to invoke (default: "claude")
//   CLAUDE_CODE_ARGS        space-separated CLI args (default: "--print"); the prompt itself is always
//                           passed via stdin, never as an argv value, so prompt length/quoting can never
//                           break the invocation
//   CLAUDE_CODE_TIMEOUT_MS  maximum time to wait for a response (default: 300000 = 5 minutes)
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const { buildPrompt } = require("./prompt-builder");
const { parseClaudeOutput } = require("./parser");

const DEFAULT_BIN = "claude";
const DEFAULT_ARGS = ["--print"];
const DEFAULT_TIMEOUT_MS = 300000;
const MAX_BUFFER = 10 * 1024 * 1024;

const REQUIRED_FIELDS = ["requestId", "title", "goal", "affectedFiles", "implementationConstraints", "acceptanceCriteria", "validationChecklist"];
const REQUIRED_ARRAY_FIELDS = ["affectedFiles", "implementationConstraints", "acceptanceCriteria", "validationChecklist"];

/**
 * Validates that an implementation request has everything this adapter needs to build a prompt. Fails
 * closed (throws) on anything missing or the wrong type -- the adapter never guesses at missing fields.
 * @param {object} request
 */
function assertValidRequest(request) {
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    throw new Error("Claude Code Provider Adapter received an invalid implementation request (not an object).");
  }
  const missing = REQUIRED_FIELDS.filter((field) => request[field] === undefined || request[field] === null);
  if (missing.length > 0) {
    throw new Error(`Claude Code Provider Adapter received an implementation request missing required field(s): ${missing.join(", ")}.`);
  }
  const nonArray = REQUIRED_ARRAY_FIELDS.filter((field) => !Array.isArray(request[field]));
  if (nonArray.length > 0) {
    throw new Error(`Claude Code Provider Adapter received an implementation request with non-array field(s): ${nonArray.join(", ")}.`);
  }
}

function resolveBin(deps) {
  return (deps && deps.bin) || process.env.CLAUDE_CODE_BIN || DEFAULT_BIN;
}

function resolveArgs(deps) {
  if (deps && deps.args) return deps.args;
  if (process.env.CLAUDE_CODE_ARGS) return process.env.CLAUDE_CODE_ARGS.split(" ").filter(Boolean);
  return [...DEFAULT_ARGS];
}

function resolveTimeoutMs(deps) {
  if (deps && deps.timeoutMs) return deps.timeoutMs;
  const fromEnv = Number(process.env.CLAUDE_CODE_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

function buildInvocationId(deps) {
  if (deps && deps.invocationId) return deps.invocationId;
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `claude-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Receives an implementation request, validates it, builds its deterministic prompt, invokes Claude Code
 * (or an injected stand-in spawn function, for testing) as a subprocess, captures raw execution metadata,
 * and returns the parsed provider contract result from parser.js.
 * @param {object} request parsed implementation-request.json (a non-empty selection)
 * @param {{bin?: string, args?: string[], timeoutMs?: number, invocationId?: string, providerVersion?: string, spawnFn?: Function}} [deps]
 *   injectable dependencies; production callers omit this and get the real executable/spawnSync
 * @returns {object} the fixed provider contract result (see parser.js)
 */
function claudeProviderAdapter(request, deps) {
  assertValidRequest(request);

  const prompt = buildPrompt(request);
  const bin = resolveBin(deps);
  const args = resolveArgs(deps);
  const timeoutMs = resolveTimeoutMs(deps);
  const invocationId = buildInvocationId(deps);
  const spawnFn = (deps && deps.spawnFn) || spawnSync;

  const startedAt = Date.now();
  const result = spawnFn(bin, args, {
    input: prompt,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER,
  });
  const durationMs = Date.now() - startedAt;

  const timedOut = Boolean(result && result.error && result.error.code === "ETIMEDOUT");
  const spawnError = result && result.error && !timedOut ? { code: result.error.code || "UNKNOWN", message: result.error.message } : null;

  return parseClaudeOutput({
    stdout: (result && result.stdout) || "",
    stderr: (result && result.stderr) || "",
    exitCode: result ? result.status : null,
    timedOut,
    spawnError,
    durationMs,
    invocationId,
    providerVersion: (deps && deps.providerVersion) || null,
  });
}

module.exports = {
  claudeProviderAdapter,
  assertValidRequest,
  resolveBin,
  resolveArgs,
  resolveTimeoutMs,
  buildInvocationId,
  DEFAULT_BIN,
  DEFAULT_ARGS,
  DEFAULT_TIMEOUT_MS,
};
