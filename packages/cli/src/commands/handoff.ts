/**
 * `oram handoff <path>` — Capability Sprint 17's diagnostic/demo command: proves, against a real repository,
 * that ORAM's Runtime artifact handoff works end to end. It runs the upstream pipeline ONCE (the same pure
 * functions every other command uses), persists each stage's output as a run-scoped artifact in a real
 * FileSystemArtifactStore (in a temporary directory, removed afterwards -- nothing is written into the
 * target repository), and then invokes the Adaptive Decision Engine and the Pull Request Engine through the
 * real EngineRunner. Both engines consume the persisted artifacts of THIS run via RunArtifacts -- their
 * recompute fallbacks are wired to throw, so if either engine recomputed anything, this command would fail
 * loudly instead of printing its report. That is the proof, not a claim.
 *
 * No GitHub, no git, no LLM, no writes to the target repository -- the store lives in a temp dir for the
 * duration of the demo only.
 */
import { existsSync } from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createRuntimeContext,
  InMemoryEventBus,
  BufferedLogger,
  InMemoryProviderRegistry,
  FileSystemArtifactStore,
  EngineRunner,
} from "@oram/runtime";
import {
  buildRepositoryAnalysis,
  buildEngineeringKnowledge,
  buildEngineeringReasoning,
  buildEngineeringPlan,
  buildMissionGraph,
  buildImplementationRequests,
  buildExecutionPlans,
  runProviderExecutionAll,
  validateAll,
  buildRecommendationSet,
  buildReflectionReport,
  createAdaptiveDecisionEngine,
  createPullRequestEngine,
  DECISION_UPSTREAM_ARTIFACTS,
  PULL_REQUEST_UPSTREAM_ARTIFACTS,
  type EngineeringDecision,
  type PullRequestProposal,
} from "@oram/engines";
import { RULE_DOUBLE, RULE_SINGLE, statLine } from "../report/shared";
import { printCliError } from "../errors";

const USAGE = "oram handoff <path>";

export async function handoffCommand(args: string[]): Promise<number> {
  const [rawPath] = args;

  if (!rawPath) {
    printCliError("missing required argument <path>", USAGE);
    return 1;
  }

  const targetPath = path.resolve(rawPath);

  if (!existsSync(targetPath)) {
    printCliError(`repository not found at "${targetPath}"`, USAGE);
    return 1;
  }

  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "oram-handoff-"));
  try {
    const store = new FileSystemArtifactStore(baseDir);
    const context = createRuntimeContext({
      repositoryRoot: targetPath,
      logger: new BufferedLogger(),
      eventBus: new InMemoryEventBus(),
      artifactStore: store,
      providerRegistry: new InMemoryProviderRegistry(),
    });
    const runner = new EngineRunner(context);
    const runId = `RUN-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}`;

    const lines: string[] = [RULE_DOUBLE, "ORAM Runtime Artifact Handoff", RULE_DOUBLE, "", statLine("Run", runId), ""];

    // Producer stages: the upstream pipeline runs ONCE; each stage's output is persisted as a run-scoped artifact.
    lines.push(RULE_SINGLE, "Producer Stages (each artifact persisted once)", RULE_SINGLE, "");
    const analysis = buildRepositoryAnalysis(targetPath);
    const knowledge = buildEngineeringKnowledge(analysis);
    const reasoning = buildEngineeringReasoning(knowledge);
    const plan = buildEngineeringPlan(reasoning);
    const graph = buildMissionGraph(plan);
    const requestSet = buildImplementationRequests(graph);
    const planSet = buildExecutionPlans(requestSet);
    const providerResults = runProviderExecutionAll(planSet);
    const patches = providerResults.flatMap((result) => result.steps.map((step) => step.patch));
    const validationResult = validateAll(patches);
    const recommendationSet = buildRecommendationSet(validationResult);
    const reflectionReport = buildReflectionReport(validationResult, recommendationSet);

    const produced: ReadonlyArray<readonly [string, string, unknown]> = [
      ["repository-intelligence", "repository-analysis", analysis],
      ["engineering-knowledge", "engineering-knowledge", knowledge],
      ["engineering-reasoning", "engineering-reasoning", reasoning],
      ["engineering-planning", "engineering-planning", plan],
      ["engineering-missions", "engineering-missions", graph],
      ["implementation-requests", "implementation-requests", requestSet],
      ["execution-planning", "execution-planning", planSet],
      ["provider-execution", "provider-execution", providerResults],
      ["validation", "validation", validationResult],
      ["recommendation", "recommendation", recommendationSet],
      ["reflection", "reflection", reflectionReport],
    ];
    for (const [stage, name, data] of produced) {
      await store.write({ runId, stage, name }, data);
      lines.push(`  [artifact] ${stage}/${name}`);
    }

    // Consumer stages: run through the REAL EngineRunner; fallbacks throw, so consuming artifacts is proven,
    // not assumed -- if either engine recomputed, this command would fail instead of printing this report.
    lines.push("", RULE_SINGLE, "Consumer Stages (artifacts consumed -- recompute fallback forbidden)", RULE_SINGLE, "");

    const decisionArtifact = await runner.run(
      runId,
      createAdaptiveDecisionEngine(() => {
        throw new Error("Adaptive Decision Engine attempted to recompute -- artifact handoff failed");
      })
    );
    const decision = decisionArtifact.payload as EngineeringDecision;
    lines.push(
      `  [consume] adaptive-decision <- ${DECISION_UPSTREAM_ARTIFACTS.map((d) => d.stage).join(", ")}`,
      `  [artifact] adaptive-decision/engineering-decision`,
      `             Decision: ${decision.decisionType} (risk ${decision.riskLevel})`,
      ""
    );

    const proposalArtifact = await runner.run(
      runId,
      createPullRequestEngine(() => {
        throw new Error("Pull Request Engine attempted to recompute -- artifact handoff failed");
      })
    );
    const proposal = proposalArtifact.payload as PullRequestProposal;
    lines.push(
      `  [consume] pull-request <- ${PULL_REQUEST_UPSTREAM_ARTIFACTS.map((d) => d.stage).join(", ")}`,
      `  [artifact] pull-request/pull-request-proposal`,
      `             Title: ${proposal.title}`,
      `             Branch: ${proposal.branchName ?? "(none -- no PR should be created)"}`
    );

    const stored = await store.list(runId);
    lines.push(
      "",
      RULE_SINGLE,
      "Result",
      RULE_SINGLE,
      "",
      statLine("Artifacts Persisted", String(stored.length)),
      statLine("Recomputation", "NONE (fallbacks were forbidden)"),
      statLine("Same-Run Scoping", `every artifact keyed by ${runId.slice(0, 14)}...`),
      "",
      "Every consumer stage above read its inputs from the ArtifactStore",
      "for this run -- nothing upstream was executed twice.",
      "",
      RULE_DOUBLE,
    );

    console.log(lines.join("\n"));
    return 0;
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true });
  }
}
