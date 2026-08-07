#!/usr/bin/env node
// Decision Engine v1 regression coverage: every deterministic derivation produces the expected,
// reproducible result against hand-crafted recommendations.json fixtures (this engine's only contract is
// that JSON shape, so tests are decoupled from Recommendation Engine's own internals), plus one true
// end-to-end run proving the real four-stage chain actually works together.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "scripts/decision-engine.js"), "utf8");
const repoIntelSource = fs.readFileSync(path.join(repoRoot, "scripts/repository-intelligence.js"), "utf8");
const engKnowledgeSource = fs.readFileSync(path.join(repoRoot, "scripts/engineering-knowledge.js"), "utf8");
const recEngineSource = fs.readFileSync(path.join(repoRoot, "scripts/recommendation-engine.js"), "utf8");

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function recommendation(overrides) {
  return {
    id: 1,
    ruleKey: "test-rule",
    title: "Test recommendation",
    description: "A test recommendation.",
    reason: ["because testing"],
    affectedModules: ["TestModule"],
    affectedFiles: ["test/file.js"],
    estimatedImplementationSize: "Small",
    estimatedRisk: "Low",
    estimatedImpact: "High",
    confidence: 80,
    priorityScore: 80,
    ...overrides,
  };
}

// Top two tied on every field except id (decisionScore 86 each); a clear third and fourth place, both
// distinct from each other and from the top pair. Exercises multiple recommendations, tie-breaking (down
// to id), stable sorting, and deterministic output all from one fixture.
const MULTI_FIXTURE = {
  sourceProjectName: "Fixture Project",
  timestamp: "2026-01-01T00:00:00.000Z",
  recommendations: [
    recommendation({ id: 1, title: "Alpha", priorityScore: 80, confidence: 80, estimatedImpact: "High", estimatedRisk: "Low", estimatedImplementationSize: "Small" }),
    recommendation({ id: 2, title: "Bravo", priorityScore: 60, confidence: 60, estimatedImpact: "Medium", estimatedRisk: "Medium", estimatedImplementationSize: "Medium" }),
    recommendation({ id: 3, title: "Charlie", priorityScore: 40, confidence: 40, estimatedImpact: "Low", estimatedRisk: "High", estimatedImplementationSize: "Large" }),
    recommendation({ id: 4, title: "Delta (tied with Alpha)", priorityScore: 80, confidence: 80, estimatedImpact: "High", estimatedRisk: "Low", estimatedImplementationSize: "Small" }),
  ],
};

function makeFixture(includeUpstreamSources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-engine-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/decision-engine.js"), source);
  if (includeUpstreamSources) {
    fs.writeFileSync(path.join(dir, "scripts/repository-intelligence.js"), repoIntelSource);
    fs.writeFileSync(path.join(dir, "scripts/engineering-knowledge.js"), engKnowledgeSource);
    fs.writeFileSync(path.join(dir, "scripts/recommendation-engine.js"), recEngineSource);
  }
  return dir;
}

function requireFixture(dir) {
  return require(path.join(dir, "scripts/decision-engine.js"));
}

function ok(name) {
  console.log(`${name}: observed expected deterministic outcome`);
}

// 1. Missing input fails closed with a clear, actionable message.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadRecommendations(path.join(dir, "recommendations/recommendations.json"));
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not found/.test(threw.message) || !/node scripts\/recommendation-engine\.js/.test(threw.message)) {
    throw new Error(`expected a clear missing-file error naming the fix, got: ${threw && threw.message}`);
  }
  ok("loadRecommendations fails closed with an actionable error when recommendations.json is missing");
}

// 2. Invalid JSON fails closed.
{
  const dir = makeFixture();
  const file = path.join(dir, "recommendations/recommendations.json");
  writeFile(file, "{ not valid json");
  const mod = requireFixture(dir);
  let threw = null;
  try {
    mod.loadRecommendations(file);
  } catch (error) {
    threw = error;
  }
  if (!threw || !/not valid JSON/.test(threw.message)) throw new Error(`expected a clear invalid-JSON error, got: ${threw && threw.message}`);
  ok("loadRecommendations fails closed on invalid JSON");
}

