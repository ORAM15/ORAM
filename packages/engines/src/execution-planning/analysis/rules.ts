/**
 * The per-Request -> ExecutionPlan transformation (Execution Planning MVP). Pure template lookups over an
 * already-computed ImplementationRequestSet -- no filesystem, no Runtime, no Providers, no AI. Steps
 * describe what should happen; nothing here does it.
 *
 * CONCRETE LIMITATION -- READ BEFORE TRUSTING STEP CONTENT OR DEPENDENCIES AS DISCOVERED FACTS
 *
 *   1. The middle (creation/modification) step is chosen by looking up `request.title` in TITLE_STEP -- a
 *      small, fully known, fixed set of exact strings Engineering Planning's 3 mapping rules always produce
 *      today (see engineering-planning/analysis/rules.ts). This is NOT a structural dispatch on Mission kind:
 *      Sprint 6 (implementation-requests) never carried `Mission.kind` through onto `ImplementationRequest`,
 *      so `title` is the closest stable, deterministic key still available at this stage. Any future Mission
 *      kind (a new title this table doesn't recognize) falls back to DEFAULT_STEP, a generic-but-honest
 *      template, rather than guessing.
 *
 *   2. `dependencyIds` are a single linear chain over `ImplementationRequestSet.requests`' own existing order
 *      -- exactly the same honest-default reasoning engineering-missions/analysis/rules.ts used one stage up
 *      for the identical problem (no real dependency signal available: Sprint 6 didn't carry MissionGraph's
 *      `dependencyIds`/`MissionDependency` edges through to ImplementationRequest either). Not a claim that
 *      plan N is technically blocked on plan N-1; a default sequencing over already-deterministic order.
 *
 *   Both are disclosed here rather than presented as discovered structure.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ImplementationRequest } from "../../implementation-requests/analysis/types";
import type { ExecutionAction, ExecutionDependency, ExecutionPlan, ExecutionStep } from "./types";

interface StepTemplate {
  readonly action: ExecutionAction;
  readonly description: string;
}

/** Looked up by ImplementationRequest.title -- see this file's own CONCRETE LIMITATION note (#1) for why title, not a dropped `kind` field. */
const TITLE_STEP: Readonly<Record<string, StepTemplate>> = {
  "Improve Subsystem Documentation": {
    action: "CREATE_FILE",
    description: "Create or update documentation describing subsystem responsibilities.",
  },
  "Increase Test Coverage": {
    action: "CREATE_FILE",
    description: "Create missing automated tests covering the identified gap.",
  },
  "Refactor Circular Dependencies": {
    action: "MODIFY_FILE",
    description: "Refactor the affected modules to remove the circular dependency.",
  },
};

const DEFAULT_STEP: StepTemplate = {
  action: "MODIFY_FILE",
  description: "Implement the changes described in this request's acceptance criteria.",
};

function buildSteps(request: ImplementationRequest): ExecutionStep[] {
  const middle = TITLE_STEP[request.title] ?? DEFAULT_STEP;
  const templates: ReadonlyArray<StepTemplate> = [
    { action: "CREATE_BRANCH", description: "Create a working branch for this request." },
    middle,
    { action: "RUN_TESTS", description: "Run the full test suite to validate the changes." },
    { action: "COMMIT", description: "Commit the validated changes." },
  ];
  return templates.map((template, index) => ({
    id: makeId("execution-step", `${request.id}:${index}`),
    order: index,
    action: template.action,
    description: template.description,
  }));
}

function planId(request: ImplementationRequest): string {
  return makeId("execution-plan", request.id);
}

export function buildExecutionPlanNodes(requests: ReadonlyArray<ImplementationRequest>): {
  plans: ExecutionPlan[];
  dependencies: ExecutionDependency[];
} {
  const plans: ExecutionPlan[] = requests.map((request, index) => ({
    id: planId(request),
    requestId: request.id,
    title: request.title,
    priority: request.priority,
    steps: buildSteps(request),
    dependencyIds: index === 0 ? [] : [planId(requests[index - 1]!)],
    order: index,
  }));

  const dependencies: ExecutionDependency[] = [];
  for (let index = 1; index < plans.length; index += 1) {
    const plan = plans[index]!;
    const dependsOn = plans[index - 1]!;
    dependencies.push({
      id: makeId("execution-dependency", `${dependsOn.id}->${plan.id}`),
      planId: plan.id,
      dependsOnPlanId: dependsOn.id,
    });
  }

  return { plans, dependencies };
}
