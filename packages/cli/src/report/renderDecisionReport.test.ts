/**
 * Integration test for `oram decide` (Capability Sprint 14, Adaptive Decision Engine).
 *
 * Same technique as renderHistoryReport.test.ts: genuinely end-to-end, calls decideCommand() itself (real arg
 * parsing, the real buildRepositoryAnalysis -> ... -> buildReflectionReport -> buildEngineeringDecision
 * pipeline, the real renderDecisionReport(), the real console.log) against the concentrated-monorepo fixture.
 * Only the "Execution Time" line is non-deterministic, normalized before comparing against the stored
 * snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderDecisionReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { decideCommand } from "../commands/decide";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "decide-concentrated-monorepo.snap.txt");

test("oram decide <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await decideCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "decideCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram decide <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await decideCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram decide <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await decideCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
