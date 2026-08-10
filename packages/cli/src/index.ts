/**
 * ORAM CLI — command dispatcher.
 *
 * A single flat lookup table (COMMANDS) rather than a switch/if-else chain: adding a command means adding
 * one entry, not a new branch. Flag-style invocations (--help/-h, --version/-v) are normalized onto their
 * subcommand equivalents (FLAG_ALIASES) before the same table lookup runs, so there is exactly one dispatch
 * path, not a separate flag-handling branch bolted on top.
 *
 * Deliberately dependency-free (no commander/yargs) -- matching this repository's own established
 * convention (see scripts/gvams-cli.js's own parseArgs()/COMMANDS dispatch table) of a small, hand-rolled
 * dispatcher over adding a new dependency for something this simple. This mirrors gvams-cli.js's shape
 * closely on purpose: this package supersedes it (see this package's README.md), not reinvents its pattern.
 *
 * TODO(cli): once @oram/runtime exists in a usable form, each command module should accept an injected
 *   Runtime instance instead of constructing its own -- keeps commands testable without a real filesystem.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { analyzeCommand } from "./commands/analyze";
import { planCommand } from "./commands/plan";
import { missionsCommand } from "./commands/missions";
import { requestsCommand } from "./commands/requests";
import { executePlanCommand } from "./commands/execute-plan";
import { executeCommand } from "./commands/execute";
import { recommendCommand } from "./commands/recommend";
import { reflectCommand } from "./commands/reflect";
import { historyCommand } from "./commands/history";
import { decideCommand } from "./commands/decide";
import { pullRequestCommand } from "./commands/pull-request";
import { handoffCommand } from "./commands/handoff";
import { engineerCommand } from "./commands/engineer";
import { validateCommand } from "./commands/validate";
import { inspectCommand } from "./commands/inspect";
import { dashboardCommand } from "./commands/dashboard";
import { doctorCommand } from "./commands/doctor";
import { replayCommand } from "./commands/replay";

export type CommandHandler = (args: string[]) => Promise<number>;

/** Reads this package's own version from package.json -- one directory up from both `src/index.ts` (dev, via tsx) and the bundled `dist/bin.js` (built, via esbuild), so the same relative path works either way. Falls back to "unknown" rather than crashing `oram --version` if package.json is ever unreadable. */
function readVersion(): string {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const USAGE = `oram -- Orchestrated Repository Autonomous Manager

Usage:
  oram engineer <repository> Run every ORAM engine end-to-end (the flagship command)
  oram analyze <path>        Run Repository Analysis -> Engineering Knowledge -> Engineering Reasoning
  oram plan <path>           Run the full pipeline through Engineering Planning
  oram missions <path>       Run the full pipeline through Engineering Missions (the Mission Graph)
  oram requests <path>       Run the full pipeline through Implementation Requests
  oram execute-plan <path>   Run the full pipeline through Execution Planning
  oram execute <path>        Run the full pipeline through the Implementation Executor
  oram recommend <path>      Run the full pipeline through the Recommendation Engine
  oram reflect <path>        Run the full pipeline through the Reflection Engine
  oram history <path>        Run the full pipeline and record it into Engineering Memory
  oram decide <path>         Run the full pipeline through the Adaptive Decision Engine
  oram pull-request <path>   Run the full pipeline through the Pull Request Engine (proposal only)
  oram handoff <path>        Demonstrate Runtime artifact handoff (artifacts consumed, never recomputed)
  oram version               Print the oram CLI version
  oram help                  Show this help message`;

async function helpCommand(): Promise<number> {
  console.log(USAGE);
  return 0;
}

async function versionCommand(): Promise<number> {
  console.log(readVersion());
  return 0;
}

/** Command name -> handler. The original fixed v1 command surface (docs/ORAM_SPECIFICATION_v1.md's companion CLI table lives in ORAM_V3_MIGRATION_PLAN.md Section 6), plus `help`/`version` (Sprint 4.5), `missions` (Sprint 5), `requests` (Sprint 6), `execute-plan` (Sprint 7), a real implementation of `execute` (Sprint 8, superseding its earlier stub -- see execute.ts's own header comment), `recommend` (Sprint 11), `reflect` (Sprint 12), `history` (Sprint 13), and `decide` (Sprint 14) -- each one pipeline stage past the last. Sprints 9 (Provider Execution) and 10 (Validation) added no CLI command of their own. Sprint 15 added `engineer`, the flagship orchestration command that runs every engine end-to-end. Sprint 16 added `pull-request` (the Pull Request Engine -- deterministic proposal only, never a real PR). */
export const COMMANDS: Readonly<Record<string, CommandHandler>> = {
  engineer: engineerCommand,
  init: initCommand,
  run: runCommand,
  analyze: analyzeCommand,
  plan: planCommand,
  missions: missionsCommand,
  requests: requestsCommand,
  "execute-plan": executePlanCommand,
  execute: executeCommand,
  recommend: recommendCommand,
  reflect: reflectCommand,
  history: historyCommand,
  decide: decideCommand,
  "pull-request": pullRequestCommand,
  handoff: handoffCommand,
  validate: validateCommand,
  inspect: inspectCommand,
  dashboard: dashboardCommand,
  doctor: doctorCommand,
  replay: replayCommand,
  help: helpCommand,
  version: versionCommand,
};

/** Flag-style spellings that mean the same thing as a subcommand -- resolved before dispatch so COMMANDS stays the single source of truth. */
const FLAG_ALIASES: Readonly<Record<string, string>> = {
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

/**
 * The CLI's single entry point: dispatches argv[0] to its command handler. Returns the process exit code --
 * never calls process.exit() itself, matching scripts/gvams-cli.js's own main()/process.exitCode convention
 * so this module stays testable without spawning a real process.
 * @param argv arguments after the command name (i.e. process.argv.slice(2))
 */
export async function main(argv: string[]): Promise<number> {
  const [rawCommand, ...rest] = argv;

  if (!rawCommand) {
    console.log(USAGE);
    return 0;
  }

  const command = FLAG_ALIASES[rawCommand] ?? rawCommand;
  const handler = COMMANDS[command];

  if (!handler) {
    console.error(`Unknown command: "${rawCommand}"\n`);
    console.log(USAGE);
    return 1;
  }

  return handler(rest);
}
