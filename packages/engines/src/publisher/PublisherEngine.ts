/**
 * PublisherEngine -- converts one already-computed PullRequestProposal into one deterministic PublishRecord.
 * `publish()` is the whole job. Pure and deterministic under the default MemoryPublisher: no real git, no
 * real GitHub API, no LLM, no filesystem writes, no shell commands -- this class only assembles a record
 * from data @oram/engines has already produced, and (under MemoryPublisher) simulates what a real publish
 * would look like. This is the "Publisher" half of Lifecycle.ts's own PUBLISHING phase mapping; the
 * "Pull Request Generator" half is ../pull-request/PullRequestEngine.ts.
 *
 * `createPublisherEngine()` at the bottom of this file is the EngineDescriptor factory every prior stage
 * provides -- co-located here for the same reason every prior Sprint's own wrapper gave: this Sprint's own
 * spec names the core worker class itself `PublisherEngine`, leaving no distinct, non-redundant name for a
 * separate wrapper file.
 *
 * CONCRETE LIMITATION -- the same gaps disclosed in every prior stage's own EngineDescriptor wrapper:
 *
 *   1. EngineDescriptor.run() receives a RunArtifacts view of THIS run's persisted artifacts (Capability
 *      Sprint 17), and this engine declares its one upstream dependency explicitly
 *      (PUBLISHER_UPSTREAM_ARTIFACTS below). When it is available for the current run, it is consumed
 *      directly -- no recomputation. When it is NOT available, the pre-existing, explicitly documented
 *      fallback applies: recompute the entire upstream pipeline from scratch via buildRepositoryAnalysis()
 *      + ... + buildPullRequestProposal() -- same deterministic result under MemoryProvider/MemoryAdapter,
 *      extra CPU, no Runtime change. A caller holding the real upstream PullRequestProposal can bypass
 *      everything via the optional `loadInputs` parameter below.
 *
 *   2. Real git/GitHub operations remain unimplemented (GitHubPublisher, ../publishers/RemotePublishers.ts,
 *      throws NotImplementedYetError unconditionally) -- MemoryPublisher (always dry-run) is the only client
 *      this engine's default ever uses. See ../analysis/types.ts's own header comment for why this is a
 *      structural limitation (no file-level diff data exists yet), not only a safety one.
 *
 *   3. @oram/events' PRCreatedEvent requires a `missionId`, which this pipeline does not carry (the same gap
 *      ReflectionEngine.ts already disclosed and solved for ReflectionCompletedEvent) -- filled with the
 *      same fixed sentinel, UNKNOWN_MISSION_ID = "unknown", rather than a fabricated id.
 */

import type { EngineDescriptor, ArtifactRef, RuntimeContext, RunArtifacts, ArtifactDependency } from "@oram/runtime";
import type { OramEvent } from "@oram/events";
import type { PullRequestProposal } from "../pull-request/analysis/types";
import { buildRepositoryAnalysis } from "../repository-analyzer/analysis/build-analysis";
import { buildEngineeringKnowledge } from "../engineering-knowledge/analysis/build-knowledge";
import { buildEngineeringReasoning } from "../engineering-reasoning/analysis/build-reasoning";
import { buildEngineeringPlan } from "../engineering-planning/analysis/build-plan";
import { buildMissionGraph } from "../engineering-missions/analysis/build-mission-graph";
import { buildImplementationRequests } from "../implementation-requests/analysis/build-implementation-requests";
import { buildExecutionPlans } from "../execution-planning/analysis/build-execution-plans";
import { runAll as runProviderExecutionAll } from "../provider-execution/ProviderExecutionEngine";
import { validateAll } from "../validation/ValidationEngine";
import { buildRecommendationSet } from "../recommendation/analysis/build-recommendations";
import { buildReflectionReport } from "../reflection/analysis/build-reflection";
import { buildEngineeringDecision } from "../adaptive-decision/analysis/build-decision";
import { buildPullRequestProposal } from "../pull-request/analysis/build-pull-request-proposal";
import { buildPublishRecord } from "./analysis/build-publish-record";
import { MemoryPublisher } from "./publishers/MemoryPublisher";
import type { PublisherClient } from "./publishers/types";
import type { PublisherInputs, PublishRecord } from "./analysis/types";

