#!/usr/bin/env node
// GitHub Publisher Adapter v1 -- publisher/github/client.js
//
// The GitHub abstraction layer: the ONLY place in this pipeline that ever invokes git or a GitHub CLI.
// scripts/github-publisher.js (the orchestrator) never shells out directly -- it only calls these four
// functions, one per publishing stage. Every function is dependency-injectable (an execFn/gitBin/ghBin/cwd
// can be supplied) so it can be tested without a real git/gh binary, and every function honors a shared
// `dryRun` flag that simulates the stage deterministically without touching git, the filesystem, or the
// network at all.
const { spawnSync } = require("child_process");

function resolveGitBin(deps) {
  return (deps && deps.gitBin) || process.env.GITHUB_PUBLISH_GIT_BIN || "git";
}
function resolveGhBin(deps) {
  return (deps && deps.ghBin) || process.env.GITHUB_PUBLISH_GH_BIN || "gh";
}
function resolveExecFn(deps) {
  return (deps && deps.execFn) || spawnSync;
}

function runCommand(bin, args, deps) {
  const execFn = resolveExecFn(deps);
  const result = execFn(bin, args, { encoding: "utf8", cwd: (deps && deps.cwd) || process.cwd() });
  const exitCode = result ? result.status : null;
  const stdout = (result && result.stdout) || "";
  const stderr = (result && result.stderr) || "";
  const spawnError = result && result.error ? result.error.message : null;
  const ok = !spawnError && exitCode === 0;
  return { ok, exitCode, stdout, stderr, spawnError, command: `${bin} ${args.join(" ")}` };
}

function failureDetail(label, result) {
  return `${label} failed: ${result.spawnError || result.stderr.trim() || `exit code ${result.exitCode}`}`;
}

/**
 * Publishing stage 1: Create Branch. Real mode runs `git checkout -b <branchName>` from whatever is
 * currently checked out -- pull-request.json does not name a base branch, and this adapter never invents
 * one.
 * @param {{branchName: string}} input
 * @param {{dryRun?: boolean, execFn?: Function, gitBin?: string, cwd?: string}} [deps]
 * @returns {{status: string, details: string, command: (string|null)}}
 */
function createBranch(input, deps) {
  if (deps && deps.dryRun) {
    return { status: "PASS", details: `[dry-run] would run: git checkout -b ${input.branchName}`, command: null };
  }
  const bin = resolveGitBin(deps);
  const result = runCommand(bin, ["checkout", "-b", input.branchName], deps);
  if (result.ok) return { status: "PASS", details: `Created and checked out branch "${input.branchName}".`, command: result.command };
  return { status: "FAIL", details: failureDetail("git checkout -b", result), command: result.command };
}

/**
 * Publishing stage 2: Commit. Real mode stages exactly the files pull-request.json listed as modified
 * (never `git add -A`) and commits with the pull request's own title as the commit message -- reused
 * verbatim, never regenerated.
 * @param {{files: string[], message: string}} input
 * @param {{dryRun?: boolean, execFn?: Function, gitBin?: string, cwd?: string}} [deps]
 * @returns {{status: string, details: string, command: (string|null)}}
 */
function commitChanges(input, deps) {
  if (deps && deps.dryRun) {
    return { status: "PASS", details: `[dry-run] would run: git add -- ${input.files.join(" ")} && git commit -m "${input.message}"`, command: null };
  }
  const bin = resolveGitBin(deps);
  const addResult = runCommand(bin, ["add", "--", ...input.files], deps);
  if (!addResult.ok) return { status: "FAIL", details: failureDetail("git add", addResult), command: addResult.command };
  const commitResult = runCommand(bin, ["commit", "-m", input.message], deps);
  if (commitResult.ok) return { status: "PASS", details: `Committed ${input.files.length} file(s) with message "${input.message}".`, command: commitResult.command };
  return { status: "FAIL", details: failureDetail("git commit", commitResult), command: commitResult.command };
}

/**
 * Publishing stage 3: Push.
 * @param {{branchName: string, remote: string}} input
 * @param {{dryRun?: boolean, execFn?: Function, gitBin?: string, cwd?: string}} [deps]
 * @returns {{status: string, details: string, command: (string|null)}}
 */
function pushBranch(input, deps) {
  if (deps && deps.dryRun) {
    return { status: "PASS", details: `[dry-run] would run: git push -u ${input.remote} ${input.branchName}`, command: null };
  }
  const bin = resolveGitBin(deps);
  const result = runCommand(bin, ["push", "-u", input.remote, input.branchName], deps);
  if (result.ok) return { status: "PASS", details: `Pushed branch "${input.branchName}" to remote "${input.remote}".`, command: result.command };
  return { status: "FAIL", details: failureDetail("git push", result), command: result.command };
}

/**
 * Publishing stage 4: Create Draft Pull Request. Real mode invokes the GitHub CLI (`gh pr create --draft`);
 * title and body are reused verbatim from pull-request.json, never regenerated.
 * @param {{branchName: string, baseBranch: (string|null), title: string, body: string}} input
 * @param {{dryRun?: boolean, execFn?: Function, ghBin?: string, cwd?: string}} [deps]
 * @returns {{status: string, details: string, command: (string|null), pullRequestUrl: (string|null)}}
 */
function createDraftPullRequest(input, deps) {
  if (deps && deps.dryRun) {
    return {
      status: "PASS",
      details: `[dry-run] would run: gh pr create --draft --title "${input.title}" --head ${input.branchName} (no real pull request was created)`,
      command: null,
      pullRequestUrl: null,
    };
  }
  const bin = resolveGhBin(deps);
  const args = ["pr", "create", "--draft", "--title", input.title, "--body", input.body, "--head", input.branchName];
  if (input.baseBranch) args.push("--base", input.baseBranch);
  const result = runCommand(bin, args, deps);
  if (result.ok) {
    const url = result.stdout.trim().split("\n").filter(Boolean).pop() || null;
    return { status: "PASS", details: `Created draft pull request for branch "${input.branchName}".`, command: result.command, pullRequestUrl: url };
  }
  return { status: "FAIL", details: failureDetail("gh pr create", result), command: result.command, pullRequestUrl: null };
}

module.exports = { createBranch, commitChanges, pushBranch, createDraftPullRequest, runCommand, resolveGitBin, resolveGhBin };
