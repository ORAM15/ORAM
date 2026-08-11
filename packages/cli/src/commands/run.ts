/**
 * `oram run <path> [--artifacts-dir <dir>] [--approve | --reject[=<reason>]]` — executes the FULL real
 * engineering pipeline through @oram/runtime (Capability Sprint 18), now gated by a REAL safety boundary
 * (Capability Sprint 19): the run stops at AWAITING_APPROVAL after the seven pre-approval stages
 * (Repository Analysis through Execution Planning) and returns WITHOUT invoking Provider Execution.
 *
 * With no `--approve`/`--reject` flag, the process prints the SAFETY GATE report and exits 0 -- the pipeline
 * genuinely remains paused; nothing further happens. `--approve` and `--reject` are this command's own
 * non-interactive stand-in for "an explicit human decision arrived" (the same reasoning a CI approval step
 * or a dashboard click would satisfy -- see Runtime.ts's own TODO on how approve() is eventually delivered):
 * they are ordinary CLI flags a human types deliberately, never a timer, never a default, never silently
 * implied. Passing one causes THIS SAME process/run to call the real `runtime.approve(runId)` /
 * `runtime.reject(runId, reason)` immediately after the gate is reached, so the whole demonstration --
 * pre-approval stages, the pause, and the explicit decision -- happens within one Runtime instance and one
 * runId, exactly as Runtime.approve()/reject() require. Standalone `oram approve <run-id>` / `oram reject
 * <run-id>` commands are deliberately NOT provided: Lifecycle/Run/the pending-approval record are explicitly
 * in-memory-only (see run/run.ts's own "NO PERSISTENCE. NO REPLAY. NO RESUME" disclosure) and do not survive
 * past this process exiting, so a second CLI invocation could never genuinely resume the first's run --
 * building those commands would either silently do nothing or require fabricating cross-process persistence
 * this Sprint does not add.
 *
 * Unlike every per-stage sibling command (analyze.ts ... pull-request.ts, which compose the pure build*()
 * functions directly and recompute by design), this command goes through Runtime.runPipeline()/.approve()/
 * .reject(): the Runtime owns orchestration and the Lifecycle, EngineRunner owns engine execution, the
 * ArtifactStore owns persistence, and the engines own only engineering logic. Every [✓] in the report
 * corresponds to a real, persisted artifact returned by a real EngineRunner execution -- nothing is printed
 * on faith.
 *
 * Artifacts default to `<repository>/.oram` (RuntimeBuilder's documented repository-local default;
 * gitignored) so a completed run remains inspectable afterwards; `--artifacts-dir` overrides it (used by
 * tests to keep fixture directories pristine).
 *
 * SAFETY: Provider Execution is the existing deterministic MemoryProvider (no LLM, no git, no shell); the
 * Pull Request Proposal stage produces a PullRequestProposal artifact, and the final Publisher stage
 * produces a PublishRecord via the existing deterministic MemoryPublisher (always dry-run) -- generated,
 * NEVER really published. No GitHub API is called anywhere in this command.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { RuntimeBuilder, type PipelineRunResult } from "@oram/runtime";
import { FULL_ENGINEERING_WORKFLOW, type PipelineStepId } from "@oram/core";
import { createFullPipelineEngines, type EngineeringDecision, type PullRequestProposal, type PublishRecord, type RepositoryAnalysis } from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, statLine } from "../report/shared";
import { printCliError } from "../errors";

const USAGE = "oram run <path> [--artifacts-dir <dir>] [--approve | --reject[=<reason>]]";

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
  publisher: { label: "Publisher", artifactType: "publish-record" },
};

function findPayload<T>(result: PipelineRunResult, artifactType: string): T | null {
  const artifact = result.artifacts.find((candidate) => candidate.type === artifactType);
  return artifact ? (artifact.payload as T) : null;
}

function renderStageChecklist(result: PipelineRunResult): string[] {
  const persistedTypes = new Set(result.artifacts.map((artifact) => artifact.type));
  return FULL_ENGINEERING_WORKFLOW.steps.map((step) => {
    const display = STAGE_DISPLAY[step];
    return `${persistedTypes.has(display.artifactType) ? "[✓]" : "[ ]"} ${display.label}`;
  });
}

function renderCompletionSections(result: PipelineRunResult): string[] {
  const decision = findPayload<EngineeringDecision>(result, "engineering-decision");
  const proposal = findPayload<PullRequestProposal>(result, "pull-request-proposal");
  const record = findPayload<PublishRecord>(result, "publish-record");
  const lines: string[] = [];

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

  if (record) {
    lines.push(
      "",
      RULE_SINGLE,
      "PUBLISH RECORD (dry run -- nothing was actually published)",
      RULE_SINGLE,
      "",
      statLine("Outcome", record.outcome),
      statLine("Reason", record.reason),
      statLine("Pull Request URL", record.pullRequestUrl ?? "None")
    );
  }

  return lines;
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

  const artifactsDirIndex = rest.indexOf("--artifacts-dir");
  const artifactsBaseDir = artifactsDirIndex !== -1 ? rest[artifactsDirIndex + 1] : undefined;
  if (artifactsDirIndex !== -1 && !artifactsBaseDir) {
    printCliError("--artifacts-dir requires a directory argument", USAGE);
    return 1;
  }

  const approveFlag = rest.find((arg) => arg === "--approve");
  const rejectFlag = rest.find((arg) => arg === "--reject" || arg.startsWith("--reject="));
  if (approveFlag && rejectFlag) {
    printCliError("--approve and --reject are mutually exclusive", USAGE);
    return 1;
  }
  const rejectReason = rejectFlag?.startsWith("--reject=") ? rejectFlag.slice("--reject=".length) : undefined;

  const runtime = new RuntimeBuilder().build({
    repositoryRoot: targetPath,
    ...(artifactsBaseDir ? { artifactsBaseDir: path.resolve(artifactsBaseDir) } : {}),
  });

  const startedAt = Date.now();
  let paused: PipelineRunResult;
  try {
    paused = await runtime.runPipeline({ repositoryPath: targetPath }, createFullPipelineEngines());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printCliError(`pipeline aborted (lifecycle: ${runtime.lifecycle.state.phase}): ${message}`, USAGE);
    return 1;
  }

  const analysis = findPayload<RepositoryAnalysis>(paused, "repository-analysis");
  const artifactStorePath = artifactsBaseDir ? path.resolve(artifactsBaseDir) : path.join(targetPath, ".oram");

  const lines: string[] = [
    RULE_DOUBLE,
    "ORAM ENGINEERING PIPELINE",
    RULE_DOUBLE,
    "",
    statLine("Repository", analysis?.projectName ?? "(unknown)"),
    statLine("Run", paused.runId),
    "",
    ...renderStageChecklist(paused),
    "",
    RULE_SINGLE,
    "SAFETY GATE",
    RULE_SINGLE,
    "",
    statLine("Run ID", paused.runId),
    "",
    statLine("STATUS", "AWAITING_APPROVAL"),
    "",
    "Provider Execution has NOT occurred.",
    "Explicit approval is required to continue.",
  ];

  let final: PipelineRunResult = paused;

  if (approveFlag) {
    try {
      final = await runtime.approve(paused.runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printCliError(`approved run aborted (lifecycle: ${runtime.lifecycle.state.phase}): ${message}`, USAGE);
      return 1;
    }
    lines.push(
      "",
      RULE_SINGLE,
      "APPROVAL",
      RULE_SINGLE,
      "",
      "Run APPROVED. Provider Execution has now occurred exactly once.",
      "",
      ...renderStageChecklist(final),
      ...renderCompletionSections(final)
    );
  } else if (rejectFlag) {
    final = await runtime.reject(paused.runId, rejectReason);
    lines.push(
      "",
      RULE_SINGLE,
      "REJECTION",
      RULE_SINGLE,
      "",
      `Run REJECTED${rejectReason ? `: ${rejectReason}` : ""}.`,
      "Provider Execution did NOT occur and never will for this run."
    );
  } else {
    lines.push(
      "",
      "This process is exiting with the run still paused at AWAITING_APPROVAL --",
      "Lifecycle/Run state is in-memory only and does not survive past this process.",
      "Re-run with --approve to continue to Provider Execution, or --reject to abort",
      "without ever invoking it (both happen within one single run of this command)."
    );
  }

  const elapsedMs = Date.now() - startedAt;
  lines.push(
    "",
    RULE_SINGLE,
    "RUNTIME",
    RULE_SINGLE,
    "",
    statLine("Artifacts Persisted", String(final.artifacts.length)),
    statLine("Lifecycle", runtime.lifecycle.state.phase),
    statLine("Artifact Store", artifactStorePath),
    statLine("Execution Time", `${elapsedMs} ms`),
    "",
    RULE_DOUBLE,
    `ORAM RUN ${final.status}`,
    RULE_DOUBLE
  );

  console.log(lines.join("\n"));
  return 0;
}
