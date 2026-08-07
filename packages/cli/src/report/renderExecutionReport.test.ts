/**
 * Integration test for `oram execute` (Capability Sprint 8, Implementation Executor).
 *
 * Same technique as renderExecutionPlanReport.test.ts: genuinely end-to-end, calls executeCommand() itself
 * (real arg parsing, the real buildRepositoryAnalysis -> ... -> buildExecutionPlans -> executeAll pipeline,
 * the real renderExecutionReport(), the real console.log) against the concentrated-monorepo fixture (the
 * richest report this pipeline can currently produce -- 2 plans, 8 steps, all SUCCESS via the default,
 * side-effect-free MemoryAdapter). Only the "Execution Time" line is non-deterministic, normalized before
 * comparing against the stored snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderExecutionReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { executeCommand } from "../commands/execute";

const FIXTURE = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "engines",
  "src",
  "engineering-reasoning",
  "__fixtures__",
  "concentrated-monorepo"
);
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "execute-concentrated-monorepo.snap.txt");

test("oram execute <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executeCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "executeCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram execute <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executeCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram execute <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executeCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
