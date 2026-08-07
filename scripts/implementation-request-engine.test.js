#!/usr/bin/env node
// Implementation Request Engine v1 regression coverage: every deterministic derivation produces the
// expected, reproducible result against hand-crafted decision.json/recommendations.json fixtures (this
// engine's only contracts are those two JSON shapes, so tests are decoupled from Decision Engine's and
// Recommendation Engine's own internals), plus one true end-to-end run proving the real five-stage chain
// actually works together.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/implementation-request-engine.js"), "utf8");
const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");
const decisionEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function decisionFixture(overrides) {
  return {
    generatedFrom: "recommendations/recommendations.json",
    sourceProjectName: "Fixture Project",
    sourceTimestamp: "2026-01-01T00:00:00.000Z",
    decisionFormula: "test formula",
    candidatesEvaluated: 1,
    timestamp: "2026-01-02T00:00:00.000Z",
    selectedRecommendationId: 1,
    selectedTitle: "Extract Test logic into smaller units",
    decisionConfidence: 90,
    decisionReasons: ["test reason"],
    estimatedImpact: "High",
    estimatedRisk: "Low",
    estimatedImplementationSize: "Small",
    candidateScores: [{ id: 1, title: "Extract Test logic into smaller units", decisionScore: 90, priorityScore: 90, confidence: 90, estimatedImpact: "High", estimatedRisk: "Low", estimatedImplementationSize: "Small", selected: true }],
    ...overrides,
  };
}

const EMPTY_DECISION_FIXTURE = decisionFixture({
  candidatesEvaluated: 0,
  selectedRecommendationId: null,
  selectedTitle: null,
  decisionConfidence: 0,
  decisionReasons: ["No recommendations were present in recommendations.json; there is nothing to decide."],
  estimatedImpact: "Not applicable",
  estimatedRisk: "Not applicable",
  estimatedImplementationSize: "Not applicable",
  candidateScores: [],
});

function recommendationsFixture(overrides) {
  return {
    sourceProjectName: "Fixture Project",
    timestamp: "2026-01-01T00:00:00.000Z",
    recommendations: [
      {
        id: 1,
        ruleKey: "extract-complex-logic",
        title: "Extract Test logic into smaller units",
        description: "Test module has grown complex and carries maintenance risk. Extracting focused units would reduce complexity without changing behavior.",
        reason: ["Test has High complexity", "Medium maintenance risk", "Touches 10 related file(s)"],
        affectedModules: ["Test"],
        affectedFiles: ["backend/test/a.js", "backend/test/b.js"],
        estimatedImplementationSize: "Small",
        estimatedRisk: "Low",
        estimatedImpact: "High",
        confidence: 90,
        priorityScore: 90,
      },
    ],
    ...overrides,
  };
}

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "implementation-request-engine-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/implementation-request-engine.js"), source);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
    fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), decisionEngineSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/implementation-request-engine.js"));
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Missing input (decision.json) fails closed with a clear, actionable message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadDecision(path.join(dir, "decision/decision.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/decision-engine\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadDecision fails closed with an actionable error when decision.json is missing");
}

