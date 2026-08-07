/**
 * Dependency-name signature table -- the single source of truth for turning a manifest's declared dependency
 * names into framework/build-tool/test-framework/database/auth/AI/cloud Detections. One flat, data-only
 * table with a `category` tag per entry, looked up once per manifest; no per-category duplication.
 *
 * SCOPE: npm + pip only (see manifests.ts's own Known Limitations note -- other ecosystems are counted but
 * not yet signature-matched). Every match is an exact (or, for `prefix` entries, prefix) dependency-name
 * comparison against names actually declared in a manifest -- never a content/behavior guess.
 */

import type { Ecosystem } from "./manifests";
import type { Detection } from "./types";
import { makeId } from "./identity";

export type SignatureCategory =
  | "framework"
  | "api-framework"
  | "build-tool"
  | "test-framework"
  | "database"
  | "auth"
  | "ai"
  | "cloud"
  | "infrastructure";

export interface DependencySignature {
  readonly match: string;
  readonly isPrefix?: boolean;
  readonly ecosystem: Ecosystem;
  readonly label: string;
  readonly category: SignatureCategory;
}

const NPM_SIGNATURES: ReadonlyArray<DependencySignature> = [
  // Frontend / general frameworks
  { match: "react", ecosystem: "npm", label: "React", category: "framework" },
  { match: "react-dom", ecosystem: "npm", label: "React DOM", category: "framework" },
  { match: "react-router-dom", ecosystem: "npm", label: "React Router", category: "framework" },
  { match: "react-scripts", ecosystem: "npm", label: "Create React App", category: "build-tool" },
  { match: "next", ecosystem: "npm", label: "Next.js", category: "framework" },
  { match: "vue", ecosystem: "npm", label: "Vue.js", category: "framework" },
  { match: "nuxt", ecosystem: "npm", label: "Nuxt", category: "framework" },
  { match: "@angular/core", ecosystem: "npm", label: "Angular", category: "framework" },
  { match: "svelte", ecosystem: "npm", label: "Svelte", category: "framework" },
  { match: "@sveltejs/kit", ecosystem: "npm", label: "SvelteKit", category: "framework" },
  { match: "astro", ecosystem: "npm", label: "Astro", category: "framework" },
  { match: "@remix-run/react", ecosystem: "npm", label: "Remix", category: "framework" },
  { match: "solid-js", ecosystem: "npm", label: "SolidJS", category: "framework" },
  { match: "tailwindcss", ecosystem: "npm", label: "Tailwind CSS", category: "framework" },
  { match: "bootstrap", ecosystem: "npm", label: "Bootstrap", category: "framework" },
  { match: "@mui/material", ecosystem: "npm", label: "MUI (Material UI)", category: "framework" },

  // API / backend frameworks
  { match: "express", ecosystem: "npm", label: "Express", category: "api-framework" },
  { match: "koa", ecosystem: "npm", label: "Koa", category: "api-framework" },
  { match: "fastify", ecosystem: "npm", label: "Fastify", category: "api-framework" },
  { match: "@nestjs/core", ecosystem: "npm", label: "NestJS", category: "api-framework" },
  { match: "hapi", ecosystem: "npm", label: "Hapi", category: "api-framework" },
  { match: "@hapi/hapi", ecosystem: "npm", label: "Hapi", category: "api-framework" },
  { match: "graphql", ecosystem: "npm", label: "GraphQL", category: "api-framework" },
  { match: "apollo-server", ecosystem: "npm", label: "Apollo Server", category: "api-framework" },
  { match: "@apollo/server", ecosystem: "npm", label: "Apollo Server", category: "api-framework" },
  { match: "trpc", ecosystem: "npm", label: "tRPC", category: "api-framework" },
  { match: "@trpc/server", ecosystem: "npm", label: "tRPC", category: "api-framework" },

  // Build tools
  { match: "webpack", ecosystem: "npm", label: "Webpack", category: "build-tool" },
  { match: "vite", ecosystem: "npm", label: "Vite", category: "build-tool" },
  { match: "rollup", ecosystem: "npm", label: "Rollup", category: "build-tool" },
  { match: "esbuild", ecosystem: "npm", label: "esbuild", category: "build-tool" },
  { match: "parcel", ecosystem: "npm", label: "Parcel", category: "build-tool" },
  { match: "@babel/core", ecosystem: "npm", label: "Babel", category: "build-tool" },
  { match: "typescript", ecosystem: "npm", label: "TypeScript", category: "build-tool" },
  { match: "turbo", ecosystem: "npm", label: "Turborepo", category: "build-tool" },
  { match: "nx", ecosystem: "npm", label: "Nx", category: "build-tool" },
  { match: "gulp", ecosystem: "npm", label: "Gulp", category: "build-tool" },
  { match: "tsup", ecosystem: "npm", label: "tsup", category: "build-tool" },

  // Test frameworks
  { match: "jest", ecosystem: "npm", label: "Jest", category: "test-framework" },
  { match: "mocha", ecosystem: "npm", label: "Mocha", category: "test-framework" },
  { match: "vitest", ecosystem: "npm", label: "Vitest", category: "test-framework" },
  { match: "jasmine", ecosystem: "npm", label: "Jasmine", category: "test-framework" },
  { match: "ava", ecosystem: "npm", label: "AVA", category: "test-framework" },
  { match: "cypress", ecosystem: "npm", label: "Cypress", category: "test-framework" },
  { match: "playwright", ecosystem: "npm", label: "Playwright", category: "test-framework" },
  { match: "@playwright/test", ecosystem: "npm", label: "Playwright", category: "test-framework" },
  { match: "tap", ecosystem: "npm", label: "node-tap", category: "test-framework" },

  // Database
  { match: "pg", ecosystem: "npm", label: "PostgreSQL (pg)", category: "database" },
  { match: "mysql", ecosystem: "npm", label: "MySQL", category: "database" },
  { match: "mysql2", ecosystem: "npm", label: "MySQL", category: "database" },
  { match: "sqlite3", ecosystem: "npm", label: "SQLite", category: "database" },
  { match: "better-sqlite3", ecosystem: "npm", label: "SQLite", category: "database" },
  { match: "mongodb", ecosystem: "npm", label: "MongoDB", category: "database" },
  { match: "mongoose", ecosystem: "npm", label: "MongoDB (Mongoose)", category: "database" },
  { match: "redis", ecosystem: "npm", label: "Redis", category: "database" },
  { match: "ioredis", ecosystem: "npm", label: "Redis", category: "database" },
  { match: "prisma", ecosystem: "npm", label: "Prisma ORM", category: "database" },
  { match: "@prisma/client", ecosystem: "npm", label: "Prisma ORM", category: "database" },
  { match: "typeorm", ecosystem: "npm", label: "TypeORM", category: "database" },
  { match: "sequelize", ecosystem: "npm", label: "Sequelize ORM", category: "database" },
  { match: "knex", ecosystem: "npm", label: "Knex.js", category: "database" },
  { match: "drizzle-orm", ecosystem: "npm", label: "Drizzle ORM", category: "database" },

  // Auth
  { match: "passport", ecosystem: "npm", label: "Passport.js", category: "auth" },
  { match: "next-auth", ecosystem: "npm", label: "NextAuth.js", category: "auth" },
  { match: "jsonwebtoken", ecosystem: "npm", label: "JSON Web Tokens (jsonwebtoken)", category: "auth" },
  { match: "jose", ecosystem: "npm", label: "JOSE (JWT/JWE)", category: "auth" },
  { match: "bcrypt", ecosystem: "npm", label: "bcrypt", category: "auth" },
  { match: "bcryptjs", ecosystem: "npm", label: "bcrypt", category: "auth" },
  { match: "argon2", ecosystem: "npm", label: "Argon2", category: "auth" },
  { match: "@auth0/nextjs-auth0", ecosystem: "npm", label: "Auth0", category: "auth" },
  { match: "@clerk/nextjs", ecosystem: "npm", label: "Clerk", category: "auth" },
  { match: "@clerk/clerk-sdk-node", ecosystem: "npm", label: "Clerk", category: "auth" },

  // AI / LLM
  { match: "openai", ecosystem: "npm", label: "OpenAI SDK", category: "ai" },
  { match: "@anthropic-ai/sdk", ecosystem: "npm", label: "Anthropic SDK", category: "ai" },
  { match: "langchain", ecosystem: "npm", label: "LangChain", category: "ai" },
  { match: "@langchain/core", ecosystem: "npm", label: "LangChain", category: "ai" },
  { match: "llamaindex", ecosystem: "npm", label: "LlamaIndex", category: "ai" },
  { match: "@google/generative-ai", ecosystem: "npm", label: "Google Generative AI SDK", category: "ai" },
  { match: "cohere-ai", ecosystem: "npm", label: "Cohere SDK", category: "ai" },
  { match: "ai", ecosystem: "npm", label: "Vercel AI SDK", category: "ai" },
  { match: "@mistralai/mistralai", ecosystem: "npm", label: "Mistral AI SDK", category: "ai" },
  { match: "ollama", ecosystem: "npm", label: "Ollama SDK", category: "ai" },

  // Cloud
  { match: "aws-sdk", ecosystem: "npm", label: "AWS SDK", category: "cloud" },
  { match: "@aws-sdk/", isPrefix: true, ecosystem: "npm", label: "AWS SDK", category: "cloud" },
  { match: "@google-cloud/", isPrefix: true, ecosystem: "npm", label: "Google Cloud", category: "cloud" },
  { match: "firebase", ecosystem: "npm", label: "Firebase", category: "cloud" },
  { match: "firebase-admin", ecosystem: "npm", label: "Firebase Admin", category: "cloud" },
  { match: "@azure/", isPrefix: true, ecosystem: "npm", label: "Azure SDK", category: "cloud" },
  { match: "@supabase/supabase-js", ecosystem: "npm", label: "Supabase", category: "cloud" },
  { match: "vercel", ecosystem: "npm", label: "Vercel", category: "cloud" },

  // Infrastructure-as-code (dependency-based corroboration; file-based signals live in file-signatures.ts)
  { match: "aws-cdk-lib", ecosystem: "npm", label: "AWS CDK", category: "infrastructure" },
  { match: "@pulumi/pulumi", ecosystem: "npm", label: "Pulumi", category: "infrastructure" },
  { match: "cdktf", ecosystem: "npm", label: "Terraform CDK", category: "infrastructure" },
];

