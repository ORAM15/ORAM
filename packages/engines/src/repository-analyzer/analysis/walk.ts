/**
 * Generic, repository-agnostic file walker. Unlike scripts/repository-intelligence.js's walkFiles() (which
 * hardcodes MP6-specific ignore paths like "frontend/build"), this recognizes only universally-applicable
 * build/dependency-output directory names -- safe to run against any repository.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface WalkedFile {
  readonly relPath: string;
  readonly absPath: string;
  readonly ext: string;
  readonly size: number;
}

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".oram",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "target", // Rust cargo / Java Maven build output
  "bin",
  "obj", // .NET build output
  ".gradle",
  ".idea",
  ".vscode",
]);

function toPosixRelPath(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join("/");
}

/** Recursively walks `root`, skipping well-known build/dependency/VCS directories. */
export function walkFiles(root: string): WalkedFile[] {
  const results: WalkedFile[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        walk(absPath);
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(absPath).size;
        } catch {
          continue;
        }
        results.push({ relPath: toPosixRelPath(root, absPath), absPath, ext: path.extname(entry.name).toLowerCase(), size });
      }
    }
  }
  walk(root);
  return results;
}

/** Lists immediate subdirectory names of `dir` (repository-relative from `root`), skipping ignored names. */
export function listSubdirectories(root: string, relDir: string): string[] {
  const absDir = path.join(root, relDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !IGNORED_DIR_NAMES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function readFileSafe(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

export function existsRel(root: string, relPath: string): boolean {
  return fs.existsSync(path.join(root, relPath));
}
