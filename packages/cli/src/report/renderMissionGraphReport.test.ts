/**
 * Integration test for `oram missions` (Capability Sprint 5, Engineering Mission Engine).
 *
 * Same technique as renderPlanReport.test.ts: genuinely end-to-end, calls missionsCommand() itself (real arg
 * parsing, the real buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning ->
 * buildEngineeringPlan -> buildMissionGraph pipeline, the real renderMissionGraphReport(), the real
 * console.log) against the concentrated-monorepo fixture (the richest report this pipeline can currently
 * produce -- 2 Missions forming one dependency chain). Only the "Execution Time" line is non-deterministic,
 * normalized before comparing against the stored snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderMissionGraphReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { missionsCommand } from "../commands/missions";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "missions-concentrated-monorepo.snap.txt");

test("oram missions <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await missionsCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "missionsCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram missions <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await missionsCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram missions <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await missionsCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
