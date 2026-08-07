#!/usr/bin/env node
// Decision Engine v1
//
// A deterministic (no AI/LLM/network/repository-scanning/source-parsing) engine that reads
// recommendations/recommendations.json (Recommendation Engine v1's output) and selects exactly one
// recommendation to act on next -- it never implements anything, never generates code, and never scans the
// repository. It only evaluates the fields already present on each recommendation object.
//
// Run with:   node scripts/decision-engine.js
// Input path defaults to recommendations/recommendations.json; override with RECOMMENDATIONS_PATH
// (relative to the repository root, or absolute).
// Output dir defaults to `decision/` at the repository root; override with DECISION_OUTPUT_DIR (relative
// to the repository root, or absolute).
//
// recommendations.json is this engine's one and only input. Every field on the decision (score, reasons,
// impact/risk/size, confidence) is derived only from fields already present on each recommendation --
// this engine never re-reads engineering-knowledge.json, repository-analysis.json, package.json, or source
// code. See DECISION_FORMULA_DESCRIPTION and computeDecisionScore() for the documented scoring formula,
// and compareCandidates() for the documented, total, deterministic tie-break order.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(root, process.env.RECOMMENDATIONS_PATH || "recommendations/recommendations.json");
const outputDir = path.resolve(root, process.env.DECISION_OUTPUT_DIR || "decision");

const IMPACT_BONUS = { High: 6, Medium: 0, Low: -6 };
const RISK_PENALTY = { Low: 0, Medium: 4, High: 10, "Not applicable": 0 };
const SIZE_PENALTY = { Small: 0, Medium: 2, Large: 6 };
const RISK_RANK = { Low: 0, Medium: 1, High: 2, "Not applicable": 3 };
const SIZE_RANK = { Small: 0, Medium: 1, Large: 2 };

const DECISION_FORMULA_DESCRIPTION =
  "decisionScore = clamp(round(priorityScore*0.6 + confidence*0.4 + impactBonus - riskPenalty - sizePenalty), 0, 100), where " +
  "impactBonus is High:+6/Medium:0/Low:-6, riskPenalty is Low:0/Medium:4/High:10, and sizePenalty is Small:0/Medium:2/Large:6 -- " +
  "all read directly from the recommendation's own estimatedImpact/estimatedRisk/estimatedImplementationSize fields. " +
  "priorityScore is weighted higher (0.6) than confidence (0.4) since it already encodes the underlying module's business " +
  "criticality/architectural importance/maintenance risk/complexity/coupling, while confidence only reflects how many " +
  "corroborating reasons back this specific recommendation. Candidates are ranked by decisionScore descending; ties are " +
  "broken, in order, by higher priorityScore, then higher confidence, then lower estimatedRisk (safer preferred), then " +
  "smaller estimatedImplementationSize (smaller preferred), then finally lower id -- a total order, so the same input " +
  "always yields the same single selection.";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and parses recommendations.json. Fails closed with a clear, actionable error if the file is
 * missing or not valid JSON -- this engine never silently regenerates or guesses at recommendations.
 * @param {string} file absolute path to recommendations.json
 * @returns {object} the parsed recommendations document
 */
