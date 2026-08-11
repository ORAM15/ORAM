/**
 * Smoke coverage for the real `oram run` (Capability Sprint 18 -- Full Runtime Pipeline).
 *
 * Not snapshot-based: the report intentionally contains a per-invocation runId, artifact-store path, and
 * execution time. This asserts the structural facts instead: exit code 0, one report, every one of the
 * thirteen stages checked [✓] (each checkmark is derived from a real persisted artifact, never printed on
 * faith), the FINAL DECISION and PULL REQUEST PROPOSAL sections, and the COMPLETE lifecycle. The pipeline
 * itself already fails loudly on any recomputation (createFullPipelineEngines() wires throwing fallbacks),
 * so exit code 0 doubles as the handoff proof.
 *
 * Run with: node --import tsx --test packages/cli/src/commands/run.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runCommand } from "./run";

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

const ALL_STAGE_LABELS = [
  "Repository Analysis",
  "Engineering Knowledge",
  "Engineering Reasoning",
  "Engineering Planning",
  "Engineering Missions",
  "Implementation Requests",
  "Execution Planning",
  "Provider Execution",
  "Validation",
  "Recommendation",
  "Reflection",
  "Adaptive Decision",
  "Pull Request Proposal",
];

test("oram run <concentrated-monorepo>: executes every real stage through the Runtime and reports COMPLETE", async (t) => {
  const artifactsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-run-cli-"));
  t.after(async () => {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  });

  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await runCommand([FIXTURE, "--artifacts-dir", artifactsDir]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "runCommand should print exactly one report");

  const report = logged[0]!;
  for (const label of ALL_STAGE_LABELS) {
    assert.ok(report.includes(`[✓] ${label}`), `report should show [✓] ${label}`);
  }
  assert.ok(!report.includes("[✗]"), "no stage may be reported as failed");
  assert.ok(report.includes("FINAL DECISION"));
  assert.ok(report.includes("PULL REQUEST PROPOSAL (generated, not published)"));
  assert.ok(report.includes("Lifecycle .............. COMPLETE"));
  assert.ok(report.includes("Artifacts Persisted .... 13"));

  // The artifacts really are on disk where the report says they are (one run directory, 13 stage artifacts + index).
  const runsDir = path.join(artifactsDir, "runs");
  const runIds = await fsp.readdir(runsDir);
  assert.equal(runIds.length, 1);
});

test("oram run <missing path>: exits 1 without printing a report", async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };

  let exitCode: number;
  try {
    exitCode = await runCommand([]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
