/**
 * Integration test for `oram history` (Capability Sprint 13, Engineering Memory & Run History).
 *
 * Same technique as renderReflectionReport.test.ts: genuinely end-to-end, calls historyCommand() itself
 * (real arg parsing, the real buildRepositoryAnalysis -> ... -> buildReflectionReport -> MemoryEngine.record()
 * pipeline, the real renderHistoryReport(), the real console.log) against the concentrated-monorepo fixture.
 * Two non-deterministic lines are normalized before comparing against the stored snapshot: "Execution Time"
 * and "Latest Run" (its own RUN-<timestamp>-<sequence> id).
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderHistoryReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { historyCommand } from "../commands/history";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "history-concentrated-monorepo.snap.txt");

function normalize(output: string): string {
  return output
    .replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")
    .replace(/Latest Run: RUN-\S+/, "Latest Run: RUN-<normalized>");
}

test("oram history <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await historyCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "historyCommand should print exactly one report");

  const actual = `${normalize(logged[0]!)}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram history <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await historyCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram history <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await historyCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