const PIP_SIGNATURES: ReadonlyArray<DependencySignature> = [
  { match: "django", ecosystem: "pip", label: "Django", category: "api-framework" },
  { match: "djangorestframework", ecosystem: "pip", label: "Django REST Framework", category: "api-framework" },
  { match: "flask", ecosystem: "pip", label: "Flask", category: "api-framework" },
  { match: "fastapi", ecosystem: "pip", label: "FastAPI", category: "api-framework" },
  { match: "tornado", ecosystem: "pip", label: "Tornado", category: "api-framework" },
  { match: "pyramid", ecosystem: "pip", label: "Pyramid", category: "api-framework" },

  { match: "pytest", ecosystem: "pip", label: "pytest", category: "test-framework" },
  { match: "nose", ecosystem: "pip", label: "nose", category: "test-framework" },
  { match: "nose2", ecosystem: "pip", label: "nose2", category: "test-framework" },
  { match: "tox", ecosystem: "pip", label: "tox", category: "test-framework" },

  { match: "sqlalchemy", ecosystem: "pip", label: "SQLAlchemy", category: "database" },
  { match: "psycopg2", ecosystem: "pip", label: "PostgreSQL (psycopg2)", category: "database" },
  { match: "psycopg2-binary", ecosystem: "pip", label: "PostgreSQL (psycopg2)", category: "database" },
  { match: "pymongo", ecosystem: "pip", label: "MongoDB (pymongo)", category: "database" },
  { match: "redis", ecosystem: "pip", label: "Redis", category: "database" },
  { match: "pymysql", ecosystem: "pip", label: "MySQL (PyMySQL)", category: "database" },
  { match: "alembic", ecosystem: "pip", label: "Alembic (migrations)", category: "database" },

  { match: "django-allauth", ecosystem: "pip", label: "django-allauth", category: "auth" },
  { match: "flask-login", ecosystem: "pip", label: "Flask-Login", category: "auth" },
  { match: "authlib", ecosystem: "pip", label: "Authlib", category: "auth" },
  { match: "python-jose", ecosystem: "pip", label: "python-jose (JWT)", category: "auth" },
  { match: "pyjwt", ecosystem: "pip", label: "PyJWT", category: "auth" },
  { match: "passlib", ecosystem: "pip", label: "passlib", category: "auth" },

  { match: "openai", ecosystem: "pip", label: "OpenAI SDK", category: "ai" },
  { match: "anthropic", ecosystem: "pip", label: "Anthropic SDK", category: "ai" },
  { match: "langchain", ecosystem: "pip", label: "LangChain", category: "ai" },
  { match: "llama-index", ecosystem: "pip", label: "LlamaIndex", category: "ai" },
  { match: "transformers", ecosystem: "pip", label: "Hugging Face Transformers", category: "ai" },
  { match: "cohere", ecosystem: "pip", label: "Cohere SDK", category: "ai" },
  { match: "sentence-transformers", ecosystem: "pip", label: "Sentence Transformers", category: "ai" },

  { match: "boto3", ecosystem: "pip", label: "AWS SDK (boto3)", category: "cloud" },
  { match: "google-cloud-", isPrefix: true, ecosystem: "pip", label: "Google Cloud", category: "cloud" },
  { match: "azure-", isPrefix: true, ecosystem: "pip", label: "Azure SDK", category: "cloud" },
];