function loadRecommendations(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`recommendations.json not found at ${path.relative(root, file)}. Run \`node scripts/recommendation-engine.js\` first (or set RECOMMENDATIONS_PATH).`);
  }
  try {
    return readJson(file);
  } catch (error) {
    throw new Error(`recommendations.json at ${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes a single recommendation's deterministic 0-100 decision score. See DECISION_FORMULA_DESCRIPTION
 * for the full documented formula; this is its single implementation.
 * @param {{priorityScore: number, confidence: number, estimatedImpact: string, estimatedRisk: string, estimatedImplementationSize: string}} recommendation
 * @returns {number} 0-100
 */
function computeDecisionScore(recommendation) {
  const base = recommendation.priorityScore * 0.6 + recommendation.confidence * 0.4;
  const impactBonus = IMPACT_BONUS[recommendation.estimatedImpact] ?? 0;
  const riskPenalty = RISK_PENALTY[recommendation.estimatedRisk] ?? 0;
  const sizePenalty = SIZE_PENALTY[recommendation.estimatedImplementationSize] ?? 0;
  return clamp(Math.round(base + impactBonus - riskPenalty - sizePenalty), 0, 100);
}

/**
 * Deterministically compares two scored candidates for ranking. Returns a negative number if `a` should
 * rank before `b`, positive if after, and the specific field name that decided the comparison (`level`) --
 * used both to sort candidates and to explain, precisely, which criterion separated the top two.
 * @param {{decisionScore: number, priorityScore: number, confidence: number, estimatedRisk: string, estimatedImplementationSize: string, id: number}} a
 * @param {object} b
 * @returns {{cmp: number, level: string}}
 */
function compareCandidates(a, b) {
  if (b.decisionScore !== a.decisionScore) return { cmp: b.decisionScore - a.decisionScore, level: "decisionScore" };
  if (b.priorityScore !== a.priorityScore) return { cmp: b.priorityScore - a.priorityScore, level: "priorityScore" };
  if (b.confidence !== a.confidence) return { cmp: b.confidence - a.confidence, level: "confidence" };
  const riskDiff = (RISK_RANK[a.estimatedRisk] ?? 3) - (RISK_RANK[b.estimatedRisk] ?? 3);
  if (riskDiff !== 0) return { cmp: riskDiff, level: "estimatedRisk" };
  const sizeDiff = (SIZE_RANK[a.estimatedImplementationSize] ?? 2) - (SIZE_RANK[b.estimatedImplementationSize] ?? 2);
  if (sizeDiff !== 0) return { cmp: sizeDiff, level: "estimatedImplementationSize" };
  return { cmp: a.id - b.id, level: "id" };
}

/**
 * Scores and totally orders every recommendation. Stable regardless of the input array's original order,
 * since compareCandidates() always falls through to `id` as a final, unique tie-break.
 * @param {object[]} recommendations raw recommendation objects from recommendations.json
 * @returns {object[]} recommendations, each with an added decisionScore, sorted by rank (best first)
 */
function rankCandidates(recommendations) {
  const scored = recommendations.map((recommendation) => ({ ...recommendation, decisionScore: computeDecisionScore(recommendation) }));
  return scored.sort((a, b) => compareCandidates(a, b).cmp);
}

/**
 * Computes decision confidence (0-100, distinct from any single recommendation's own `confidence` field):
 * a documented base of 60 (a decision resolved only by the deterministic tie-break chain is still fully
 * deterministic, but reflects genuinely close/ambiguous candidates), plus 4 points per point of decisionScore
 * gap between the top-ranked and second-ranked candidate, capped at 100. A single candidate has no
 * alternative to be ambiguous against, so it is always 100.
 * @param {object[]} ranked rankCandidates() output
 * @returns {number} 0-100
 */
function computeDecisionConfidence(ranked) {
  if (ranked.length <= 1) return 100;
  const gap = ranked[0].decisionScore - ranked[1].decisionScore;
  return clamp(Math.round(60 + gap * 4), 0, 100);
}

/**
 * Builds the reason strings explaining why the top-ranked candidate was selected, including precisely
 * which criterion separated it from the runner-up (if any) -- never a generic "it was better" statement.
 * @param {object[]} ranked rankCandidates() output
 * @returns {string[]}
 */
function buildDecisionReasons(ranked) {
  const winner = ranked[0];
  const reasons = [
    `Evaluated ${ranked.length} candidate recommendation(s) from recommendations.json.`,
    `Highest decision score: ${winner.decisionScore}/100 (priorityScore ${winner.priorityScore}, confidence ${winner.confidence}%, impact ${winner.estimatedImpact}, risk ${winner.estimatedRisk}, size ${winner.estimatedImplementationSize}).`,
  ];
  if (ranked.length > 1) {
    const runnerUp = ranked[1];
    const { level } = compareCandidates(winner, runnerUp);
    if (level === "id") {
      reasons.push(
        `Tied with recommendation #${runnerUp.id} ("${runnerUp.title}") on decision score, priorityScore, confidence, risk, and size; resolved deterministically by lower id.`
      );
    } else {
      reasons.push(`Ahead of the next-best candidate, recommendation #${runnerUp.id} ("${runnerUp.title}"), on ${level} (${winner[level]} vs ${runnerUp[level]}).`);
    }
  } else {
    reasons.push("Only one candidate recommendation was available; selected by default.");
  }
  return reasons;
}

/**
 * Builds the complete decision document: the selected recommendation, the documented formula, every
 * candidate's computed score for full transparency, and deterministic reasoning. This is the single entry
 * point both the CLI and any other caller (e.g. tests) should use. Handles an empty recommendations array
 * gracefully (a valid, expected input -- not a failure): no selection is made, and that is reported
 * honestly rather than thrown as an error.
 * @param {object} recommendationsDoc parsed recommendations.json
 * @returns {object} matching decision.json's shape
 */