// 2. Invalid JSON fails closed, for both decision.json and recommendations.json.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  writeFile(path.join(dir, "decision/decision.json"), "{ not valid json");
  let threw = null;
  try {
    mod.loadDecision(path.join(dir, "decision/decision.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error for decision.json, got: ${threw && threw.message}`);

  writeFile(path.join(dir, "recommendations/recommendations.json"), "{ not valid json");
  let threw2 = null;
  try {
    mod.loadRecommendations(path.join(dir, "recommendations/recommendations.json"));
  } catch (error) {
    threw2 = error;
  }
  if (!threw2 || !/not valid JSON/.test(threw2.message)) throw new Error(`expected a clear invalid-JSON error for recommendations.json, got: ${threw2 && threw2.message}`);
  ok("loadDecision and loadRecommendations both fail closed on invalid JSON");
}

// 3. Empty decision (decision.json selected nothing) is handled gracefully: no request is fabricated, and
//    this never requires recommendations.json to exist or be read at all.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = mod.buildImplementationRequest(EMPTY_DECISION_FIXTURE, null);
  if (request.requestId !== null || request.recommendationId !== null || request.title !== null || request.goal !== null) {
    throw new Error(`expected every selection-derived field to be null for an empty decision, got: ${JSON.stringify(request)}`);
  }
  if (request.affectedModules.length !== 0 || request.affectedFiles.length !== 0) throw new Error("expected empty affectedModules/affectedFiles for an empty decision");
  if (!/No decision was available/.test(request.nextStep)) throw new Error("expected nextStep to explain that no decision was available");
  const markdown = mod.renderMarkdown(request);
  if (!/None\. decision\.json contained no selection/.test(markdown)) throw new Error("expected markdown to honestly report the empty-decision case");
  ok("an empty decision is handled gracefully without fabricating a request, and never requires recommendations.json");
}

// 4. Valid decision (happy path): every field is correctly derived and grounded in the two source fixtures.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture();
  const recommendationsDoc = recommendationsFixture();
  const request = mod.buildImplementationRequest(decision, recommendationsDoc);

  if (request.recommendationId !== 1) throw new Error(`expected recommendationId 1, got ${request.recommendationId}`);
  if (request.title !== decision.selectedTitle) throw new Error("expected title to match decision.json's selectedTitle");
  if (request.goal !== recommendationsDoc.recommendations[0].description) throw new Error("expected goal to be the selected recommendation's own description, not invented text");
  if (JSON.stringify(request.affectedModules) !== JSON.stringify(["Test"])) throw new Error(`expected affectedModules ["Test"], got ${JSON.stringify(request.affectedModules)}`);
  if (JSON.stringify(request.affectedFiles) !== JSON.stringify(["backend/test/a.js", "backend/test/b.js"])) throw new Error(`expected the exact affectedFiles from recommendations.json, got ${JSON.stringify(request.affectedFiles)}`);
  if (request.acceptanceCriteria.length !== 2 + recommendationsDoc.recommendations[0].reason.length) throw new Error("expected acceptance criteria to include the fixed baseline plus one entry per reason");
  for (const reason of recommendationsDoc.recommendations[0].reason) {
    if (!request.acceptanceCriteria.some((entry) => entry.includes(reason))) throw new Error(`expected an acceptance criterion tracing back to reason "${reason}"`);
  }
  ok("a valid decision produces a fully-grounded implementation request with correct fields");
}

// 5. Markdown generation includes every required section, for both the happy path and the empty-decision
//    path, and renders the validation checklist as checkboxes.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = mod.buildImplementationRequest(decisionFixture(), recommendationsFixture());
  const markdown = mod.renderMarkdown(request);
  for (const heading of [
    "# Implementation Request Report",
    "## Selected Recommendation",
    "## Goal",
    "## Affected Modules",
    "## Affected Files",
    "## Implementation Constraints",
    "## Acceptance Criteria",
    "## Validation Checklist",
    "## Execution Policy",
    "## Next Step",
  ]) {
    if (!markdown.includes(heading)) throw new Error(`expected markdown to include "${heading}"`);
  }
  if (!markdown.includes("- [ ] Run all relevant automated tests")) throw new Error("expected the validation checklist to render as markdown checkboxes");
  if (!markdown.includes("| allowBreakingChanges | false |")) throw new Error("expected the execution policy table to render each policy value");
  ok("renderMarkdown includes every required section and renders the checklist/policy correctly");
}

