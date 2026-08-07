/**
 * Integration test for `oram plan` (Capability Sprint 2, Engineering Planning).
 *
 * Same technique as renderAnalysisReport.test.ts: genuinely end-to-end, calls planCommand() itself (real arg
 * parsing, the real buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning ->
 * buildEngineeringPlan pipeline, the real renderPlanReport(), the real console.log) against the
 * concentrated-monorepo fixture (chosen because it's the one fixture proven, in engineering-planning's own
 * tests, to trigger both real mapping rules -- the richest report this pipeline can currently produce). Only
 * the "Execution Time" line is non-deterministic (real wall-clock elapsed ms), normalized before comparing
 * against the stored snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderPlanReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { planCommand } from "../commands/plan";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "plan-concentrated-monorepo.snap.txt");

test("oram plan <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await planCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "planCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram plan <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await planCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
