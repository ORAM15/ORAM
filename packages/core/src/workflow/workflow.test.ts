import { test } from "node:test";
import assert from "node:assert/strict";
import { ENGINEERING_WORKFLOW } from "./engineering-workflow";

test("ENGINEERING_WORKFLOW is the literal transcription of the sequence Runtime.ts previously hardcoded", () => {
  assert.equal(ENGINEERING_WORKFLOW.id, "engineering");
  assert.equal(ENGINEERING_WORKFLOW.name, "Engineering Analysis");
  assert.deepEqual(ENGINEERING_WORKFLOW.steps, ["observe", "understand", "reason", "plan"]);
});
