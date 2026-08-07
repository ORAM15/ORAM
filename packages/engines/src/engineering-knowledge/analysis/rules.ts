/**
 * Deterministic rule tables for architecturalStrengths / architecturalRisks / technicalDebtAreas /
 * missingEngineeringPractices. Each rule is a pure function of RepositoryAnalysis returning a partial
 * Detection<string> (or null if its condition doesn't hold) -- every rule's evidence/sourceFiles/confidence
 * trace back to fields RepositoryAnalysis already computed, never a new filesystem read. `id`/`kind` are
 * injected uniformly by runRules() below (one `kind` per table), not repeated in every rule.
 *
 * `sourceDetectionIds` records exactly which RepositoryAnalysis Detections triggered each finding -- these
 * conclusions are derived FROM other Detections, unlike RepositoryAnalysis's own base Detections (which are
 * derived from raw files/manifests, correctly represented by sourceFiles alone).
 *
 * Rules deliberately excluded, and why:
 *   - "2+ database technologies detected" was considered and dropped: an ORM (e.g. SQLAlchemy, Prisma) very
 *     commonly co-occurs with its own underlying driver (e.g. psycopg2, pg) as two separate dependency
 *     signatures for the SAME actual database -- flagging that pairing as a "risk" would be a false positive
 *     on a large fraction of real, well-built repositories, not a genuine signal.
 */

import type { RepositoryAnalysis, Detection } from "../../repository-analyzer/analysis/types";
import { makeId } from "../../repository-analyzer/analysis/identity";

type RuleResult = Omit<Detection<string>, "id" | "kind">;
type Rule = (analysis: RepositoryAnalysis) => RuleResult | null;

function evidenceFrom(detections: ReadonlyArray<Detection<unknown>>): { evidence: string[]; sourceFiles: string[]; sourceDetectionIds: string[] } {
  const evidence: string[] = [];
  const sourceFiles: string[] = [];
  const sourceDetectionIds: string[] = [];
  for (const detection of detections) {
    evidence.push(...detection.evidence);
    sourceFiles.push(...detection.sourceFiles);
    sourceDetectionIds.push(detection.id);
  }
  return { evidence: [...new Set(evidence)], sourceFiles: [...new Set(sourceFiles)], sourceDetectionIds: [...new Set(sourceDetectionIds)] };
}

const ORM_PATTERN = /ORM|ODM|Prisma|SQLAlchemy|Sequelize|TypeORM|Drizzle|Knex|Mongoose/i;

const STRENGTH_RULES: ReadonlyArray<Rule> = [
  (a) =>
    a.testingFrameworks.length > 0
      ? { value: `Automated testing is configured (${a.testingFrameworks.map((d) => d.value).join(", ")}).`, confidence: "High", ...evidenceFrom(a.testingFrameworks) }
      : null,
  (a) =>
    a.ciCdSystems.length > 0
      ? { value: `Continuous integration is configured (${a.ciCdSystems.map((d) => d.value).join(", ")}).`, confidence: "High", ...evidenceFrom(a.ciCdSystems) }
      : null,
  (a) =>
    a.docker.value
      ? {
          value: "Containerization (Docker) supports reproducible builds/deployments.",
          confidence: a.docker.confidence,
          evidence: a.docker.evidence,
          sourceFiles: a.docker.sourceFiles,
          sourceDetectionIds: [a.docker.id],
        }
      : null,
  (a) =>
    a.primaryLanguages.some((entry) => entry.value === "TypeScript")
      ? {
          value: "Static typing (TypeScript) is used, reducing a class of runtime errors.",
          confidence: "Medium",
          ...evidenceFrom(a.primaryLanguages.filter((entry) => entry.value === "TypeScript")),
        }
      : null,
  (a) => {
    const orm = a.databaseTechnologies.filter((d) => ORM_PATTERN.test(d.value));
    return orm.length > 0
      ? { value: `An ORM/ODM is used (${orm.map((d) => d.value).join(", ")}), reducing raw-query risk and improving maintainability.`, confidence: "Medium", ...evidenceFrom(orm) }
      : null;
  },
  (a) => {
    const pattern = a.architecturalPatterns.find((p) => p.value !== "Unknown" && p.confidence === "High");
    return pattern
      ? {
          value: `A recognizable architectural pattern was detected (${pattern.value}), suggesting intentional structural organization.`,
          confidence: "High",
          evidence: pattern.evidence,
          sourceFiles: pattern.sourceFiles,
          sourceDetectionIds: [pattern.id],
        }
      : null;
  },
  (a) =>
    a.environmentFiles.length > 0
      ? { value: "Configuration is externalized via environment files rather than hardcoded.", confidence: "Medium", ...evidenceFrom(a.environmentFiles) }
      : null,
];

