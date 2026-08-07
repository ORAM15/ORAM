/**
 * File-presence signature table -- CI/CD, Docker, infrastructure-as-code, environment files, configuration
 * files, and deployment targets, all detected purely by recognizing well-known filenames/paths. Every rule
 * is a literal filename/path pattern match against files this analyzer actually walked -- never content
 * inference (the one exception, Kubernetes manifest detection, is documented at its own rule below as a
 * literal `apiVersion:`/`kind:` text match, not semantic YAML understanding).
 */

import type { WalkedFile } from "./walk";
import { readFileSafe } from "./walk";
import type { Detection } from "./types";
import { makeId } from "./identity";

export type FileSignatureCategory = "ci" | "docker" | "infrastructure" | "env" | "config" | "deployment";

function basename(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

interface FileRule {
  readonly test: (file: WalkedFile) => boolean;
  readonly label: string;
  readonly category: FileSignatureCategory;
}

const FILE_RULES: ReadonlyArray<FileRule> = [
  // CI/CD
  { test: (f) => f.relPath.startsWith(".github/workflows/") && (f.ext === ".yml" || f.ext === ".yaml"), label: "GitHub Actions", category: "ci" },
  { test: (f) => f.relPath === ".gitlab-ci.yml", label: "GitLab CI", category: "ci" },
  { test: (f) => f.relPath === ".circleci/config.yml", label: "CircleCI", category: "ci" },
  { test: (f) => basename(f.relPath) === "azure-pipelines.yml", label: "Azure Pipelines", category: "ci" },
  { test: (f) => basename(f.relPath) === "Jenkinsfile", label: "Jenkins", category: "ci" },
  { test: (f) => basename(f.relPath) === ".travis.yml", label: "Travis CI", category: "ci" },
  { test: (f) => basename(f.relPath) === "bitbucket-pipelines.yml", label: "Bitbucket Pipelines", category: "ci" },

  // Docker
  { test: (f) => basename(f.relPath) === "Dockerfile" || f.relPath.endsWith(".Dockerfile"), label: "Dockerfile", category: "docker" },
  {
    test: (f) => /^(docker-)?compose\.ya?ml$/.test(basename(f.relPath)),
    label: "Docker Compose",
    category: "docker",
  },
  { test: (f) => basename(f.relPath) === ".dockerignore", label: ".dockerignore", category: "docker" },

  // Infrastructure as code
  { test: (f) => f.ext === ".tf", label: "Terraform", category: "infrastructure" },
  { test: (f) => f.ext === ".tfvars", label: "Terraform", category: "infrastructure" },
  { test: (f) => basename(f.relPath) === "Chart.yaml", label: "Helm", category: "infrastructure" },
  { test: (f) => basename(f.relPath) === "Pulumi.yaml", label: "Pulumi", category: "infrastructure" },
  { test: (f) => basename(f.relPath) === "cdk.json", label: "AWS CDK", category: "infrastructure" },
  { test: (f) => basename(f.relPath) === "ansible.cfg", label: "Ansible", category: "infrastructure" },
  {
    // Literal text match on the file's own content -- not YAML parsing, not semantic understanding. Deliberately
    // conservative: BOTH markers must be present as their own lines, avoiding a false positive on any random
    // YAML file that merely mentions "kind" or "apiVersion" in prose.
    test: (f) => {
      if (f.ext !== ".yml" && f.ext !== ".yaml") return false;
      if (!(f.relPath.startsWith("k8s/") || f.relPath.startsWith("kubernetes/"))) return false;
      const content = readFileSafe(f.absPath);
      return content !== null && /^apiVersion:/m.test(content) && /^kind:/m.test(content);
    },
    label: "Kubernetes manifests",
    category: "infrastructure",
  },

  // Environment files
  { test: (f) => /^\.env(\..+)?$/.test(basename(f.relPath)), label: ".env file", category: "env" },

  // Configuration files
  { test: (f) => /^tsconfig(\..+)?\.json$/.test(basename(f.relPath)), label: "TypeScript config", category: "config" },
  { test: (f) => basename(f.relPath) === "jsconfig.json", label: "JavaScript config", category: "config" },
  { test: (f) => /^\.eslintrc(\..+)?$/.test(basename(f.relPath)), label: "ESLint config", category: "config" },
  { test: (f) => /^\.prettierrc(\..+)?$/.test(basename(f.relPath)) || basename(f.relPath).startsWith("prettier.config."), label: "Prettier config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("babel.config.") || /^\.babelrc(\..+)?$/.test(basename(f.relPath)), label: "Babel config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("jest.config."), label: "Jest config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("vitest.config."), label: "Vitest config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("vite.config."), label: "Vite config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("webpack.config."), label: "Webpack config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("rollup.config."), label: "Rollup config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("next.config."), label: "Next.js config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("nuxt.config."), label: "Nuxt config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("svelte.config."), label: "Svelte config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("tailwind.config."), label: "Tailwind config", category: "config" },
  { test: (f) => basename(f.relPath).startsWith("postcss.config."), label: "PostCSS config", category: "config" },
  { test: (f) => basename(f.relPath) === ".editorconfig", label: "EditorConfig", category: "config" },

  // Deployment targets
  { test: (f) => basename(f.relPath) === "vercel.json", label: "Vercel", category: "deployment" },
  { test: (f) => basename(f.relPath) === "now.json", label: "Vercel (legacy now.json)", category: "deployment" },
  { test: (f) => basename(f.relPath) === "netlify.toml", label: "Netlify", category: "deployment" },
  { test: (f) => basename(f.relPath) === "Procfile", label: "Heroku", category: "deployment" },
  { test: (f) => basename(f.relPath) === "app.yaml", label: "Google App Engine", category: "deployment" },
  { test: (f) => basename(f.relPath) === "fly.toml", label: "Fly.io", category: "deployment" },
  { test: (f) => basename(f.relPath) === "render.yaml", label: "Render", category: "deployment" },
  { test: (f) => basename(f.relPath) === "railway.json" || basename(f.relPath) === "railway.toml", label: "Railway", category: "deployment" },
  { test: (f) => /^serverless\.ya?ml$/.test(basename(f.relPath)), label: "AWS Lambda (Serverless Framework)", category: "deployment" },
];

export function detectFileSignatures(files: ReadonlyArray<WalkedFile>): Record<FileSignatureCategory, Detection<string>[]> {
  const byLabel = new Map<string, { category: FileSignatureCategory; files: Set<string> }>();

  for (const file of files) {
    for (const rule of FILE_RULES) {
      if (!rule.test(file)) continue;
      const existing = byLabel.get(rule.label);
      if (existing) {
        existing.files.add(file.relPath);
      } else {
        byLabel.set(rule.label, { category: rule.category, files: new Set([file.relPath]) });
      }
    }
  }

  const result: Record<FileSignatureCategory, Detection<string>[]> = {
    ci: [],
    docker: [],
    infrastructure: [],
    env: [],
    config: [],
    deployment: [],
  };

  for (const [label, { category, files }] of byLabel.entries()) {
    const sortedFiles = [...files].sort();
    result[category].push({
      id: makeId(category, label),
      kind: category,
      value: label,
      confidence: "High",
      evidence: sortedFiles.map((file) => `${file} present`),
      sourceFiles: sortedFiles,
      sourceDetectionIds: [],
    });
  }

  for (const category of Object.keys(result) as FileSignatureCategory[]) {
    result[category].sort((a, b) => a.value.localeCompare(b.value));
  }

  return result;
}
