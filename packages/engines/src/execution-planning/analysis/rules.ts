/**
 * The per-Request -> ExecutionPlan transformation (Execution Planning MVP). Pure template lookups over an
 * already-computed ImplementationRequestSet -- no filesystem, no Runtime, no Providers, no AI.
 *
 * Sprint 21 provenance addition: sourceFiles are copied from each ImplementationRequest into its ExecutionPlan.
 * They remain evidence/context. This stage still does not invent or claim an actual edit target list.
 */

import { makeId } from "../../repository-analyzer/analysis/identity";
import type { ImplementationRequest } from "../../implementation-requests/analysis/types";
import type { ExecutionAction, ExecutionDependency, ExecutionPlan, ExecutionStep } from "./types";

interface StepTemplate {
  readonly action: ExecutionAction;
  readonly description: string;
}

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
    sourceFiles: request.sourceFiles,
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
