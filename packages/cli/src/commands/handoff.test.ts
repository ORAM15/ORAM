/**
 * Smoke coverage for `oram handoff` (Capability Sprint 17 -- Runtime Artifact Handoff demo).
 *
 * Not snapshot-based: the report intentionally contains a per-invocation runId and artifact count, so this
 * test asserts the structural facts instead -- exit code 0, one report, both consumer stages present, and
 * the "no recomputation" proof line. The command itself is the strong assertion: both consumer engines run
 * with THROWING recompute fallbacks, so a exit code 0 already proves artifacts were consumed.
 *
 * Run with: node --import tsx --test packages/cli/src/commands/handoff.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { handoffCommand } from "./handoff";

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

test("oram handoff <concentrated-monorepo>: consumers read this run's artifacts, recompute fallbacks never fire", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await handoffCommand([FIXTURE]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "handoffCommand should print exactly one report");

  const report = logged[0]!;
  assert.ok(report.includes("[consume] adaptive-decision <- validation, recommendation, reflection"));
  assert.ok(report.includes("[consume] pull-request <- implementation-requests, execution-planning, validation, recommendation, reflection, adaptive-decision"));
  assert.ok(report.includes("Recomputation .......... NONE (fallbacks were forbidden)"));
  assert.ok(report.includes("[artifact] pull-request/pull-request-proposal"));
});

test("oram handoff <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await handoffCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