const RISK_RULES: ReadonlyArray<Rule> = [
  (a) =>
    a.apiFrameworks.length > 0 && a.authenticationLibraries.length === 0
      ? {
          value: `An API framework (${a.apiFrameworks.map((d) => d.value).join(", ")}) was detected with no authentication library evidence -- verify access control is implemented.`,
          confidence: "Medium",
          ...evidenceFrom(a.apiFrameworks),
        }
      : null,
  (a) =>
    a.cloudProviders.length > 0 && a.deploymentTargets.length === 0 && !a.docker.value
      ? {
          value: `Cloud SDK dependencies were detected (${a.cloudProviders.map((d) => d.value).join(", ")}) but no deployment target or containerization evidence was found -- the deployment story is unclear.`,
          confidence: "Low",
          ...evidenceFrom(a.cloudProviders),
        }
      : null,
  (a) =>
    a.monorepo.value === true && a.ciCdSystems.length === 0
      ? {
          value: "A monorepo was detected with no CI/CD configuration -- changes may not be automatically verified across workspace packages.",
          confidence: "Medium",
          evidence: a.monorepo.evidence,
          sourceFiles: a.monorepo.sourceFiles,
          sourceDetectionIds: [a.monorepo.id],
        }
      : null,
];

const DEBT_RULES: ReadonlyArray<Rule> = [
  (a) => {
    const npmManifest = a.dependencySummary.manifests.find((m) => m.ecosystem === "npm");
    const hasNpmLockfile = a.packageManagers.some((d) => ["npm", "yarn", "pnpm", "bun"].includes(d.value));
    return npmManifest && !hasNpmLockfile
      ? {
          value: "An npm-ecosystem manifest was found with no matching lockfile -- installs are not guaranteed reproducible.",
          confidence: "Medium",
          evidence: [`${npmManifest.path} present, no npm/yarn/pnpm/bun lockfile detected`],
          sourceFiles: [npmManifest.path],
          sourceDetectionIds: [],
        }
      : null;
  },
  (a) => {
    const pipManifest = a.dependencySummary.manifests.find((m) => m.ecosystem === "pip");
    const hasPipLock = a.packageManagers.some((d) => ["poetry", "pipenv"].includes(d.value));
    return pipManifest && !hasPipLock
      ? {
          value: "A Python dependency manifest was found with no poetry/Pipenv lockfile -- installs are not guaranteed reproducible.",
          confidence: "Low",
          evidence: [`${pipManifest.path} present, no poetry.lock/Pipfile.lock detected`],
          sourceFiles: [pipManifest.path],
          sourceDetectionIds: [],
        }
      : null;
  },
];

const MISSING_PRACTICE_RULES: ReadonlyArray<Rule> = [
  (a) =>
    a.testingFrameworks.length === 0
      ? { value: "No automated testing framework was detected.", confidence: "Medium", evidence: ["no recognized test-framework dependency found"], sourceFiles: [], sourceDetectionIds: [] }
      : null,
  (a) =>
    a.ciCdSystems.length === 0
      ? { value: "No CI/CD configuration was detected.", confidence: "Medium", evidence: ["no recognized CI/CD file found"], sourceFiles: [], sourceDetectionIds: [] }
      : null,
  (a) => {
    const isJsOrTs = a.primaryLanguages.some((entry) => entry.value === "JavaScript" || entry.value === "TypeScript");
    const hasEslint = a.configurationFiles.some((d) => d.value === "ESLint config");
    return isJsOrTs && !hasEslint
      ? {
          value: "No ESLint configuration was detected for this JavaScript/TypeScript codebase.",
          confidence: "Medium",
          evidence: ["no .eslintrc*/eslint config file found"],
          sourceFiles: [],
          sourceDetectionIds: [],
        }
      : null;
  },
  (a) =>
    a.entryPoints.length === 0
      ? { value: "No entry point was detected (no package.json main/bin field, no conventional entry filename).", confidence: "Low", evidence: [], sourceFiles: [], sourceDetectionIds: [] }
      : null,
  (a) => {
    const hasSensitiveTech = a.databaseTechnologies.length > 0 || a.authenticationLibraries.length > 0;
    const hasEnvFile = a.environmentFiles.some((d) => d.value === ".env file");
    return hasSensitiveTech && !hasEnvFile
      ? {
          value: "Database/authentication dependencies were detected but no .env-pattern file (e.g. .env.example) was found -- onboarding configuration may be undocumented.",
          confidence: "Low",
          evidence: [],
          sourceFiles: [],
          sourceDetectionIds: [],
        }
      : null;
  },
];

function runRules(rules: ReadonlyArray<Rule>, analysis: RepositoryAnalysis, kind: string): Detection<string>[] {
  const results: Detection<string>[] = [];
  for (const rule of rules) {
    const result = rule(analysis);
    if (result) results.push({ id: makeId(kind, result.value), kind, ...result });
  }
  return results;
}

export function detectArchitecturalStrengths(analysis: RepositoryAnalysis): Detection<string>[] {
  return runRules(STRENGTH_RULES, analysis, "architectural-strength");
}
export function detectArchitecturalRisks(analysis: RepositoryAnalysis): Detection<string>[] {
  return runRules(RISK_RULES, analysis, "architectural-risk");
}
export function detectTechnicalDebtAreas(analysis: RepositoryAnalysis): Detection<string>[] {
  return runRules(DEBT_RULES, analysis, "technical-debt");
}
export function detectMissingEngineeringPractices(analysis: RepositoryAnalysis): Detection<string>[] {
  return runRules(MISSING_PRACTICE_RULES, analysis, "missing-engineering-practice");
}