// 3. Empty recommendation list is handled gracefully (a valid input, not a failure): no selection, honest
//    zero-candidate output, and the markdown says so explicitly.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = mod.buildDecision({ sourceProjectName: "Empty Project", timestamp: "2026-01-01T00:00:00.000Z", recommendations: [] });
  if (decision.selectedRecommendationId !== null) throw new Error(`expected no selection for an empty recommendation list, got id ${decision.selectedRecommendationId}`);
  if (decision.selectedTitle !== null) throw new Error("expected selectedTitle to be null for an empty recommendation list");
  if (decision.decisionConfidence !== 0) throw new Error(`expected decisionConfidence 0 for an empty list, got ${decision.decisionConfidence}`);
  if (decision.candidatesEvaluated !== 0 || decision.candidateScores.length !== 0) throw new Error("expected zero candidates evaluated and scored");
  const markdown = mod.renderMarkdown(decision);
  if (!/No recommendation was selected/.test(markdown)) throw new Error("expected the empty case to be reported honestly in markdown, not silently omitted");
  ok("an empty recommendation list is handled gracefully with an honest zero-candidate decision, not thrown as an error");
}

// 4. A single recommendation is trivially selected with full (100%) decision confidence.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const doc = { sourceProjectName: "Solo Project", timestamp: "2026-01-01T00:00:00.000Z", recommendations: [recommendation({ id: 42, title: "Only option" })] };
  const decision = mod.buildDecision(doc);
  if (decision.selectedRecommendationId !== 42) throw new Error(`expected the only candidate (id 42) to be selected, got ${decision.selectedRecommendationId}`);
  if (decision.decisionConfidence !== 100) throw new Error(`expected 100% decision confidence with no alternative, got ${decision.decisionConfidence}`);
  if (!decision.decisionReasons.some((reason) => /Only one candidate/.test(reason))) throw new Error("expected a reason explicitly noting there was no alternative");
  ok("a single recommendation is trivially selected with 100% decision confidence");
}

// 5. computeDecisionScore applies the documented formula exactly, including the 0-100 clamp boundaries.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  // base = 80*0.6 + 80*0.4 = 80; +6 (High impact) - 0 (Low risk) - 0 (Small size) = 86
  if (mod.computeDecisionScore(recommendation({ priorityScore: 80, confidence: 80, estimatedImpact: "High", estimatedRisk: "Low", estimatedImplementationSize: "Small" })) !== 86) {
    throw new Error("expected the documented formula to yield 86 for this input");
  }
  // base = 100*0.6 + 100*0.4 = 100; +6 - 0 - 0 = 106 -> clamped to 100
  if (mod.computeDecisionScore(recommendation({ priorityScore: 100, confidence: 100, estimatedImpact: "High", estimatedRisk: "Low", estimatedImplementationSize: "Small" })) !== 100) {
    throw new Error("expected the score to clamp at 100");
  }
  // base = 0*0.6 + 0*0.4 = 0; -6 (Low impact) -10 (High risk) -6 (Large size) = -22 -> clamped to 0
  if (mod.computeDecisionScore(recommendation({ priorityScore: 0, confidence: 0, estimatedImpact: "Low", estimatedRisk: "High", estimatedImplementationSize: "Large" })) !== 0) {
    throw new Error("expected the score to clamp at 0");
  }
  ok("computeDecisionScore applies the documented formula exactly, including clamp boundaries");
}

// 6. compareCandidates resolves each tie-break level correctly, one level at a time, and names the
//    correct deciding field.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);

  // Same decisionScore-affecting inputs but different priorityScore -- but priorityScore doesn't solely
  // determine decisionScore (confidence/impact/risk/size also do), so construct two entries with identical
  // decisionScore by construction, differing only in priorityScore vs confidence directly.
  const a = { ...recommendation({ id: 1, priorityScore: 90, confidence: 70 }), decisionScore: 80 };
  const b = { ...recommendation({ id: 2, priorityScore: 70, confidence: 90 }), decisionScore: 80 };
  const tieOnScore = mod.compareCandidates(a, b);
  if (tieOnScore.level !== "priorityScore" || tieOnScore.cmp >= 0) throw new Error(`expected priorityScore to break a decisionScore tie in favor of the higher value, got: ${JSON.stringify(tieOnScore)}`);

  const c = { ...recommendation({ id: 3, priorityScore: 80, confidence: 90 }), decisionScore: 80 };
  const d = { ...recommendation({ id: 4, priorityScore: 80, confidence: 70 }), decisionScore: 80 };
  const tieOnPriority = mod.compareCandidates(c, d);
  if (tieOnPriority.level !== "confidence" || tieOnPriority.cmp >= 0) throw new Error(`expected confidence to break a decisionScore+priorityScore tie, got: ${JSON.stringify(tieOnPriority)}`);

  const e = { ...recommendation({ id: 5, priorityScore: 80, confidence: 80, estimatedRisk: "Low" }), decisionScore: 80 };
  const f = { ...recommendation({ id: 6, priorityScore: 80, confidence: 80, estimatedRisk: "High" }), decisionScore: 80 };
  const tieOnConfidence = mod.compareCandidates(e, f);
  if (tieOnConfidence.level !== "estimatedRisk" || tieOnConfidence.cmp >= 0) throw new Error(`expected lower risk (Low) to be preferred over higher risk (High), got: ${JSON.stringify(tieOnConfidence)}`);

  const g = { ...recommendation({ id: 7, priorityScore: 80, confidence: 80, estimatedRisk: "Low", estimatedImplementationSize: "Small" }), decisionScore: 80 };
  const h = { ...recommendation({ id: 8, priorityScore: 80, confidence: 80, estimatedRisk: "Low", estimatedImplementationSize: "Large" }), decisionScore: 80 };
  const tieOnRisk = mod.compareCandidates(g, h);
  if (tieOnRisk.level !== "estimatedImplementationSize" || tieOnRisk.cmp >= 0) throw new Error(`expected smaller size (Small) to be preferred over larger (Large), got: ${JSON.stringify(tieOnRisk)}`);

  const i = { ...recommendation({ id: 9, priorityScore: 80, confidence: 80, estimatedRisk: "Low", estimatedImplementationSize: "Small" }), decisionScore: 80 };
  const j = { ...recommendation({ id: 3, priorityScore: 80, confidence: 80, estimatedRisk: "Low", estimatedImplementationSize: "Small" }), decisionScore: 80 };
  const tieOnEverything = mod.compareCandidates(i, j);
  if (tieOnEverything.level !== "id" || tieOnEverything.cmp <= 0) throw new Error(`expected a total tie to fall through to lower id, got: ${JSON.stringify(tieOnEverything)}`);
  ok("compareCandidates resolves every tie-break level in the documented order, naming the correct deciding field");
}

