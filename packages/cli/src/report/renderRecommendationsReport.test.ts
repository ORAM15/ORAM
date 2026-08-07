/**
 * Integration test for `oram recommend` (Capability Sprint 11, Recommendation Engine).
 *
 * Same technique as renderExecutionReport.test.ts: genuinely end-to-end, calls recommendCommand() itself
 * (real arg parsing, the real buildRepositoryAnalysis -> ... -> validateAll -> buildRecommendationSet
 * pipeline, the real renderRecommendationsReport(), the real console.log) against the concentrated-monorepo
 * fixture (8 ValidationIssues -> 8 Recommendations via the default, side-effect-free MemoryProvider). Only
 * the "Execution Time" line is non-deterministic, normalized before comparing against the stored snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderRecommendationsReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { recommendCommand } from "../commands/recommend";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "recommend-concentrated-monorepo.snap.txt");

test("oram recommend <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await recommendCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "recommendCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram recommend <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await recommendCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram recommend <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await recommendCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
