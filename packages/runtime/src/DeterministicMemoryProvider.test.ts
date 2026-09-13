import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicMemoryProvider } from "./DeterministicMemoryProvider";


test("DeterministicMemoryProvider exposes the advertised memory identity and safe capabilities", () => {
  const provider = new DeterministicMemoryProvider();

  assert.equal(provider.id, "memory");
  assert.deepEqual(provider.capabilities(), {
    canImplement: true,
    canDecide: false,
    canValidate: false,
  });
});

test("DeterministicMemoryProvider implements without external side effects", async () => {
  const provider = new DeterministicMemoryProvider();
  const result = await provider.implement({ title: "synthetic work order" });

  assert.equal(result.status, "success");
  assert.deepEqual(result.modifiedFiles, []);
  assert.equal(result.testsExecuted, 0);
  assert.equal(result.testsPassed, 0);
  assert.equal(result.providerEvidence?.simulated, true);
  assert.match(result.warnings[0] ?? "", /simulation-only/);
});
