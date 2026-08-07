/**
 * buildEngineeringDecision() — evaluates every policy (./rules.ts) against one DecisionInputs bundle and
 * returns one EngineeringDecision. Every field except `id`/`timestamp` is a pure function of the matched
 * DecisionOutcome; `id`/`timestamp` are the one place this stage cannot be a pure function of its inputs
 * alone -- a decision's identity is inherently tied to WHEN it was made, not just WHAT it decided, the exact
 * same reasoning memory/analysis/build-run-snapshot.ts already documents for RunSnapshot.runId (and, before
 * that, @oram/runtime's own Runtime.ts#generateRunId()). A small in-process counter is appended so two
 * decisions built within the same millisecond never collide.
 */

import { evaluateDecision, policyId } from "./rules";
import type { DecisionInputs, EngineeringDecision } from "./types";

let decisionSequence = 0;

function generateDecisionId(): string {
  decisionSequence += 1;
  return `decision:${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "")}-${decisionSequence}`;
}

export function buildEngineeringDecision(inputs: DecisionInputs): EngineeringDecision {
  const outcome = evaluateDecision(inputs);

  return {
    id: generateDecisionId(),
    timestamp: new Date().toISOString(),
    decisionType: outcome.decisionType,
    reason: outcome.reason,
    confidence: outcome.confidence,
    riskLevel: outcome.riskLevel,
    nextAction: outcome.nextAction,
    evidenceIds: outcome.evidenceIds,
    policyIds: [policyId(outcome.kind)],
  };
}