function buildDecision(recommendationsDoc) {
  const recommendations = recommendationsDoc.recommendations || [];
  const base = {
    generatedFrom: path.relative(root, inputPath).split(path.sep).join("/"),
    sourceProjectName: recommendationsDoc.sourceProjectName,
    sourceTimestamp: recommendationsDoc.timestamp,
    decisionFormula: DECISION_FORMULA_DESCRIPTION,
    candidatesEvaluated: recommendations.length,
    timestamp: new Date().toISOString(),
  };

  if (recommendations.length === 0) {
    return {
      ...base,
      selectedRecommendationId: null,
      selectedTitle: null,
      decisionConfidence: 0,
      decisionReasons: ["No recommendations were present in recommendations.json; there is nothing to decide."],
      estimatedImpact: "Not applicable",
      estimatedRisk: "Not applicable",
      estimatedImplementationSize: "Not applicable",
      candidateScores: [],
    };
  }

  const ranked = rankCandidates(recommendations);
  const winner = ranked[0];

  return {
    ...base,
    selectedRecommendationId: winner.id,
    selectedTitle: winner.title,
    decisionConfidence: computeDecisionConfidence(ranked),
    decisionReasons: buildDecisionReasons(ranked),
    estimatedImpact: winner.estimatedImpact,
    estimatedRisk: winner.estimatedRisk,
    estimatedImplementationSize: winner.estimatedImplementationSize,
    candidateScores: ranked.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      decisionScore: candidate.decisionScore,
      priorityScore: candidate.priorityScore,
      confidence: candidate.confidence,
      estimatedImpact: candidate.estimatedImpact,
      estimatedRisk: candidate.estimatedRisk,
      estimatedImplementationSize: candidate.estimatedImplementationSize,
      selected: candidate.id === winner.id,
    })),
  };
}

/**
 * Renders the human-readable Markdown report for a given decision document: why the selection was made,
 * why the others were not (via the full ranked comparison table), and what should happen next.
 * @param {object} decision result of buildDecision()
 * @returns {string}
 */
function renderMarkdown(decision) {
  const lines = [];
  lines.push("# Decision Engine Report", "");
  lines.push("Generated by `scripts/decision-engine.js` -- deterministic, no AI/LLM involved. This engine only decides; it never implements or generates code.", "");
  lines.push(`Source: \`${decision.generatedFrom}\` (project: ${decision.sourceProjectName}, generated ${decision.sourceTimestamp})`, "");
  lines.push(`Timestamp: ${decision.timestamp}`, "");
  lines.push("## Decision formula", "");
  lines.push(decision.decisionFormula, "");

  if (decision.selectedRecommendationId === null) {
    lines.push("## Selection", "");
    lines.push("No recommendation was selected: recommendations.json contained zero candidates to evaluate.", "");
    lines.push("## What should happen next", "");
    lines.push("Run `node scripts/recommendation-engine.js` again once engineering-knowledge.json has changed enough to produce at least one recommendation.", "");
    return lines.join("\n");
  }

  lines.push(`## Selected: #${decision.selectedRecommendationId} -- ${decision.selectedTitle}`, "");
  lines.push(`**Decision confidence:** ${decision.decisionConfidence}% | **Impact:** ${decision.estimatedImpact} | **Risk:** ${decision.estimatedRisk} | **Size:** ${decision.estimatedImplementationSize}`, "");
  lines.push("### Why this recommendation was selected", "");
  decision.decisionReasons.forEach((reason) => lines.push(`- ${reason}`));
  lines.push("");

  lines.push("### Why the others were not selected", "");
  lines.push(`Every candidate ranked by decision score (descending); the selected recommendation is marked. Formula and full tie-break order are documented above.`, "");
  lines.push("| Rank | Selected | ID | Title | Decision score | Priority | Confidence | Impact | Risk | Size |");
  lines.push("| ---: | :---: | ---: | --- | ---: | ---: | ---: | --- | --- | --- |");
  decision.candidateScores.forEach((candidate, index) => {
    lines.push(
      `| ${index + 1} | ${candidate.selected ? "✓" : ""} | ${candidate.id} | ${candidate.title} | ${candidate.decisionScore} | ${candidate.priorityScore} | ${candidate.confidence}% | ${candidate.estimatedImpact} | ${candidate.estimatedRisk} | ${candidate.estimatedImplementationSize} |`
    );
  });
  lines.push("");

  lines.push("### What should happen next", "");
  lines.push(
    `Decision Engine v1 does not implement anything. A human (or a future Implementation Engine, not yet built) should review recommendation #${decision.selectedRecommendationId} ("${decision.selectedTitle}") and its affected modules/files from recommendations.json before making any change.`,
    ""
  );

  return lines.join("\n");
}

/**
 * Writes decision.json and decision.md into the output directory (created if needed), returning their
 * absolute paths.
 * @param {object} decision
 * @returns {{jsonPath: string, mdPath: string}}
 */
function writeOutputs(decision) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "decision.json");
  const mdPath = path.join(outputDir, "decision.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(decision, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${renderMarkdown(decision)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const recommendationsDoc = loadRecommendations(inputPath);
  const decision = buildDecision(recommendationsDoc);
  const { jsonPath, mdPath } = writeOutputs(decision);
  console.log(`Wrote ${path.relative(root, jsonPath)}`);
  console.log(`Wrote ${path.relative(root, mdPath)}`);
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
  inputPath,
  outputDir,
  loadRecommendations,
  computeDecisionScore,
  compareCandidates,
  rankCandidates,
  computeDecisionConfidence,
  buildDecisionReasons,
  buildDecision,
  renderMarkdown,
  writeOutputs,
};
