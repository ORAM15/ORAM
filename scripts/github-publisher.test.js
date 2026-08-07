#!/usr/bin/env node
// GitHub Publisher Adapter v1 regression coverage: publisher/github/client.js (the GitHub abstraction
// layer) is exercised both with a fully mocked exec function and, where safe, with real subprocesses (a
// genuine isolated temp git repository for git itself, and a fake "gh" script for the GitHub CLI, mirroring
// the fake-"claude" technique used for the Claude Provider Adapter's own tests). scripts/github-publisher.js
// (the orchestrator) is tested against hand-crafted pull-request.json fixtures, decoupling these tests from
// Pull Request Generator's own internals, plus one true end-to-end run of the full nine-stage chain.
//
// SAFETY: every real-git test below runs inside its own fs.mkdtempSync() directory, `git init`'d fresh --
// none of these tests ever run a real (non-dry-run) git or gh command against this actual repository's own
// working tree or branch.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const orchestratorSource = fs.readFileSync(path.join(repoRoot, "scripts/github-publisher.js"), "utf8");
const clientSource = fs.readFileSync(path.join(repoRoot, "publisher/github/client.js"), "utf8");
const client = require(path.join(repoRoot, "publisher/github/client.js"));

const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");
const decisionEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");
const implRequestEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-request-engine.js"), "utf8");
const implExecutorSource = fs.readFileSync(path.join(repoRoot, "scripts/implementation-executor.js"), "utf8");
const validationEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/validation-engine.js"), "utf8");
const pullRequestGeneratorSource = fs.readFileSync(path.join(repoRoot, "scripts/pull-request-generator.js"), "utf8");

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function pullRequestFixture(overrides) {
  return {
    generatedFrom: {
      implementationRequest: "implementation-request/implementation-request.json",
      execution: "execution/execution.json",
      patchSummary: "execution/patch-summary.json",
      validation: "validation/validation.json",
    },
    requestId: "IR-1-20260102T000000000Z",
    recommendationId: 1,
    title: "autonomous: Extract Test logic into smaller units",
    branchName: "autonomous/extract-test-logic-into-smaller-units-ir-1-20260102t000000000z",
    summary: "Test module has grown complex.\n\nExecuted automatically by the G-VAMS Autonomous Engineering System (provider: stub-deterministic-v1). 2 file(s) modified.",
    modifiedFiles: ["backend/test/a.js", "backend/test/b.js"],
    testsExecuted: 2,
    testsPassed: 2,
    validationStatus: "approved",
    provider: "stub-deterministic-v1",
    approval: { approvedForPR: true, validationScore: 100, rulesPassed: 5, rulesFailed: 0, rulesSkipped: 1, rulesTotal: 6 },
    timestamp: "2026-01-02T00:20:00.000Z",
    ...overrides,
  };
}

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "github-publisher-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "publisher/github"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/github-publisher.js"), orchestratorSource);
  fs.writeFileSync(path.join(dir, "publisher/github/client.js"), clientSource);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), decisionEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-request-engine.js"), implRequestEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/implementation-executor.js"), implExecutorSource);
    fs.writeFileSync(path.join(dir, "scripts/validation-engine.js"), validationEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/pull-request-generator.js"), pullRequestGeneratorSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/github-publisher.js"));
}

function makeFakeExec(failOn, callLog) {
  return (bin, args) => {
    if (callLog) callLog.push({ bin, args: [...args] });
    const sub = args[0];
    if (failOn && sub === failOn) {
      return { status: 1, stdout: "", stderr: `simulated ${sub} failure`, error: null };
    }
    if (sub === "pr") {
      return { status: 0, stdout: "https://github.com/example/repo/pull/123\n", stderr: "", error: null };
    }
    return { status: 0, stdout: "", stderr: "", error: null };
  };
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

// 1. Missing pull-request artifact fails closed with a clear, actionable message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadPullRequest(path.join(dir, "pull-request/pull-request.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/pull-request-generator\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadPullRequest fails closed with an actionable error when pull-request.json is missing");
}

