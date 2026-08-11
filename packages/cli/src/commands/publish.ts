/**
 * `oram publish <path>` — runs the complete Repository Analysis -> ... -> Pull Request Engine -> Publisher
 * Engine pipeline directly (no @oram/runtime involved: no Lifecycle, no EngineRunner, no ArtifactStore, no
 * EventBus) and prints a presentation-ready console report of the resulting PublishRecord, including every
 * simulated publishing stage. Same shape as pull-request.ts, one pipeline stage further down.
 *
 * SAFETY (the Sprint's own hard rule, restated where it's enforced): this command NEVER creates a real
 * GitHub pull request, calls NO GitHub API, runs NO git command, writes NO file, and invokes NO LLM. The
 * default Publisher (MemoryPublisher) is always dry-run: every stage is a deterministic simulation.
 *
 * CONCRETE LIMITATION (inherited unchanged from pull-request.ts/decide.ts): nothing persists a MemoryStore
 * across process invocations, so the decision's `previousRun` is honestly always null today. Real
 * git/GitHub operations remain unimplemented (see @oram/engines' GitHubPublisher, which throws
 * NotImplementedYetError unconditionally and is never this command's default).
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
  runProviderExecutionAll,
  validateAll,
  buildRecommendationSet,
  buildReflectionReport,
  buildEngineeringDecision,
  buildPullRequestProposal,
  buildPublishRecord,
} from "@oram/engines";
import { renderPublishReport } from "../report/renderPublishReport";
import { printCliError } from "../errors";

const USAGE = "oram publish <path>";

export async function publishCommand(args: string[]): Promise<number> {
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

  const startedAt = Date.now();
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
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });
  const proposal = buildPullRequestProposal({
    repositoryRoot: targetPath,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
    decision,
  });
  const record = buildPublishRecord({ repositoryRoot: targetPath, proposal });
  const elapsedMs = Date.now() - startedAt;

  console.log(renderPublishReport({ analysis, knowledge, reasoning, plan, proposal, record, elapsedMs }));
  return 0;
}
