#!/usr/bin/env node
// GitHub Publisher Adapter v1
//
// An Adapter, not another pipeline engine: its only job is publishing an already-generated, already-
// approved pull request (pull-request/pull-request.json) through four deterministic stages -- Create
// Branch, Commit, Push, Create Draft Pull Request. It never regenerates the title, summary, branch name, or
// approval decision; everything is reused verbatim from pull-request.json. It never calls git or a GitHub
// API directly -- every git/gh invocation is isolated inside publisher/github/client.js (the GitHub
// abstraction layer), resolved here through the same provider-neutral registry pattern used for Provider
// Adapters, so a future non-GitHub publisher could be added without changing this file's architecture.
//
// Run with:   node scripts/github-publisher.js
// Input path defaults to pull-request/pull-request.json; override with PULL_REQUEST_PATH.
// Output dir defaults to `publish/` at the repository root; override with PUBLISH_OUTPUT_DIR.
//
// SAFETY DEFAULT: this adapter's real mode genuinely mutates git (creates a branch, commits, pushes to a
// remote) and opens a real draft pull request -- hard-to-reverse, visible-to-others actions. It therefore
// defaults to DRY RUN (every stage simulated, nothing touched) unless GITHUB_PUBLISH_DRY_RUN is set to the
// exact string "false". Other overrides: GITHUB_PUBLISH_REMOTE (default "origin"),
// GITHUB_PUBLISH_BASE_BRANCH (default: none -- branches from whatever is currently checked out),
// GITHUB_PUBLISH_GIT_BIN / GITHUB_PUBLISH_GH_BIN (default "git" / "gh"), GITHUB_PUBLISHER (default
// "github-cli-v1", the only publisher implemented in v1).
//
// If any stage fails, publishing stops immediately -- later stages are recorded as SKIPPED, never attempted.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pullRequestPath = path.resolve(root, process.env.PULL_REQUEST_PATH || "pull-request/pull-request.json");
const outputDir = path.resolve(root, process.env.PUBLISH_OUTPUT_DIR || "publish");

const DEFAULT_PUBLISHER = "github-cli-v1";
const publisherName = process.env.GITHUB_PUBLISHER || DEFAULT_PUBLISHER;
const DRY_RUN = process.env.GITHUB_PUBLISH_DRY_RUN !== "false";
const REMOTE = process.env.GITHUB_PUBLISH_REMOTE || "origin";
const BASE_BRANCH = process.env.GITHUB_PUBLISH_BASE_BRANCH || null;

const PUBLISHER_LOADERS = {
  "github-cli-v1": () => require("../publisher/github/client"),
};

/**
 * Resolves a publisher name to its GitHub-abstraction-layer client module. Fails closed on an unknown
 * publisher.
 * @param {string} name
 * @returns {object} a client module exposing createBranch/commitChanges/pushBranch/createDraftPullRequest
 */