// 2. Malformed (invalid JSON) pull-request.json fails closed.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const file = path.join(dir, "pull-request/pull-request.json");
  writeFile(file, "{ not valid json");
  let threw = null;
  try {
    mod.loadPullRequest(file);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error, got: ${threw && threw.message}`);
  ok("loadPullRequest fails closed on invalid JSON");
}

// 3. Rejected approval (approval.approvedForPR: false) fails closed: nothing is published or written.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const pr = pullRequestFixture({ approval: { approvedForPR: false, validationScore: 40, rulesPassed: 3, rulesFailed: 2, rulesSkipped: 1, rulesTotal: 6 } });
  let threw = null;
  try {
    mod.assertApprovedForPR(pr);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not true/.test(threw.message)) throw new Error(`expected a clear rejected-approval error, got: ${threw && threw.message}`);
  ok("a rejected approval fails closed with a clear, actionable error");
}

// 4. Branch creation failure: stage 1 fails, stages 2-4 are SKIPPED (stop immediately).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const callLog = [];
  const { stages } = mod.runStages(pullRequestFixture(), { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec("checkout", callLog) });
  if (stages[0].status !== "FAIL") throw new Error(`expected Create Branch to FAIL, got: ${stages[0].status}`);
  if (stages.slice(1).some((s) => s.status !== "SKIPPED")) throw new Error(`expected every later stage to be SKIPPED, got: ${JSON.stringify(stages)}`);
  if (callLog.length !== 1) throw new Error(`expected exactly one git invocation (the failing one), got: ${callLog.length}`);
  ok("a branch creation failure stops immediately, skipping every later stage");
}

// 5. Commit failure: both `git add` failing and `git commit` failing (after a successful add) are covered.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const addFailure = mod.runStages(pullRequestFixture(), { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec("add") });
  if (addFailure.stages[0].status !== "PASS" || addFailure.stages[1].status !== "FAIL") throw new Error("expected Create Branch to PASS and Commit to FAIL when git add fails");
  if (addFailure.stages[2].status !== "SKIPPED" || addFailure.stages[3].status !== "SKIPPED") throw new Error("expected Push and Create Draft Pull Request to be SKIPPED after a commit failure");

  const commitFailure = mod.runStages(pullRequestFixture(), { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec("commit") });
  if (commitFailure.stages[1].status !== "FAIL") throw new Error("expected Commit to FAIL when git commit fails");

  ok("a commit failure (at either git add or git commit) stops immediately and skips every later stage");
}

// 6. Push failure: stages 1-2 pass, stage 3 fails, stage 4 is SKIPPED.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const { stages } = mod.runStages(pullRequestFixture(), { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec("push") });
  if (stages[0].status !== "PASS" || stages[1].status !== "PASS") throw new Error("expected Create Branch and Commit to PASS before a push failure");
  if (stages[2].status !== "FAIL") throw new Error(`expected Push to FAIL, got: ${stages[2].status}`);
  if (stages[3].status !== "SKIPPED") throw new Error("expected Create Draft Pull Request to be SKIPPED after a push failure");
  ok("a push failure stops immediately, skipping Create Draft Pull Request");
}

// 7. Draft PR creation failure: stages 1-3 pass, stage 4 fails, and no pull request URL is produced.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const { stages, pullRequestUrl } = mod.runStages(pullRequestFixture(), { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec("pr") });
  if (stages.slice(0, 3).some((s) => s.status !== "PASS")) throw new Error("expected the first three stages to PASS before a draft PR failure");
  if (stages[3].status !== "FAIL") throw new Error(`expected Create Draft Pull Request to FAIL, got: ${stages[3].status}`);
  if (pullRequestUrl !== null) throw new Error("expected no pull request URL when draft PR creation failed");
  ok("a draft pull request creation failure is correctly reported with no pull request URL produced");
}

// 8. Successful publish (mocked GitHub client): every stage passes and the real PR URL from `gh`'s stdout is
//    captured.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const pr = pullRequestFixture();
  const callLog = [];
  const publish = mod.buildPublishRecord(pr, { dryRun: false, remote: "origin", baseBranch: null, execFn: makeFakeExec(null, callLog) });
  if (publish.status !== "published") throw new Error(`expected status "published", got: ${JSON.stringify(publish)}`);
  if (publish.pullRequestUrl !== "https://github.com/example/repo/pull/123") throw new Error(`expected the mocked PR URL to be captured, got: ${publish.pullRequestUrl}`);
  if (publish.branchName !== pr.branchName || publish.title !== pr.title) throw new Error("expected branchName/title to be reused verbatim from pull-request.json, never regenerated");
  if (callLog.length !== 5) throw new Error(`expected exactly 5 git/gh invocations (checkout, add, commit, push, pr create), got: ${callLog.length}`);
  ok("a fully mocked GitHub client publish succeeds through every stage and captures the real PR URL");
}

// 9. CLI: fails closed with no pull-request.json; fails closed (writes nothing) for a rejected approval;
//    succeeds via dry-run for an approved pull request.
{
  const dir = makeFixture();
  const failResult = spawnSync("node", ["scripts/github-publisher.js"], { cwd: dir, encoding: "utf8" });
  if (failResult.status === 0) throw new Error(`expected the CLI to fail closed with no pull-request.json present:\n${failResult.stdout}`);
  if (!/pull-request\.json not found/.test(failResult.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${failResult.stderr}`);

  writeJson(path.join(dir, "pull-request/pull-request.json"), pullRequestFixture({ approval: { approvedForPR: false, validationScore: 0, rulesPassed: 0, rulesFailed: 1, rulesSkipped: 5, rulesTotal: 6 } }));
  const rejectedResult = spawnSync("node", ["scripts/github-publisher.js"], { cwd: dir, encoding: "utf8" });
  if (rejectedResult.status === 0) throw new Error(`expected the CLI to fail closed for a rejected approval:\n${rejectedResult.stdout}`);
  if (fs.existsSync(path.join(dir, "publish/publish.json"))) throw new Error("expected no publish.json to be written for a rejected approval");

  writeJson(path.join(dir, "pull-request/pull-request.json"), pullRequestFixture());
  const dryRunResult = spawnSync("node", ["scripts/github-publisher.js"], { cwd: dir, encoding: "utf8" });
  if (dryRunResult.status !== 0) throw new Error(`expected the CLI to succeed by default (dry-run) for an approved pull request:\n${dryRunResult.stdout}\n${dryRunResult.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(dir, "publish/publish.json"), "utf8"));
  if (written.dryRun !== true || written.status !== "published") throw new Error(`expected a dry-run published record by default, got: ${JSON.stringify(written)}`);

  ok("the CLI fails closed with no input and for a rejected approval, and defaults to a safe dry-run publish otherwise");
}

// 10. Dry-run mode: explicitly proves no real git/gh invocation ever happens -- the injected execFn (which
//     would throw if called) is never invoked, and no pull request URL is fabricated.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const explodingExec = () => {
    throw new Error("execFn should never be called in dry-run mode");
  };
  const publish = mod.buildPublishRecord(pullRequestFixture(), { dryRun: true, remote: "origin", baseBranch: null, execFn: explodingExec });
  if (publish.status !== "published") throw new Error(`expected dry-run to report "published" (simulated success), got: ${publish.status}`);
  if (publish.pullRequestUrl !== null) throw new Error("expected dry-run to never fabricate a pull request URL");
  if (!publish.stages.every((stage) => /\[dry-run\]/.test(stage.details))) throw new Error("expected every stage's details to be explicitly marked [dry-run]");
  ok("dry-run mode never invokes the injected exec function and never fabricates a pull request URL");
}

// 11. Mocked GitHub client (client-module level): each of the four publisher/github/client.js functions is
//     exercised directly against a fully mocked execFn, independent of the orchestrator.
{
  const callLog = [];
  const deps = { dryRun: false, execFn: makeFakeExec(null, callLog), cwd: "/does/not/matter" };
  const branchResult = client.createBranch({ branchName: "autonomous/x" }, deps);
  const commitResult = client.commitChanges({ files: ["a.js", "b.js"], message: "autonomous: x" }, deps);
  const pushResult = client.pushBranch({ branchName: "autonomous/x", remote: "origin" }, deps);
  const prResult = client.createDraftPullRequest({ branchName: "autonomous/x", baseBranch: null, title: "autonomous: x", body: "summary" }, deps);
  if (branchResult.status !== "PASS" || commitResult.status !== "PASS" || pushResult.status !== "PASS" || prResult.status !== "PASS") {
    throw new Error(`expected every mocked client function to PASS, got: ${JSON.stringify({ branchResult, commitResult, pushResult, prResult })}`);
  }
  if (prResult.pullRequestUrl !== "https://github.com/example/repo/pull/123") throw new Error("expected the mocked gh pr create stdout to be parsed into a pull request URL");
  if (callLog.length !== 5) throw new Error(`expected 5 invocations (checkout, add, commit, push, pr), got: ${callLog.length}`);
  if (callLog[0].args[0] !== "checkout" || callLog[1].args[0] !== "add" || callLog[2].args[0] !== "commit" || callLog[3].args[0] !== "push" || callLog[4].args[0] !== "pr") {
    throw new Error(`expected the correct git/gh subcommands to be invoked in order, got: ${JSON.stringify(callLog.map((c) => c.args[0]))}`);
  }
  ok("every publisher/github/client.js function works correctly against a fully mocked GitHub client");
}

// 12. Real git (no mocking): an isolated, freshly-initialized temp git repository proves Create Branch,
//     Commit, and Push actually work as real subprocesses -- never touching this actual repository.
{
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-publisher-realgit-work-"));
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-publisher-realgit-remote-"));
  spawnSync("git", ["init", "--bare"], { cwd: remoteDir, encoding: "utf8" });
  runGit(workDir, ["init"]);
  runGit(workDir, ["config", "user.email", "autonomous@example.invalid"]);
  runGit(workDir, ["config", "user.name", "G-VAMS Autonomous Engineering System"]);
  runGit(workDir, ["remote", "add", "origin", remoteDir]);
  writeFile(path.join(workDir, "a.js"), "// initial\n");
  runGit(workDir, ["add", "a.js"]);
  runGit(workDir, ["commit", "-m", "initial commit"]);
  runGit(workDir, ["branch", "-M", "main"]);

  writeFile(path.join(workDir, "a.js"), "// modified by the autonomous pipeline\n");

  const deps = { dryRun: false, cwd: workDir };
  const branchResult = client.createBranch({ branchName: "autonomous/real-git-test" }, deps);
  if (branchResult.status !== "PASS") throw new Error(`expected a real git checkout -b to succeed, got: ${JSON.stringify(branchResult)}`);
  const commitResult = client.commitChanges({ files: ["a.js"], message: "autonomous: real git test" }, deps);
  if (commitResult.status !== "PASS") throw new Error(`expected a real git add + commit to succeed, got: ${JSON.stringify(commitResult)}`);
  const pushResult = client.pushBranch({ branchName: "autonomous/real-git-test", remote: "origin" }, deps);
  if (pushResult.status !== "PASS") throw new Error(`expected a real git push to the local bare remote to succeed, got: ${JSON.stringify(pushResult)}`);

  const remoteBranches = spawnSync("git", ["branch"], { cwd: remoteDir, encoding: "utf8" }).stdout;
  if (!remoteBranches.includes("autonomous/real-git-test")) throw new Error(`expected the pushed branch to actually exist on the remote, got branches:\n${remoteBranches}`);

  ok("real git subprocess calls (checkout -b, add, commit, push) succeed end to end against an isolated temp repository and remote");
}

// 13. Draft PR creation via a real subprocess: a fake "gh" script (a plain Node script, mirroring the fake-
//     "claude" technique) proves the real spawnSync/argv/stdout path, both for success and failure.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "github-publisher-fakegh-"));
  writeFile(
    path.join(dir, "fake-gh-success.js"),
    `
      const args = process.argv.slice(2);
      if (args[0] === "pr" && args[1] === "create") {
        console.log("https://github.com/example/repo/pull/456");
        process.exit(0);
      }
      process.exit(1);
    `
  );
  writeFile(
    path.join(dir, "fake-gh-failure.js"),
    `
      process.stderr.write("authentication required\\n");
      process.exit(1);
    `
  );

  const successResult = client.createDraftPullRequest(
    { branchName: "autonomous/x", baseBranch: null, title: "autonomous: x", body: "summary" },
    { dryRun: false, ghBin: process.execPath, execFn: (bin, args, options) => spawnSync(bin, [path.join(dir, "fake-gh-success.js"), ...args], options) }
  );
  if (successResult.status !== "PASS" || successResult.pullRequestUrl !== "https://github.com/example/repo/pull/456") {
    throw new Error(`expected a real subprocess success with the fake gh's real stdout URL, got: ${JSON.stringify(successResult)}`);
  }

  const failureResult = client.createDraftPullRequest(
    { branchName: "autonomous/x", baseBranch: null, title: "autonomous: x", body: "summary" },
    { dryRun: false, ghBin: process.execPath, execFn: (bin, args, options) => spawnSync(bin, [path.join(dir, "fake-gh-failure.js"), ...args], options) }
  );
  if (failureResult.status !== "FAIL" || !/authentication required/.test(failureResult.details)) {
    throw new Error(`expected a real subprocess failure with the fake gh's real stderr captured, got: ${JSON.stringify(failureResult)}`);
  }

  ok("Create Draft Pull Request correctly handles a real subprocess round trip, both success and failure, via a fake gh script");
}