// 6. Output structure: implementation-request.json contains every field required by the spec, verbatim.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const request = mod.buildImplementationRequest(decisionFixture(), recommendationsFixture());
  for (const key of [
    "requestId", "sourceDecisionId", "recommendationId", "title", "goal", "affectedModules", "affectedFiles",
    "implementationConstraints", "acceptanceCriteria", "validationChecklist", "executionPolicy", "nextStep", "timestamp",
  ]) {
    if (!(key in request)) throw new Error(`implementation request is missing required field: ${key}`);
  }
  if (JSON.stringify(request.executionPolicy) !== JSON.stringify(mod.EXECUTION_POLICY_DEFAULTS)) {
    throw new Error(`expected executionPolicy to exactly match the documented defaults, got: ${JSON.stringify(request.executionPolicy)}`);
  }
  ok("implementation-request.json contains every field required by the spec, with the documented execution policy defaults");
}

// 7. CLI: fails closed with no decision.json, and succeeds end-to-end with valid inputs present.
{
  const dir = makeFixture();
  const failResult = spawnSync("node", ["scripts/implementation-request-engine.js"], { cwd: dir, encoding: "utf8" });
  if (failResult.status === 0) throw new Error(`expected the CLI to fail closed with no decision.json present:\n${failResult.stdout}`);
  if (!/decision\.json not found/.test(failResult.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${failResult.stderr}`);

  writeJson(path.join(dir, "decision/decision.json"), decisionFixture());
  writeJson(path.join(dir, "recommendations/recommendations.json"), recommendationsFixture());
  const successResult = spawnSync("node", ["scripts/implementation-request-engine.js"], { cwd: dir, encoding: "utf8" });
  if (successResult.status !== 0) throw new Error(`expected the CLI to succeed with valid inputs:\n${successResult.stdout}\n${successResult.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(dir, "implementation-request/implementation-request.json"), "utf8"));
  if (written.recommendationId !== 1) throw new Error("expected the CLI-written file to reflect the fixture decision");
  ok("the CLI fails closed with no input and succeeds end-to-end with valid inputs present");
}

// 8. Environment overrides: DECISION_PATH, RECOMMENDATIONS_PATH, and IMPLEMENTATION_REQUEST_OUTPUT_DIR all
//    override the default locations.
{
  const dir = makeFixture();
  const customDecision = path.join(dir, "custom-decision/decision.json");
  const customRecommendations = path.join(dir, "custom-recs/recommendations.json");
  writeJson(customDecision, decisionFixture());
  writeJson(customRecommendations, recommendationsFixture());
  const previous = {
    DECISION_PATH: process.env.DECISION_PATH,
    RECOMMENDATIONS_PATH: process.env.RECOMMENDATIONS_PATH,
    IMPLEMENTATION_REQUEST_OUTPUT_DIR: process.env.IMPLEMENTATION_REQUEST_OUTPUT_DIR,
  };
  process.env.DECISION_PATH = "custom-decision/decision.json";
  process.env.RECOMMENDATIONS_PATH = "custom-recs/recommendations.json";
  process.env.IMPLEMENTATION_REQUEST_OUTPUT_DIR = "custom-output/nested";
  try {
    const mod = requireFixture(dir);
    if (mod.decisionPath !== customDecision) throw new Error(`expected overridden decision path, got: ${mod.decisionPath}`);
    if (mod.recommendationsPath !== customRecommendations) throw new Error(`expected overridden recommendations path, got: ${mod.recommendationsPath}`);
    if (mod.outputDir !== path.join(dir, "custom-output", "nested")) throw new Error(`expected overridden output directory, got: ${mod.outputDir}`);
    const decision = mod.loadDecision(mod.decisionPath);
    const recommendationsDoc = mod.loadRecommendations(mod.recommendationsPath);
    const request = mod.buildImplementationRequest(decision, recommendationsDoc);
    const { jsonPath, mdPath } = mod.writeOutputs(request);
    if (path.basename(jsonPath) !== "implementation-request.json") throw new Error(`expected output named implementation-request.json, got ${jsonPath}`);
    if (path.basename(mdPath) !== "implementation-request.md") throw new Error(`expected output named implementation-request.md, got ${mdPath}`);
    if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error("expected both output files to exist under the overridden output directory");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  ok("DECISION_PATH, RECOMMENDATIONS_PATH, and IMPLEMENTATION_REQUEST_OUTPUT_DIR override the default input/output locations");
}

// 9. End-to-end execution: the real five-stage chain (repository-intelligence.js -> engineering-
//    knowledge.js -> recommendation-engine.js -> decision-engine.js -> implementation-request-engine.js),
//    using the real upstream sources, produces valid, internally-consistent implementation-request output.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js", "implementation-request-engine.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }
  const jsonPath = path.join(dir, "implementation-request", "implementation-request.json");
  const mdPath = path.join(dir, "implementation-request", "implementation-request.md");
  if (!fs.existsSync(jsonPath)) throw new Error("expected implementation-request.json to be produced by the real end-to-end chain");
  if (!fs.existsSync(mdPath)) throw new Error("expected implementation-request.md to be produced by the real end-to-end chain");
  const request = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const decision = JSON.parse(fs.readFileSync(path.join(dir, "decision", "decision.json"), "utf8"));
  if (request.recommendationId !== decision.selectedRecommendationId) throw new Error("expected the implementation request to reflect the real decision's actual selection");
  ok("the real five-stage chain produces valid, internally-consistent implementation-request output");
}

// 10. Fail-closed: recommendations.json is missing even though decision.json selected a recommendation.
{
  const dir = makeFixture();
  writeJson(path.join(dir, "decision/decision.json"), decisionFixture());
  const result = spawnSync("node", ["scripts/implementation-request-engine.js"], { cwd: dir, encoding: "utf8" });
  if (result.status === 0) throw new Error(`expected the CLI to fail closed when recommendations.json is missing:\n${result.stdout}`);
  if (!/recommendations\.json not found/.test(result.stderr)) throw new Error(`expected a clear missing-recommendations error, got:\n${result.stderr}`);
  ok("fails closed when decision.json selected a recommendation but recommendations.json is missing");
}

// 11. Fail-closed: decision.json's selected id no longer exists in recommendations.json (contradictory or
//     stale pipeline state) -- must never fabricate affected modules/files.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture({ selectedRecommendationId: 999, selectedTitle: "A recommendation that no longer exists" });
  let threw = null;
  try {
    mod.buildImplementationRequest(decision, recommendationsFixture());
  } catch (error) {
    threw = error;
  }
  if (!threw || !/does not contain a recommendation with that id/.test(threw.message)) {
    throw new Error(`expected a clear contradictory-state error, got: ${threw && threw.message}`);
  }
  ok("fails closed when decision.json's selected id is no longer present in recommendations.json");
}

