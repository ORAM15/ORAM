/**
 * Integration test for `oram execute-plan` (Capability Sprint 7, Execution Planning Engine).
 *
 * Same technique as renderImplementationRequestsReport.test.ts: genuinely end-to-end, calls
 * executePlanCommand() itself (real arg parsing, the real buildRepositoryAnalysis -> buildEngineeringKnowledge
 * -> buildEngineeringReasoning -> buildEngineeringPlan -> buildMissionGraph -> buildImplementationRequests ->
 * buildExecutionPlans pipeline, the real renderExecutionPlanReport(), the real console.log) against the
 * concentrated-monorepo fixture (the richest report this pipeline can currently produce -- 2 chained
 * execution plans, matching this Sprint's own spec example for "Increase Test Coverage"). Only the
 * "Execution Time" line is non-deterministic, normalized before comparing against the stored snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderExecutionPlanReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { executePlanCommand } from "../commands/execute-plan";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "execute-plan-concentrated-monorepo.snap.txt");

test("oram execute-plan <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executePlanCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "executePlanCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram execute-plan <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executePlanCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram execute-plan <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await executePlanCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