// 14. End-to-end execution: the real nine-stage chain (repository-intelligence.js -> engineering-
//     knowledge.js -> recommendation-engine.js -> decision-engine.js -> implementation-request-engine.js ->
//     implementation-executor.js -> validation-engine.js -> pull-request-generator.js ->
//     github-publisher.js), using the real upstream sources and a safe dry-run for the final stage, produces
//     a valid, internally-consistent publish record whenever the real pipeline actually approved a change.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js", "implementation-request-engine.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }
  const executorRun = spawnSync("node", ["scripts/implementation-executor.js"], { cwd: dir, encoding: "utf8", env: { ...process.env, EXECUTION_APPROVED: "true" } });
  if (executorRun.status !== 0) throw new Error(`implementation-executor.js run failed:\n${executorRun.stdout}\n${executorRun.stderr}`);
  spawnSync("node", ["scripts/validation-engine.js"], { cwd: dir, encoding: "utf8" });
  const prGenRun = spawnSync("node", ["scripts/pull-request-generator.js"], { cwd: dir, encoding: "utf8" });

  if (prGenRun.status === 0) {
    const publishRun = spawnSync("node", ["scripts/github-publisher.js"], { cwd: dir, encoding: "utf8" });
    if (publishRun.status !== 0) throw new Error(`expected the CLI to succeed (default dry-run) for a real approved pull request:\n${publishRun.stdout}\n${publishRun.stderr}`);
    const jsonPath = path.join(dir, "publish", "publish.json");
    const mdPath = path.join(dir, "publish", "publish.md");
    if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error("expected both publish.json and publish.md to be produced by the real end-to-end chain");
    const publish = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const pr = JSON.parse(fs.readFileSync(path.join(dir, "pull-request", "pull-request.json"), "utf8"));
    if (publish.branchName !== pr.branchName || publish.title !== pr.title) throw new Error("expected the publish record to reuse the real pull request's title/branch verbatim");
    if (publish.dryRun !== true || publish.status !== "published") throw new Error(`expected a safe dry-run published record by default, got: ${JSON.stringify(publish)}`);
  } else {
    const publishRun = spawnSync("node", ["scripts/github-publisher.js"], { cwd: dir, encoding: "utf8" });
    if (publishRun.status === 0) throw new Error("expected the CLI to fail closed when pull-request.json was never generated");
  }

  ok("the real nine-stage chain produces a valid, safely-dry-run publish record end to end whenever the real pipeline approved a change");
}

console.log("All GitHub Publisher Adapter v1 regression scenarios passed.");
