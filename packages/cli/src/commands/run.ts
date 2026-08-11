/**
 * `oram run <path> [--artifacts-dir <dir>]` — executes the FULL real engineering pipeline through
 * @oram/runtime (Capability Sprint 18): all thirteen FULL_ENGINEERING_WORKFLOW stages, each invoked by the
 * real EngineRunner, each output persisted in the ArtifactStore under this run's runId, each downstream
 * stage consuming the current run's artifacts via RunArtifacts. This supersedes the long-standing "Not
 * implemented yet" stub -- the primary command finally is the primary command.
 *
 * Unlike every per-stage sibling command (analyze.ts ... pull-request.ts, which compose the pure build*()
 * functions directly and recompute by design), this command goes through Runtime.runPipeline(): the Runtime
 * owns orchestration and the Lifecycle, EngineRunner owns engine execution, the ArtifactStore owns
 * persistence, and the engines own only engineering logic. Every [✓] in the report corresponds to a real,
 * persisted artifact returned by a real EngineRunner execution -- nothing is printed on faith.
 *
 * Artifacts default to `<repository>/.oram` (RuntimeBuilder's documented repository-local default;
 * gitignored) so a completed run remains inspectable afterwards; `--artifacts-dir` overrides it (used by
 * tests to keep fixture directories pristine).
 *
 * SAFETY: Provider Execution is the existing deterministic MemoryProvider (no LLM, no git, no shell); the
 * final stage produces a PullRequestProposal artifact -- generated, NEVER published. No GitHub API is
 * called anywhere in this command.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { RuntimeBuilder, type PipelineRunResult } from "@oram/runtime";
import { FULL_ENGINEERING_WORKFLOW, type PipelineStepId } from "@oram/core";
import { createFullPipelineEngines, type EngineeringDecision, type PullRequestProposal, type RepositoryAnalysis } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, statLine } from "../report/shared";
import { printCliError } from "../errors";

const USAGE = "oram run <path> [--artifacts-dir <dir>]";

/** Display label + expected artifactName per pipeline step -- presentation metadata only; the workflow itself stays @oram/core's declarative data. */
const STAGE_DISPLAY: Readonly<Record<PipelineStepId, { readonly label: string; readonly artifactType: string }>> = {
  "repository-intelligence": { label: "Repository Analysis", artifactType: "repository-analysis" },
  "engineering-knowledge": { label: "Engineering Knowledge", artifactType: "engineering-knowledge" },
  "engineering-reasoning": { label: "Engineering Reasoning", artifactType: "engineering-reasoning" },
  "engineering-planning": { label: "Engineering Planning", artifactType: "engineering-planning" },
  "engineering-missions": { label: "Engineering Missions", artifactType: "engineering-missions" },
  "implementation-requests": { label: "Implementation Requests", artifactType: "implementation-requests" },
  "execution-planning": { label: "Execution Planning", artifactType: "execution-planning" },
  "provider-execution": { label: "Provider Execution", artifactType: "provider-execution" },
  validation: { label: "Validation", artifactType: "validation" },
  recommendation: { label: "Recommendation", artifactType: "recommendation" },
  reflection: { label: "Reflection", artifactType: "reflection" },
  "adaptive-decision": { label: "Adaptive Decision", artifactType: "engineering-decision" },
  "pull-request": { label: "Pull Request Proposal", artifactType: "pull-request-proposal" },
};

function findPayload<T>(result: PipelineRunResult, artifactType: string): T | null {
  const artifact = result.artifacts.find((candidate) => candidate.type === artifactType);
  return artifact ? (artifact.payload as T) : null;
}

export async function runCommand(args: string[]): Promise<number> {
  const [rawPath, ...rest] = args;

  if (!rawPath) {
    printCliError("missing required argument <path>", USAGE);
    return 1;
  }

  const targetPath = path.resolve(rawPath);

  if (!existsSync(targetPath)) {
    printCliError(`repository not found at "${targetPath}"`, USAGE);
    return 1;
  }

  const flagIndex = rest.indexOf("--artifacts-dir");
  const artifactsBaseDir = flagIndex !== -1 ? rest[flagIndex + 1] : undefined;
  if (flagIndex !== -1 && !artifactsBaseDir) {
    printCliError("--artifacts-dir requires a directory argument", USAGE);
    return 1;
  }

  const runtime = new RuntimeBuilder().build({
    repositoryRoot: targetPath,
    ...(artifactsBaseDir ? { artifactsBaseDir: path.resolve(artifactsBaseDir) } : {}),
  });

  const startedAt = Date.now();
  let result: PipelineRunResult;
  try {
    result = await runtime.runPipeline({ repositoryPath: targetPath }, createFullPipelineEngines());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printCliError(`pipeline aborted (lifecycle: ${runtime.lifecycle.state.phase}): ${message}`, USAGE);
    return 1;
  }
  const elapsedMs = Date.now() - startedAt;

  const analysis = findPayload<RepositoryAnalysis>(result, "repository-analysis");
  const decision = findPayload<EngineeringDecision>(result, "engineering-decision");
  const proposal = findPayload<PullRequestProposal>(result, "pull-request-proposal");
  const persistedTypes = new Set(result.artifacts.map((artifact) => artifact.type));

  const lines: string[] = [
    RULE_DOUBLE,
    "ORAM ENGINEERING PIPELINE",
    RULE_DOUBLE,
    "",
    statLine("Repository", analysis?.projectName ?? "(unknown)"),
    statLine("Run", result.runId),
    "",
  ];

  // Honest checkmarks: [✓] only when that stage's artifact really came back from EngineRunner this run.
  for (const step of FULL_ENGINEERING_WORKFLOW.steps) {
    const display = STAGE_DISPLAY[step];
    lines.push(`${persistedTypes.has(display.artifactType) ? "[✓]" : "[✗]"} ${display.label}`);
  }

  if (decision) {
    lines.push(
      "",
      RULE_SINGLE,
      "FINAL DECISION",
      RULE_SINGLE,
      "",
      statLine("Decision", decision.decisionType),
      statLine("Risk", decision.riskLevel),
      statLine("Next Action", decision.nextAction)
    );
  }

  if (proposal) {
    lines.push(
      "",
      RULE_SINGLE,
      "PULL REQUEST PROPOSAL (generated, not published)",
      RULE_SINGLE,
      "",
      statLine("Kind", proposal.kind),
      statLine("Title", proposal.title),
      statLine("Branch", proposal.branchName ?? "(none -- no PR should be created)"),
      statLine("Human Approval", proposal.humanApprovalRequired ? "REQUIRED" : "NOT REQUIRED")
    );
  }

  lines.push(
    "",
    RULE_SINGLE,
    "RUNTIME",
    RULE_SINGLE,
    "",
    statLine("Artifacts Persisted", String(result.artifacts.length)),
    statLine("Lifecycle", runtime.lifecycle.state.phase),
    statLine("Artifact Store", artifactsBaseDir ? path.resolve(artifactsBaseDir) : path.join(targetPath, ".oram")),
    statLine("Execution Time", `${elapsedMs} ms`),
    "",
    RULE_DOUBLE,
    "ORAM RUN COMPLETE",
    RULE_DOUBLE
  );

  console.log(lines.join("\n"));
  return 0;
}