/** See this file's own CONCRETE LIMITATION #3 for why PRCreatedEvent's required `missionId` is filled with this fixed sentinel rather than a fabricated id. */
const UNKNOWN_MISSION_ID = "unknown";

export class PublisherEngine {
  constructor(private readonly client: PublisherClient = new MemoryPublisher()) {}

  /** Assembles one PublishRecord from a PublisherInputs bundle. Pure and deterministic under the default MemoryPublisher -- see ./analysis/build-publish-record.ts. */
  publish(inputs: PublisherInputs): PublishRecord {
    return buildPublishRecord(inputs, this.client);
  }
}

function defaultLoadInputs(context: RuntimeContext): PublisherInputs {
  const analysis = buildRepositoryAnalysis(context.repositoryRoot);
  const knowledge = buildEngineeringKnowledge(analysis);
  const reasoning = buildEngineeringReasoning(knowledge);
  const plan = buildEngineeringPlan(reasoning);
  const graph = buildMissionGraph(plan);
  const requestSet = buildImplementationRequests(graph);
  const planSet = buildExecutionPlans(requestSet);
  const results = runProviderExecutionAll(planSet);
  const patches = results.flatMap((result) => result.steps.map((step) => step.patch));
  const validationResult = validateAll(patches);
  const recommendationSet = buildRecommendationSet(validationResult);
  const reflectionReport = buildReflectionReport(validationResult, recommendationSet);
  const decision = buildEngineeringDecision({ reflectionReport, validationResult, recommendationSet, previousRun: null });
  const proposal = buildPullRequestProposal({
    repositoryRoot: context.repositoryRoot,
    requestSet,
    planSet,
    validationResult,
    recommendationSet,
    reflectionReport,
    decision,
  });

  return { repositoryRoot: context.repositoryRoot, proposal };
}

/** The one upstream artifact this engine consumes from the current run, declared explicitly (Sprint 17's convention). */
export const PUBLISHER_UPSTREAM_ARTIFACTS: ReadonlyArray<ArtifactDependency> = [{ stage: "pull-request", name: "pull-request-proposal" }];

/**
 * Sprint 17 artifact path: loads PublisherInputs from the current run's persisted artifacts.
 *   - The upstream artifact is available -> the loaded inputs (no recomputation).
 *   - It is not available -> null; the caller applies the pre-existing, documented recompute fallback.
 * (Only one dependency exists here, so there is no "partial set" case to guard against, unlike engines with
 * multiple declared dependencies -- see adaptive-decision/pull-request's own loadXFromRun() for that case.)
 */
export async function loadPublisherInputsFromRun(context: RuntimeContext, artifacts: RunArtifacts): Promise<PublisherInputs | null> {
  if (!(await artifacts.has("pull-request", "pull-request-proposal"))) return null;
  const proposal = await artifacts.require<PullRequestProposal>("pull-request", "pull-request-proposal");
  return { repositoryRoot: context.repositoryRoot, proposal };
}

export function createPublisherEngine(
  loadInputs: (context: RuntimeContext) => PublisherInputs = defaultLoadInputs,
  client: PublisherClient = new MemoryPublisher()
): EngineDescriptor<PublishRecord> {
  const engine = new PublisherEngine(client);
  return {
    stage: "publisher",
    artifactName: "publish-record",
    async run(context: RuntimeContext, artifacts?: RunArtifacts): Promise<PublishRecord> {
      const inputs = (artifacts && (await loadPublisherInputsFromRun(context, artifacts))) ?? loadInputs(context);
      return engine.publish(inputs);
    },
    buildEvent(runId: string, output: PublishRecord, _ref: ArtifactRef): OramEvent {
      return {
        type: "PRCreated",
        runId,
        timestamp: new Date().toISOString(),
        missionId: UNKNOWN_MISSION_ID,
        url: output.pullRequestUrl,
        dryRun: output.dryRun,
      };
    },
  };
}