function resolvePublisherClient(name) {
  const loader = PUBLISHER_LOADERS[name];
  if (!loader) {
    throw new Error(`Unknown publisher "${name}". GitHub Publisher Adapter v1 only implements: ${Object.keys(PUBLISHER_LOADERS).join(", ")}.`);
  }
  return loader();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and parses pull-request.json. Fails closed with a clear, actionable error if the file is missing or
 * not valid JSON. Never writes to this file -- the publisher only ever reads it.
 * @param {string} file absolute path to pull-request.json
 * @returns {object} the parsed pull request document
 */
function loadPullRequest(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`pull-request.json not found at ${path.relative(root, file)}. Run \`node scripts/pull-request-generator.js\` first (or set PULL_REQUEST_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`pull-request.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * The validation gate: refuses to publish anything unless pull-request.json's own approval.approvedForPR is
 * exactly true. Fails closed with an actionable message -- nothing is published, nothing is written.
 * @param {{approval: {approvedForPR: boolean}}} pr
 */
function assertApprovedForPR(pr) {
  const approvedForPR = pr.approval && pr.approval.approvedForPR;
  if (approvedForPR !== true) {
    throw new Error(
      `GitHub Publisher Adapter refuses to publish: pull-request.json's approval.approvedForPR is not true (got: ${JSON.stringify(approvedForPR)}). Review validation.md and pull-request.md, resolve the underlying issue, and re-run the pipeline.`
    );
  }
}

/**
 * Runs all four publishing stages, in order, against an already-loaded pull request, stopping immediately
 * (recording every remaining stage as SKIPPED) the moment one stage fails. Title, summary, and branch name
 * are all reused verbatim from pull-request.json -- nothing here is regenerated.
 * @param {object} pr parsed pull-request.json
 * @param {{dryRun: boolean, remote: string, baseBranch: (string|null), execFn?: Function, gitBin?: string, ghBin?: string, cwd?: string, publisherName?: string}} options
 * @returns {{stages: {name: string, status: string, details: string}[], pullRequestUrl: (string|null)}}
 */
function runStages(pr, options) {
  const client = resolvePublisherClient(options.publisherName || publisherName);
  const deps = { dryRun: options.dryRun, execFn: options.execFn, gitBin: options.gitBin, ghBin: options.ghBin, cwd: options.cwd };

  const stageDefs = [
    { name: "Create Branch", run: () => client.createBranch({ branchName: pr.branchName }, deps) },
    { name: "Commit", run: () => client.commitChanges({ files: pr.modifiedFiles, message: pr.title }, deps) },
    { name: "Push", run: () => client.pushBranch({ branchName: pr.branchName, remote: options.remote }, deps) },
    {
      name: "Create Draft Pull Request",
      run: () => client.createDraftPullRequest({ branchName: pr.branchName, baseBranch: options.baseBranch, title: pr.title, body: pr.summary }, deps),
    },
  ];

  const stages = [];
  let stopped = false;
  let pullRequestUrl = null;
  for (const stageDef of stageDefs) {
    if (stopped) {
      stages.push({ name: stageDef.name, status: "SKIPPED", details: "Not attempted because an earlier stage failed." });
      continue;
    }
    const result = stageDef.run();
    stages.push({ name: stageDef.name, status: result.status, details: result.details });
    if (result.pullRequestUrl) pullRequestUrl = result.pullRequestUrl;
    if (result.status !== "PASS") stopped = true;
  }
  return { stages, pullRequestUrl };
}

/**
 * Builds the complete publish record. This is the single entry point both the CLI and any other caller
 * (e.g. tests) should use. Callers must have already checked assertApprovedForPR().
 * @param {object} pr parsed pull-request.json
 * @param {{dryRun: boolean, remote: string, baseBranch: (string|null), execFn?: Function, gitBin?: string, ghBin?: string, cwd?: string, publisherName?: string}} options
 * @returns {object} matching publish.json's shape
 */
function buildPublishRecord(pr, options) {
  const { stages, pullRequestUrl } = runStages(pr, options);
  const allPassed = stages.every((stage) => stage.status === "PASS");
  return {
    generatedFrom: { pullRequest: path.relative(root, pullRequestPath).split(path.sep).join("/") },
    publisher: options.publisherName || publisherName,
    status: allPassed ? "published" : "failed",
    dryRun: Boolean(options.dryRun),
    branchName: pr.branchName,
    title: pr.title,
    remote: options.remote,
    stages,
    pullRequestUrl,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Report Generator
// ---------------------------------------------------------------------------------------------------------

function buildNextStepText(publish) {
  if (publish.status === "published") {
    return publish.dryRun
      ? "This was a dry run: nothing was actually committed, pushed, or opened. Re-run with GITHUB_PUBLISH_DRY_RUN=false to publish for real."
      : `The draft pull request is open${publish.pullRequestUrl ? ` at ${publish.pullRequestUrl}` : ""}. Review it on GitHub before marking it ready for review.`;
  }
  return "Publishing failed. Review the failed stage's details above, resolve the underlying issue, and re-run this engine.";
}

/**
 * Renders the human-readable Markdown report for a given publish record.
 * @param {object} publish result of buildPublishRecord()
 * @returns {string}
 */
function renderMarkdown(publish) {
  const lines = [];
  lines.push("# GitHub Publisher Report", "");
  lines.push(
    "Generated by `scripts/github-publisher.js` -- deterministic. Every git/GitHub operation is isolated inside `publisher/github/client.js`; this report only records what that abstraction layer actually did (or, in dry-run mode, would have done).",
    ""
  );
  lines.push(`Source: \`${publish.generatedFrom.pullRequest}\``, "");
  lines.push(`Timestamp: ${publish.timestamp}`, "");

  lines.push("## Status", "");
  lines.push(`**${publish.status}**`, "");

  lines.push("## Dry Run", "");
  lines.push(publish.dryRun ? "**Yes** -- no real git/GitHub operation was performed." : "**No** -- real git/GitHub operations were performed.", "");

  lines.push("## Branch", "");
  lines.push(`\`${publish.branchName}\` (remote: \`${publish.remote}\`)`, "");

  lines.push("## Title", "");
  lines.push(publish.title, "");

  lines.push("## Stages", "");
  lines.push("| # | Stage | Status | Details |", "| ---: | --- | :---: | --- |");
  publish.stages.forEach((stage, index) => lines.push(`| ${index + 1} | ${stage.name} | ${stage.status} | ${stage.details} |`));
  lines.push("");

  lines.push("## Pull Request URL", "");
  lines.push(publish.pullRequestUrl || "None", "");

  lines.push("## Next Step", "");
  lines.push(buildNextStepText(publish), "");

  return lines.join("\n");
}

/**
 * Writes publish.json and publish.md into the output directory (created if needed), returning their
 * absolute paths.
 * @param {object} publish
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(publish) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "publish.json");
  const mdPath = path.join(outputDir, "publish.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(publish, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(publish)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const pr = loadPullRequest(pullRequestPath);
  assertApprovedForPR(pr);

  const publish = buildPublishRecord(pr, { dryRun: DRY_RUN, remote: REMOTE, baseBranch: BASE_BRANCH });
  const { jsonPath, mdPath } = writeOutputs(publish);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
  if (publish.status !== "published") process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  root,
  pullRequestPath,
  outputDir,
  DEFAULT_PUBLISHER,
  publisherName,
  DRY_RUN,
  REMOTE,
  BASE_BRANCH,
  resolvePublisherClient,
  loadPullRequest,
  assertApprovedForPR,
  runStages,
  buildPublishRecord,
  renderMarkdown,
  writeOutputs,
};
