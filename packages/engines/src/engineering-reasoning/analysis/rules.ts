/**
 * The 5 initial deterministic rules (Engineering Reasoning MVP). Each rule is a pure function of
 * EngineeringKnowledge returning zero or more partial Findings -- `id`/`kind`/`category` are injected
 * uniformly by detectFindings() below, one `kind`/`category` per rule, not repeated in every result.
 *
 * Every rule operates ONLY on EngineeringKnowledge's own already-derived structure (subsystems,
 * dependencyRelationships, and its existing missingEngineeringPractices/architecturalRisks findings) --
 * never on RepositoryAnalysis directly, and never a new filesystem read. Each rule is chosen specifically
 * because it reasons over MULTIPLE EngineeringKnowledge facts together (concentration across relationships,
 * escalation by structural context, per-subsystem correlation) -- not because it repeats a single fact
 * EngineeringKnowledge's own rules already reported.
 */

import type { EngineeringKnowledge } from "../../engineering-knowledge/analysis/types";
import { makeId } from "../../repository-analyzer/analysis/identity";
import type { Finding, FindingCategory, Severity } from "./types";
import type { Confidence } from "../../repository-analyzer/analysis/types";

type RuleResult = Omit<Finding, "id" | "kind" | "category">;

interface Rule {
  readonly kind: string;
  readonly category: FindingCategory;
  readonly check: (knowledge: EngineeringKnowledge) => RuleResult[];
}

function result(severity: Severity, confidence: Confidence, summary: string, evidence: string[], sourceFiles: string[], sourceIds: string[]): RuleResult {
  return { severity, confidence, summary, evidence, sourceFiles, sourceIds };
}

const RULES: ReadonlyArray<Rule> = [
  {
    // Rule 1: one subsystem concentrates most of the repository's detected technology surface.
    kind: "subsystem-concentration",
    category: "architectural-smell",
    check: (k) => {
      if (k.subsystems.length < 2 || k.dependencyRelationships.length < 3) return [];
      const total = k.dependencyRelationships.length;
      const counts = new Map<string, number>();
      for (const relationship of k.dependencyRelationships) counts.set(relationship.from, (counts.get(relationship.from) ?? 0) + 1);
      const findings: RuleResult[] = [];
      for (const subsystem of k.subsystems) {
        const count = counts.get(subsystem.id) ?? 0;
        const share = count / total;
        if (share > 0.6) {
          findings.push(
            result(
              "Medium",
              "Medium",
              `Subsystem \`${subsystem.path}\` concentrates ${count} of ${total} detected technology relationships (${Math.round(share * 100)}%) -- consider whether responsibilities should be split.`,
              [`${count} of ${total} dependencyRelationships attributed to ${subsystem.path}`],
              [],
              [subsystem.id, ...subsystem.relationshipIds]
            )
          );
        }
      }
      return findings;
    },
  },
  {
    // Rule 2: an API framework relationship exists with no automated testing framework at all -- untested
    // API surface is a materially worse gap than untested code in general, so this escalates rather than
    // repeating EngineeringKnowledge's own flat "no testing framework" finding verbatim.
    kind: "untested-api-surface",
    category: "testing-gap",
    check: (k) => {
      const missingTesting = k.missingEngineeringPractices.find((f) => f.value === "No automated testing framework was detected.");
      const apiRelationship = k.dependencyRelationships.find((r) => r.kind === "uses-api-framework");
      if (!missingTesting || !apiRelationship) return [];
      return [
        result(
          "High",
          "Medium",
          `An API framework (${apiRelationship.to}) is in use with no automated testing framework detected -- untested API surface is a higher-risk gap than untested code in general.`,
          [missingTesting.value, `API framework relationship: ${apiRelationship.from} -> ${apiRelationship.to}`],
          [...missingTesting.sourceFiles, ...apiRelationship.evidence],
          [missingTesting.id, apiRelationship.id]
        ),
      ];
    },
  },
  {
    // Rule 3: no CI/CD configuration in a multi-subsystem (monorepo-like) repository -- more surface is left
    // unverified than in a single-package repository, so this escalates severity by structural context rather
    // than just forwarding EngineeringKnowledge's own flat "no CI/CD" finding.
    kind: "unverified-monorepo",
    category: "cicd-gap",
    check: (k) => {
      const missingCicd = k.missingEngineeringPractices.find((f) => f.value === "No CI/CD configuration was detected.");
      if (!missingCicd || k.subsystems.length < 2) return [];
      return [
        result(
          "High",
          "Medium",
          `No CI/CD configuration was detected across a ${k.subsystems.length}-subsystem repository -- more surface area is left unverified than in a single-package repository.`,
          [missingCicd.value, `${k.subsystems.length} subsystems detected`],
          [...missingCicd.sourceFiles],
          [missingCicd.id, ...k.subsystems.map((s) => s.id)]
        ),
      ];
    },
  },
  {
    // Rule 4: per-subsystem correlation -- a specific subsystem exposes an API framework with no
    // authentication library attributed to IT specifically. More precise than EngineeringKnowledge's own
    // whole-repository check, which cannot see which subsystem (if any) is actually unauthenticated.
    kind: "subsystem-api-without-auth",
    category: "security-concern",
    check: (k) => {
      const findings: RuleResult[] = [];
      for (const subsystem of k.subsystems) {
        const owned = k.dependencyRelationships.filter((r) => subsystem.relationshipIds.includes(r.id));
        const apiRelationships = owned.filter((r) => r.kind === "uses-api-framework");
        const hasAuth = owned.some((r) => r.kind === "uses-auth");
        if (apiRelationships.length === 0 || hasAuth) continue;
        findings.push(
          result(
            "Medium",
            "Medium",
            `Subsystem \`${subsystem.path}\` exposes an API framework (${apiRelationships.map((r) => r.to).join(", ")}) with no authentication library attributed specifically to this subsystem.`,
            apiRelationships.map((r) => `${r.from} -> ${r.to}`),
            apiRelationships.flatMap((r) => r.evidence),
            [subsystem.id, ...apiRelationships.map((r) => r.id)]
          )
        );
      }
      return findings;
    },
  },
  {
    // Rule 5: most subsystems have no technology attributed to them specifically -- a signal that
    // responsibilities or dependencies are undeclared/opaque at the module level, only visible once
    // subsystems are compared to each other (not from any single subsystem in isolation).
    kind: "opaque-subsystems",
    category: "maintainability-issue",
    check: (k) => {
      if (k.subsystems.length < 2) return [];
      const opaque = k.subsystems.filter((s) => s.relationshipIds.length === 0);
      if (opaque.length / k.subsystems.length < 0.5) return [];
      return [
        result(
          "Low",
          "Low",
          `${opaque.length} of ${k.subsystems.length} subsystems have no technology attributed to them specifically (${opaque.map((s) => s.path).join(", ")}) -- responsibilities or dependencies may be undeclared at the module level.`,
          opaque.map((s) => `${s.path}: 0 attributed relationships`),
          [],
          opaque.map((s) => s.id)
        ),
      ];
    },
  },
];

export function detectFindings(knowledge: EngineeringKnowledge): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    for (const partial of rule.check(knowledge)) {
      findings.push({ id: makeId(rule.kind, partial.summary), kind: rule.kind, category: rule.category, ...partial });
    }
  }
  return findings;
}