// 12. requestId is derived deterministically from decision.json's own content alone (id + decision
//     timestamp), so it is stable across repeated runs regardless of when this engine itself executes.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture();
  const recommendationsDoc = recommendationsFixture();
  const first = mod.buildImplementationRequest(decision, recommendationsDoc);
  const second = mod.buildImplementationRequest(decision, recommendationsDoc);
  if (first.requestId !== second.requestId) throw new Error(`expected requestId to be stable across repeated runs of the same input, got "${first.requestId}" then "${second.requestId}"`);
  if (first.requestId !== "IR-1-20260102T000000000Z") throw new Error(`expected the documented requestId construction, got: ${first.requestId}`);
  ok("requestId is deterministic, derived only from decision.json's own content");
}

// 13. Implementation constraints and validation checklist reflect estimatedRisk/estimatedImplementationSize
//     (extra constraints only appear when actually warranted by decision.json's own fields).
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const lowRiskSmall = mod.buildImplementationConstraints({ estimatedRisk: "Low", estimatedImplementationSize: "Small" });
  if (lowRiskSmall.length !== 3) throw new Error(`expected only the fixed baseline (3 constraints) for Low risk + Small size, got ${lowRiskSmall.length}`);
  const highRiskLarge = mod.buildImplementationConstraints({ estimatedRisk: "High", estimatedImplementationSize: "Large" });
  if (highRiskLarge.length !== 5) throw new Error(`expected the baseline plus two extra constraints for High risk + Large size, got ${highRiskLarge.length}`);
  if (!highRiskLarge.some((entry) => /High estimated risk/.test(entry))) throw new Error("expected an extra constraint for High estimated risk");
  if (!highRiskLarge.some((entry) => /Large estimated change/.test(entry))) throw new Error("expected an extra constraint for Large estimated implementation size");

  const checklist = mod.buildValidationChecklist();
  if (!checklist.some((entry) => /human review and approval/.test(entry))) throw new Error("expected the validation checklist to require human approval, matching the fixed execution policy default");
  ok("implementation constraints and the validation checklist correctly reflect risk/size and the fixed execution policy");
}

