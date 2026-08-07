/**
 * Integration test for `oram analyze` (Capability Sprint 1, presentation demo).
 *
 * Genuinely end-to-end: calls analyzeCommand() itself (real arg parsing, the real
 * buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning pipeline, the real
 * renderAnalysisReport(), the real console.log) against the engineering-reasoning package's own
 * concentrated-monorepo fixture (chosen because it's the one fixture already proven, in that package's own
 * tests, to exercise all 5 reasoning rules -- the richest, most representative report this pipeline can
 * currently produce). Only the "Execution Time" line is non-deterministic (real wall-clock elapsed ms), so
 * it's normalized to a fixed placeholder before comparing against the stored snapshot -- the same technique
 * any snapshot test uses for a timestamp/duration field, not a loosening of the assertion.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderAnalysisReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { analyzeCommand } from "../commands/analyze";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "analyze-concentrated-monorepo.snap.txt");

test("oram analyze <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await analyzeCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "analyzeCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});
