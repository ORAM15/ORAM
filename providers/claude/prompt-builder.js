#!/usr/bin/env node
// Claude Code Provider Adapter v1 -- prompt-builder.js
//
// Builds a single, deterministic prompt for Claude Code from an already-approved implementation request.
// Uses ONLY the request's own title (Goal), goal (Description), affectedFiles, implementationConstraints,
// acceptanceCriteria, and validationChecklist -- the same six inputs listed in this engine's spec. It never
// reads the repository, never invents additional context, and never makes an engineering decision of its
// own (which change to make was already decided upstream by Decision Engine v1). The same request object
// always produces byte-for-byte the same prompt string.
//
// (request.title reads as a short goal statement, e.g. "Extract Authentication logic into smaller units",
// while request.goal is actually the fuller descriptive paragraph -- Implementation Request Engine v1 sets
// request.goal verbatim from the source recommendation's own `description` field. Mapping title -> Goal and
// goal -> Description reflects what each field actually contains, not just its literal name.)
//
// The trailing "Required Response Format" section is fixed boilerplate (identical for every request, never
// derived from repository or request content): it tells Claude Code the exact structured block parser.js
// will look for, so extraction is reliable instead of depending on free-form natural-language parsing.

const RESULT_START_MARKER = "===GVAMS_EXECUTION_RESULT===";
const RESULT_END_MARKER = "===END_GVAMS_EXECUTION_RESULT===";

const RESPONSE_SCHEMA_EXAMPLE = {
  outcome: "success | failure | cancelled",
  filesChanged: ["relative/path/to/file", "..."],
  testsRun: 0,
  testsOk: 0,
  notes: ["..."],
  problems: ["..."],
  summary: "one paragraph summary of what happened",
};

function listOrNone(items) {
  if (!Array.isArray(items) || items.length === 0) return ["(none specified)"];
  return items.map((item) => `- ${item}`);
}

/**
 * Builds the deterministic Claude Code prompt for a single implementation request. Pure function of the
 * request's own fields -- no clock, no randomness, no repository access.
 * @param {{title: string, goal: string, affectedFiles: string[], implementationConstraints: string[], acceptanceCriteria: string[], validationChecklist: string[]}} request
 * @returns {string}
 */
function buildPrompt(request) {
  const lines = [];

  lines.push(
    "You are Claude Code, executing a single, already-approved engineering change on behalf of the G-VAMS Autonomous Engineering System.",
    "Follow the instructions below exactly. Do not choose a different change to make, do not perform additional engineering analysis or decisions of your own, and do not modify any file outside \"Affected Files\".",
    ""
  );

  lines.push("## Goal", "", request.title || "(no goal provided)", "");
  lines.push("## Description", "", request.goal || "(no description provided)", "");

  lines.push("## Affected Files", "", ...listOrNone(request.affectedFiles), "");
  lines.push("## Constraints", "", ...listOrNone(request.implementationConstraints), "");
  lines.push("## Acceptance Criteria", "", ...listOrNone(request.acceptanceCriteria), "");
  lines.push("## Validation Checklist", "", ...listOrNone(request.validationChecklist), "");

  lines.push(
    "## Required Response Format",
    "",
    "When you are completely finished -- whether you succeeded, failed, or could not proceed -- output exactly one JSON object between the two marker lines below, each on its own line, with no other text between the markers and no comments or trailing commas inside it.",
    "",
    RESULT_START_MARKER,
    JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2),
    RESULT_END_MARKER,
    ""
  );

  return lines.join("\n");
}

module.exports = { buildPrompt, RESULT_START_MARKER, RESULT_END_MARKER };