// 14. Fail-closed: recommendations.json's timestamp does not match decision.sourceTimestamp -- decision.json
//     was generated from a different (older or newer) recommendations.json artifact than the one now on
//     disk, even though the selected id still happens to exist in it.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture();
  const recommendationsDoc = recommendationsFixture({ timestamp: "2026-01-01T12:00:00.000Z" });
  let threw = null;
  try {
    mod.buildImplementationRequest(decision, recommendationsDoc);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/decision\.json was generated from a different recommendations\.json artifact/.test(threw.message)) {
    throw new Error(`expected a clear artifact-mismatch error for a timestamp mismatch, got: ${threw && threw.message}`);
  }
  ok("fails closed when recommendations.json's timestamp does not match decision.sourceTimestamp");
}

// 15. Fail-closed: recommendations.json's sourceProjectName does not match decision.sourceProjectName.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture();
  const recommendationsDoc = recommendationsFixture({ sourceProjectName: "A Different Project" });
  let threw = null;
  try {
    mod.buildImplementationRequest(decision, recommendationsDoc);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/decision\.json was generated from a different recommendations\.json artifact/.test(threw.message)) {
    throw new Error(`expected a clear artifact-mismatch error for a project mismatch, got: ${threw && threw.message}`);
  }
  ok("fails closed when recommendations.json's sourceProjectName does not match decision.sourceProjectName");
}

// 16. Stale recommendations artifact: recommendations.json was regenerated (new timestamp) and, by
//     coincidence, still contains an id 1 -- but it now refers to a completely different recommendation.
//     The artifact-mismatch check must catch this BEFORE the id lookup ever runs, so the engine never
//     silently produces a request for the wrong recommendation's content.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = decisionFixture(); // selected id 1 against the original ("2026-01-01T00:00:00.000Z") artifact
  const regeneratedRecommendations = recommendationsFixture({
    timestamp: "2026-06-15T00:00:00.000Z",
    recommendations: [
      {
        id: 1,
        ruleKey: "extract-complex-logic",
        title: "Extract Billing logic into smaller units",
        description: "An unrelated recommendation that now happens to reuse id 1 after regeneration.",
        reason: ["Billing has High complexity"],
        affectedModules: ["Billing"],
        affectedFiles: ["backend/billing/x.js"],
        estimatedImplementationSize: "Small",
        estimatedRisk: "Low",
        estimatedImpact: "High",
        confidence: 90,
        priorityScore: 90,
      },
    ],
  });
  let threw = null;
  try {
    mod.buildImplementationRequest(decision, regeneratedRecommendations);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/decision\.json was generated from a different recommendations\.json artifact/.test(threw.message)) {
    throw new Error(`expected the stale artifact to be rejected before id lookup could mix in the wrong recommendation, got: ${threw && threw.message}`);
  }
  ok("fails closed on a stale recommendations.json artifact instead of resolving id 1 against the wrong regenerated recommendation");
}

console.log("All Implementation Request Engine v1 regression scenarios passed.");