// 7. Multiple recommendations, tie-breaking, and stable/deterministic sorting -- all from MULTI_FIXTURE:
//    Alpha (id 1) and Delta (id 4) are fully tied and must resolve to id 1; the ranked order and every
//    computed field must be identical no matter what order the input array was given in.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decisionA = mod.buildDecision(MULTI_FIXTURE);
  if (decisionA.selectedRecommendationId !== 1) throw new Error(`expected the tie between id 1 and id 4 to resolve to the lower id (1), got ${decisionA.selectedRecommendationId}`);
  if (decisionA.candidateScores.map((c) => c.id).join(",") !== "1,4,2,3") throw new Error(`expected ranked order [1,4,2,3], got: ${decisionA.candidateScores.map((c) => c.id).join(",")}`);
  if (!decisionA.decisionReasons.some((reason) => /Tied with recommendation #4/.test(reason))) throw new Error("expected a reason explicitly naming the tied runner-up by id");

  const shuffled = { ...MULTI_FIXTURE, recommendations: [...MULTI_FIXTURE.recommendations].reverse() };
  const decisionB = mod.buildDecision(shuffled);
  if (decisionB.selectedRecommendationId !== decisionA.selectedRecommendationId) throw new Error("expected the same selection regardless of input array order");
  if (JSON.stringify(decisionB.candidateScores) !== JSON.stringify(decisionA.candidateScores)) throw new Error("expected identical ranked candidateScores regardless of input array order (stable sorting)");

  const decisionC = mod.buildDecision(MULTI_FIXTURE);
  const strip = (decision) => { const { timestamp, ...rest } = decision; void timestamp; return rest; };
  if (JSON.stringify(strip(decisionC)) !== JSON.stringify(strip(decisionA))) throw new Error("expected byte-identical output (aside from timestamp) for the same input across repeated runs");

  ok("multiple recommendations rank and tie-break correctly, deterministically, and independent of input order");
}

// 8. computeDecisionConfidence reflects the score gap between first and second place.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  if (mod.computeDecisionConfidence([{ decisionScore: 90 }]) !== 100) throw new Error("expected a single candidate to yield 100% decision confidence");
  if (mod.computeDecisionConfidence([{ decisionScore: 90 }, { decisionScore: 90 }]) !== 60) throw new Error("expected a zero-gap tie to yield the documented base of 60%");
  if (mod.computeDecisionConfidence([{ decisionScore: 90 }, { decisionScore: 80 }]) !== 100) throw new Error("expected a 10-point gap to reach the 100% cap (60 + 10*4 = 100)");
  if (mod.computeDecisionConfidence([{ decisionScore: 90 }, { decisionScore: 88 }]) !== 68) throw new Error("expected a 2-point gap to yield 68% (60 + 2*4)");
  ok("computeDecisionConfidence scales with the top-two score gap and caps at 100");
}

