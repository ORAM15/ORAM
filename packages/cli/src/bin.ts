#!/usr/bin/env node
/**
 * The `oram` entry point -- see package.json's `bin` field. Runnable two ways:
 *   - dev mode: `npx tsx packages/cli/src/bin.ts <command> ...` (or via the workspace root's `oram` bin
 *     symlink once `npm install` has hoisted it)
 *   - built/linked mode: `npm run build` bundles this file (via esbuild) into dist/bin.js, which is what
 *     `npm link` exposes globally as `oram`
 * Thin process wrapper only -- all real dispatch logic stays in ./index.ts's main().
 */
import { main } from "./index";

main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
