/**
 * Smoke coverage for the real `oram run` and its real safety gate (Capability Sprints 18 and 19).
 *
 * Not snapshot-based: the report intentionally contains a per-invocation runId, artifact-store path, and
 * execution time. This asserts the structural facts instead: exit code 0, one report per invocation, honest
 * per-stage checkmarks, and the three demonstrable paths -- paused at the gate, approved through to COMPLETE,
 * and rejected to ABORTED, each entirely non-interactive (no stdin involved, so this is CI-safe).
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

const PRE_APPROVAL_LABELS = [
  "Repository Analysis",
  "Engineering Knowledge",
  "Engineering Reasoning",
  "Engineering Planning",
  "Engineering Missions",
  "Implementation Requests",
  "Execution Planning",
];

const POST_APPROVAL_LABELS = ["Provider Execution", "Validation", "Recommendation", "Reflection", "Adaptive Decision", "Pull Request Proposal", "Publisher"];

async function runWithCapturedOutput(args: string[]): Promise<{ exitCode: number; logged: string[] }> {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logged.push(String(message));
  };
  try {
    const exitCode = await runCommand(args);
    return { exitCode, logged };
  } finally {
    console.log = originalLog;
  }
}

test("oram run <concentrated-monorepo>: stops at AWAITING_APPROVAL -- Provider Execution has NOT occurred", async (t) => {
  const artifactsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-run-cli-gate-"));
  t.after(async () => {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  });

  const { exitCode, logged } = await runWithCapturedOutput([FIXTURE, "--artifacts-dir", artifactsDir]);

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1, "runCommand should print exactly one report");

  const report = logged[0]!;
  for (const label of PRE_APPROVAL_LABELS) assert.ok(report.includes(`[✓] ${label}`), `report should show [✓] ${label}`);
  for (const label of POST_APPROVAL_LABELS) assert.ok(report.includes(`[ ] ${label}`), `report should show [ ] ${label} (not yet run)`);
  assert.ok(report.includes("STATUS ................. AWAITING_APPROVAL"));
  assert.ok(report.includes("Provider Execution has NOT occurred."));
  assert.ok(!report.includes("Run APPROVED"));
  assert.ok(!report.includes("Run REJECTED"));
  assert.ok(report.includes("Lifecycle .............. AWAITING_APPROVAL"));
  assert.ok(report.includes("Artifacts Persisted .... 7"));
  assert.ok(report.includes("ORAM RUN AWAITING_APPROVAL"));

  // Exactly the seven pre-approval artifacts are really on disk -- nothing post-approval exists.
  const runsDir = path.join(artifactsDir, "runs");
  const runIds = await fsp.readdir(runsDir);
  assert.equal(runIds.length, 1);
  const artifactsRoot = path.join(runsDir, runIds[0]!, "artifacts");
  const stageDirs = (await fsp.readdir(artifactsRoot)).filter((name) => name !== "_index.json");
  assert.equal(stageDirs.length, 7);
  assert.ok(!stageDirs.includes("provider-execution"));
});

test("oram run <concentrated-monorepo> --approve: continues the SAME run through Provider Execution to COMPLETE", async (t) => {
  const artifactsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-run-cli-approve-"));
  t.after(async () => {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  });

  const { exitCode, logged } = await runWithCapturedOutput([FIXTURE, "--artifacts-dir", artifactsDir, "--approve"]);

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1);

  const report = logged[0]!;
  for (const label of [...PRE_APPROVAL_LABELS, ...POST_APPROVAL_LABELS]) {
    assert.ok(report.includes(`[✓] ${label}`), `report should show [✓] ${label} after approval`);
  }
  assert.ok(report.includes("Run APPROVED. Provider Execution has now occurred exactly once."));
  assert.ok(report.includes("FINAL DECISION"));
  assert.ok(report.includes("PULL REQUEST PROPOSAL (generated, not published)"));
  assert.ok(report.includes("PUBLISH RECORD (dry run -- nothing was actually published)"));
  assert.ok(report.includes("Lifecycle .............. COMPLETE"));
  assert.ok(report.includes("Artifacts Persisted .... 14"));
  assert.ok(report.includes("ORAM RUN COMPLETE"));

  // All 14 stage artifacts, one run, on disk.
  const runsDir = path.join(artifactsDir, "runs");
  const runIds = await fsp.readdir(runsDir);
  assert.equal(runIds.length, 1);
  const artifactsRoot = path.join(runsDir, runIds[0]!, "artifacts");
  const stageDirs = (await fsp.readdir(artifactsRoot)).filter((name) => name !== "_index.json");
  assert.equal(stageDirs.length, 14);
  assert.ok(stageDirs.includes("publisher"));
});

test("oram run <concentrated-monorepo> --reject: reaches ABORTED -- Provider Execution never occurred", async (t) => {
  const artifactsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-run-cli-reject-"));
  t.after(async () => {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  });

  const { exitCode, logged } = await runWithCapturedOutput([FIXTURE, "--artifacts-dir", artifactsDir, "--reject=not ready yet"]);

  assert.equal(exitCode, 0);
  assert.equal(logged.length, 1);

  const report = logged[0]!;
  assert.ok(report.includes("Run REJECTED: not ready yet."));
  assert.ok(report.includes("Provider Execution did NOT occur and never will for this run."));
  assert.ok(report.includes("Lifecycle .............. ABORTED"));
  assert.ok(report.includes("Artifacts Persisted .... 7"));
  assert.ok(report.includes("ORAM RUN ABORTED"));
  assert.ok(!report.includes("FINAL DECISION"));
  assert.ok(!report.includes("PULL REQUEST PROPOSAL"));

  // Only the seven pre-approval artifacts on disk -- rejection must never produce a provider-execution artifact.
  const runsDir = path.join(artifactsDir, "runs");
  const runIds = await fsp.readdir(runsDir);
  const artifactsRoot = path.join(runsDir, runIds[0]!, "artifacts");
  const stageDirs = (await fsp.readdir(artifactsRoot)).filter((name) => name !== "_index.json");
  assert.equal(stageDirs.length, 7);
  assert.ok(!stageDirs.includes("provider-execution"));
});

test("oram run --approve --reject: mutually exclusive, exits 1", async () => {
  const { exitCode, logged } = await runWithCapturedOutput([FIXTURE, "--approve", "--reject"]);
  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});

test("oram run <missing path>: exits 1 without printing a report", async () => {
  const { exitCode, logged } = await runWithCapturedOutput([]);
  assert.equal(exitCode, 1);
  assert.equal(logged.length, 0);
});
