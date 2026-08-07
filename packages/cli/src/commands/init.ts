/**
 * `oram init` — fingerprints the current repository and creates its local ORAM configuration.
 *
 * PURPOSE: the first-run command. No existing command in this repository does this today -- every
 * scripts/gvams-cli.js command assumes the pipeline's scripts/ directory already exists in place inside the
 * repository being analyzed. `oram init` is what removes that assumption for an end user (see
 * docs/ORAM_SPECIFICATION_v1.md Section 9 for the intended interactive experience).
 *
 * INPUTS (future): optional `--yes` to accept every default non-interactively; optional `--provider <id>`
 *   to preselect a Provider instead of prompting.
 * OUTPUTS (future): `oram.config.json` written to the target repository root, validated against
 *   oram.config.schema.json; a printed fingerprint summary (language/stack/detected modules), reusing
 *   Observe's own detectors (today: scripts/repository-intelligence.js) as a preview.
 *
 * TODO(cli): wire to @oram/runtime once oram.config.schema.json has a generated TypeScript type to validate
 *   against.
 */
export async function initCommand(_args: string[]): Promise<number> {
  console.log("oram init: Not implemented yet.");
  return 0;
}
