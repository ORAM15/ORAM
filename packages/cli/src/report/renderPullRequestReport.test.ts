/**
 * Integration test for `oram pull-request` (Capability Sprint 16, Pull Request Engine).
 *
 * Same technique as renderDecisionReport.test.ts: genuinely end-to-end, calls pullRequestCommand() itself
 * (real arg parsing, the real buildRepositoryAnalysis -> ... -> buildEngineeringDecision ->
 * buildPullRequestProposal pipeline, the real renderPullRequestReport(), the real console.log) against the
 * concentrated-monorepo fixture. Only the "Execution Time" line is non-deterministic, normalized before
 * comparing against the stored snapshot -- which also proves the rendered proposal (branch name, title, full
 * PR body) is deterministic and machine-independent, since CI renders this same snapshot on Linux.
 *
 * Run with: node --import tsx --test packages/cli/src/report/renderPullRequestReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { pullRequestCommand } from "../commands/pull-request";

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
const SNAPSHOT_PATH = path.join(import.meta.dirname, "__snapshots__", "pull-request-concentrated-monorepo.snap.txt");

test("oram pull-request <concentrated-monorepo>: full CLI output matches the stored snapshot", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await pullRequestCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "pullRequestCommand should print exactly one report");

  const actual = `${logged[0]!.replace(/(Execution Time \.+) \d+ ms/, "$1 0 ms")}\n`;
  const expected = readFileSync(SNAPSHOT_PATH, "utf8");

  assert.equal(actual, expected);
});

test("oram pull-request <path not found>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await pullRequestCommand([path.join(FIXTURE, "does-not-exist")]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram pull-request <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await pullRequestCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
