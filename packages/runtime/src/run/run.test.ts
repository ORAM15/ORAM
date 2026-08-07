import { test } from "node:test";
import assert from "node:assert/strict";
import { Run } from "./run";
import type { RunContext } from "./run-context";

const FAKE_CONTEXT: RunContext = { repositoryRoot: "/fake/repo", workflowId: "engineering" };

test("a new Run is PENDING with no timestamps, and carries the RunContext it was given", () => {
  const run = new Run("RUN-1", FAKE_CONTEXT);
  assert.equal(run.id, "RUN-1");
  assert.equal(run.context, FAKE_CONTEXT);
  assert.equal(run.context.repositoryRoot, "/fake/repo");
  assert.equal(run.context.workflowId, "engineering");
  assert.equal(run.status, "PENDING");
  assert.equal(run.startedAt, null);
  assert.equal(run.finishedAt, null);
});

test("start() marks RUNNING and stamps startedAt", () => {
  const run = new Run("RUN-1", FAKE_CONTEXT);
  run.start();
  assert.equal(run.status, "RUNNING");
  assert.ok(run.startedAt);
  assert.equal(run.finishedAt, null);
});

test("finish() marks FINISHED and stamps finishedAt", () => {
  const run = new Run("RUN-1", FAKE_CONTEXT);
  run.start();
  run.finish();
  assert.equal(run.status, "FINISHED");
  assert.ok(run.finishedAt);
});

test("fail() marks FAILED and stamps finishedAt", () => {
  const run = new Run("RUN-1", FAKE_CONTEXT);
  run.start();
  run.fail();
  assert.equal(run.status, "FAILED");
  assert.ok(run.finishedAt);
});
