/**
 * `oram engineer <repository>` — the flagship command (Capability Sprint 15): runs every independent ORAM
 * engine sequentially, in pipeline order, directly (no @oram/runtime involved: no Lifecycle, no EngineRunner,
 * no ArtifactStore, no EventBus) and prints one operating-system-boot-sequence-style report of the whole
 * platform: Repository Analysis -> Engineering Knowledge -> Engineering Reasoning -> Engineering Planning ->
 * Engineering Missions -> Implementation Requests -> Execution Planning -> Implementation Executor ->
 * Recommendation Engine -> Reflection Engine -> Engineering Memory -> Adaptive Decision Engine -> Pull
 * Request Engine -> Publisher Engine (Capability Sprint 20 -- a deterministic PublishRecord via the
 * always-dry-run MemoryPublisher; nothing is ever really published to GitHub).
 *
 * Pure orchestration only -- no engine logic is duplicated here. Two stages the boot checklist doesn't name
 * still run between Implementation Executor and Recommendation, exactly as `oram decide`/`oram history`
 * already do: Provider Execution (whose patches are Validation's input) and Validation (whose ValidationResult
 * is Recommendation's input). They're internal plumbing of this command's pipeline, not separately-billed
 * checklist stages -- the Sprint's own twelve-engine sequence is what the report displays.
 *
 * CONCRETE LIMITATIONS (disclosed here, not hidden -- both inherited unchanged from the commands this one
 * composes):
 *   - Exactly like `oram execute`, the Implementation Executor runs with its default MemoryAdapter: every
 *     "execution" is a deterministic in-memory simulation touching neither git nor the filesystem nor any
 *     shell command.
 *   - Exactly like `oram history`/`oram decide`, nothing persists a MemoryStore across process invocations,
 *     so Engineering Memory records exactly this run into a fresh store and the Adaptive Decision Engine's
 *     `previousRun` is honestly always null today (the just-recorded snapshot IS this run, not a previous
 *     one, so passing it would be dishonest). `checkRepeatedFailure` (@oram/engines'
 *     adaptive-decision/analysis/rules.ts) is real and fully exercised by that package's own test suite; it
 *     simply has nowhere durable to read a real previous run FROM yet.
 *
 * Does not modify @oram/engines in any way -- only imports and calls its existing, already-tested pure
 * functions/classes.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  buildRepositoryAnalysis,
  buildEngineeringKnowledge,
  buildEngineeringReasoning,
  buildEngineeringPlan,
  buildMissionGraph,
  buildImplementationRequests,
  buildExecutionPlans,
  executeAll,
  runProviderExecutionAll,
  validateAll,
  buildRecommendationSet,
  buildReflectionReport,
  MemoryEngine,
  buildEngineeringDecision,
  buildPullRequestProposal,
  buildPublishRecord,
} from "@oram/engines";
import { renderEngineerReport } from "../report/renderEngineerReport";
import { printCliError } from "../errors";

const USAGE = "oram engineer <repository>";

export async function engineerCommand(args: string[]): Promise<number> {
  const [rawPath] = args;

  if (!rawPath) {
    printCliError("missing required argument <repository>", USAGE);
    return 1;
  }

  const targetPath = path.resolve(rawPath);

  if (!existsSync(targetPath)) {
    printCliError(`repository not found at "${targetPath}"`, USAGE);
    return 1;
  }

  const startedAt = Date.now();

  // 1-7: Repository Analysis through Execution Planning -- each stage consumes exactly the previous one's output.
  const analysis = buildRepositoryAnalysis(targetPath);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);

  // 8: Implementation Executor (in-memory simulation -- see this file's header), then the two unnamed
  // plumbing stages (Provider Execution -> Validation) that produce Recommendation's input.
  executeAll(planSet);
  const providerResults = runProviderExecutionAll(planSet);
  const patches = providerResults.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);

  // 9-10: Recommendation Engine and Reflection Engine.
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);

  // 11: Engineering Memory -- records this run; the snapshot's validationScore is the report's "Repository Health".
  const memory = new MemoryEngine();
  const snapshot = memory.record({
    repositoryRoot: targetPath,
    analysis,
    knowledge,
    reasoning,
    plan,
    graph,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
  });

  // 12: Adaptive Decision Engine -- previousRun is honestly null (see this file's header).
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });

  // 13: Pull Request Engine -- a deterministic proposal artifact only; nothing is published.
  const proposal = buildPullRequestProposal({
    repositoryRoot: targetPath,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
    decision,
  });

  // 14: Publisher Engine -- always dry-run under MemoryPublisher; nothing is ever really published.
  const publishRecord = buildPublishRecord({ repositoryRoot: targetPath, proposal });

  const elapsedMs = Date.now() - startedAt;

  console.log(renderEngineerReport({ analysis, knowledge, reasoning, plan, snapshot, decision, proposal, publishRecord, elapsedMs }));
  return 0;
}
