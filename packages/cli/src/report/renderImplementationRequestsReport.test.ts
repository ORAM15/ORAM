/**
 * Integration test for `oram requests` (Capability Sprint 6, Implementation Request Engine).
 *
 * Same technique as renderMissionGraphReport.test.ts: genuinely end-to-end, calls requestsCommand() itself
 * (real arg parsing, the real buildRepositoryAnalysis -> buildEngineeringKnowledge -> buildEngineeringReasoning
 * -> buildEngineeringPlan -> buildMissionGraph -> buildImplementationRequests pipeline, the real
 * renderImplementationRequestsReport(), the real console.log) against the concentrated-monorepo fixture (the
 * richest report this pipeline can currently produce -- 2 requests, one with real targets, one with none).
 * Only the "Execution Time" line is non-deterministic, normalized before comparing against the stored
 * snapshot.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderImplementationRequestsReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { requestsCommand } from "../commands/requests";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "requests-concentrated-monorepo.snap.txt");

test("oram requests <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await requestsCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "requestsCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram requests <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await requestsCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram requests <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await requestsCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