const ALL_SIGNATURES: ReadonlyArray<DependencySignature> = [...NPM_SIGNATURES, ...PIP_SIGNATURES];

function findSignature(ecosystem: Ecosystem, name: string): DependencySignature | undefined {
  const normalized = name.toLowerCase();
  return ALL_SIGNATURES.find(
    (sig) =>
      sig.ecosystem === ecosystem && (sig.isPrefix ? normalized.startsWith(sig.match.toLowerCase()) : sig.match.toLowerCase() === normalized)
  );
}

export interface ManifestDependencies {
  readonly relPath: string;
  readonly ecosystem: Ecosystem;
  readonly dependencyNames: ReadonlyArray<string>;
}

/**
 * Matches every manifest's declared dependency names against the signature table, grouping the resulting
 * Detections by category. A dependency matched in more than one manifest is reported once, with every
 * matching manifest listed as a source file (stronger evidence, not a duplicate entry).
 */
export function detectDependencySignatures(manifests: ReadonlyArray<ManifestDependencies>): Record<SignatureCategory, Detection<string>[]> {
  const byLabel = new Map<string, { category: SignatureCategory; sourceFiles: Set<string> }>();

  for (const manifest of manifests) {
    for (const name of manifest.dependencyNames) {
      const signature = findSignature(manifest.ecosystem, name);
      if (!signature) continue;
      const existing = byLabel.get(signature.label);
      if (existing) {
        existing.sourceFiles.add(manifest.relPath);
      } else {
        byLabel.set(signature.label, { category: signature.category, sourceFiles: new Set([manifest.relPath]) });
      }
    }
  }

  const result: Record<SignatureCategory, Detection<string>[]> = {
    framework: [],
    "api-framework": [],
    "build-tool": [],
    "test-framework": [],
    database: [],
    auth: [],
    ai: [],
    cloud: [],
    infrastructure: [],
  };

  for (const [label, { category, sourceFiles }] of byLabel.entries()) {
    const files = [...sourceFiles].sort();
    result[category].push({
      id: makeId(category, label),
      kind: category,
      value: label,
      confidence: "High",
      evidence: files.map((file) => `declared dependency in ${file}`),
      sourceFiles: files,
      sourceDetectionIds: [],
    });
  }

  for (const category of Object.keys(result) as SignatureCategory[]) {
    result[category].sort((a, b) => a.value.localeCompare(b.value));
  }

  return result;
}