// 9. renderMarkdown includes the required "why selected" / "why not others" / "what next" sections.
{
  const dir = makeFixture();
  const mod = requireFixture(dir);
  const decision = mod.buildDecision(MULTI_FIXTURE);
  const markdown = mod.renderMarkdown(decision);
  for (const heading of ["# Decision Engine Report", "## Decision formula", "Why this recommendation was selected", "Why the others were not selected", "What should happen next"]) {
    if (!markdown.includes(heading)) throw new Error(`expected markdown to include "${heading}"`);
  }
  if (!/\| 1 \| ✓ \| 1 \|/.test(markdown)) throw new Error("expected the ranked table to mark the winning row as selected");
  ok("renderMarkdown includes all required explanatory sections and a fully ranked comparison table");
}

// 10. writeOutputs persists both files, and RECOMMENDATIONS_PATH / DECISION_OUTPUT_DIR override the
//     default input/output locations.
{
  const dir = makeFixture();
  const customInput = path.join(dir, "custom-input/recs.json");
  writeJson(customInput, MULTI_FIXTURE);
  const previousInput = process.env.RECOMMENDATIONS_PATH;
  const previousOutput = process.env.DECISION_OUTPUT_DIR;
  process.env.RECOMMENDATIONS_PATH = "custom-input/recs.json";
  process.env.DECISION_OUTPUT_DIR = "custom-output/nested";
  try {
    const mod = requireFixture(dir);
    if (mod.inputPath !== customInput) throw new Error(`expected overridden input path, got: ${mod.inputPath}`);
    if (mod.outputDir !== path.join(dir, "custom-output", "nested")) throw new Error(`expected overridden output directory, got: ${mod.outputDir}`);
    const decision = mod.buildDecision(mod.loadRecommendations(mod.inputPath));
    const { jsonPath, mdPath } = mod.writeOutputs(decision);
    if (path.basename(jsonPath) !== "decision.json") throw new Error(`expected output named decision.json, got ${jsonPath}`);
    if (path.basename(mdPath) !== "decision.md") throw new Error(`expected output named decision.md, got ${mdPath}`);
    if (!fs.existsSync(jsonPath) || !fs.existsSync(mdPath)) throw new Error("expected both output files to exist under the overridden output directory");
    JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } finally {
    if (previousInput === undefined) delete process.env.RECOMMENDATIONS_PATH; else process.env.RECOMMENDATIONS_PATH = previousInput;
    if (previousOutput === undefined) delete process.env.DECISION_OUTPUT_DIR; else process.env.DECISION_OUTPUT_DIR = previousOutput;
  }
  ok("RECOMMENDATIONS_PATH and DECISION_OUTPUT_DIR override the default input/output locations");
}

// 11. CLI fails closed (non-zero exit, clear stderr) when recommendations.json does not exist yet.
{
  const dir = makeFixture();
  const result = spawnSync("node", ["scripts/decision-engine.js"], { cwd: dir, encoding: "utf8" });
  if (result.status === 0) throw new Error(`expected the CLI to fail closed with no recommendations.json present:\n${result.stdout}`);
  if (!/recommendations\.json not found/.test(result.stderr)) throw new Error(`expected a clear missing-input error on stderr, got:\n${result.stderr}`);
  ok("CLI fails closed with a clear error when recommendations.json has not been generated yet");
}

// 12. True end-to-end: the real four-stage chain (repository-intelligence.js -> engineering-knowledge.js
//     -> recommendation-engine.js -> decision-engine.js), using the real upstream sources, produces valid,
//     internally-consistent decision output.
{
  const dir = makeFixture(true);
  for (const script of ["repository-intelligence.js", "engineering-knowledge.js", "recommendation-engine.js", "decision-engine.js"]) {
    const run = spawnSync("node", [`scripts/${script}`], { cwd: dir, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${script} run failed:\n${run.stdout}\n${run.stderr}`);
  }
  const jsonPath = path.join(dir, "decision", "decision.json");
  const mdPath = path.join(dir, "decision", "decision.md");
  if (!fs.existsSync(jsonPath)) throw new Error("expected decision.json to be produced by the real end-to-end chain");
  if (!fs.existsSync(mdPath)) throw new Error("expected decision.md to be produced by the real end-to-end chain");
  const decision = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (typeof decision.selectedRecommendationId !== "number" && decision.selectedRecommendationId !== null) {
    throw new Error(`expected selectedRecommendationId to be a number or null, got: ${JSON.stringify(decision.selectedRecommendationId)}`);
  }
  if (decision.selectedRecommendationId !== null) {
    const winner = decision.candidateScores.find((candidate) => candidate.id === decision.selectedRecommendationId);
    if (!winner || !winner.selected) throw new Error("expected the selected id to be marked selected in candidateScores");
  }
  ok("the real four-stage chain produces valid, internally-consistent decision output");
}

console.log("All Decision Engine v1 regression scenarios passed.");
