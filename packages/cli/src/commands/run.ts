/**
 * `oram run` — executes a full Engineering Cycle end to end, pausing at the human-approval gate.
 *
 * PURPOSE: the primary command. Direct successor to `node scripts/autonomous-orchestrator.js` /
 * `node scripts/gvams-cli.js autonomous`, but driven through @oram/runtime's Lifecycle instead of a
 * subprocess-chaining script.
 *
 * INPUTS (future): optional `--provider <id>`, `--goal <text>`, `--max-iterations <n>` -- direct successors
 *   to today's EXECUTION_PROVIDER / GVAMS_GOAL / GVAMS_MAX_ITERATIONS environment variables, promoted to
 *   real, documented CLI flags (docs/ORAM_SPECIFICATION_v1.md Section 9's configuration-model motivation:
 *   no environment variable should be something a user has to already know exists).
 * OUTPUTS (future): a run id; live stage-by-stage terminal output (Runtime Events rendered as they arrive);
 *   Artifacts persisted under the configured ArtifactStore location.
 *
 * TODO(cli): wire to @oram/runtime's Runtime.start()/approve() once that class has a real implementation.
 */
export async function runCommand(_args: string[]): Promise<number> {
  console.log("oram run: Not implemented yet.");
  return 0;
}
