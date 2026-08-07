/**
 * Language detection by file extension -- a broader extension table than scripts/repository-intelligence.js's
 * (which only covers this repository's own JS/TS/Python-ish stack), so this analyzer gives honest signal on
 * repositories written in other ecosystems too.
 */

import type { WalkedFile } from "./walk";
import type { Detection, LanguageEntry } from "./types";
import { makeId } from "./identity";

const LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  ".js": "JavaScript",
  ".jsx": "JavaScript (JSX)",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript (TSX)",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".cs": "C#",
  ".php": "PHP",
  ".rs": "Rust",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".swift": "Swift",
  ".scala": "Scala",
  ".m": "Objective-C",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".clj": "Clojure",
  ".hs": "Haskell",
  ".lua": "Lua",
  ".sh": "Shell",
  ".ps1": "PowerShell",
  ".sql": "SQL",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".vue": "Vue",
  ".svelte": "Svelte",
};

/** Extensions that are markup/config/metadata rather than a programming language -- excluded from language counts. */
const NON_LANGUAGE_EXTENSIONS = new Set([".json", ".md", ".yml", ".yaml", ".xml", ".txt", ".toml", ".ini", ".lock"]);

export function detectLanguages(files: ReadonlyArray<WalkedFile>): LanguageEntry[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (NON_LANGUAGE_EXTENSIONS.has(file.ext)) continue;
    const language = LANGUAGE_EXTENSIONS[file.ext];
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([language, fileCount]) => ({ id: makeId("language", language), language, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.language.localeCompare(b.language));
}

/**
 * A language is "primary" if it accounts for at least 15% of all counted source files (High confidence if
 * >= 40%, Medium otherwise) -- a plurality threshold, not "the single most common extension no matter how
 * thin the margin." Evidence is always the literal file count, never editorialized.
 */
export function detectPrimaryLanguages(languages: ReadonlyArray<LanguageEntry>): Detection<string>[] {
  const total = languages.reduce((sum, entry) => sum + entry.fileCount, 0);
  if (total === 0) {
    return [{ id: makeId("primary-language", "unknown"), kind: "primary-language", value: "Unknown", confidence: "Low", evidence: [], sourceFiles: [], sourceDetectionIds: [] }];
  }
  const primary = languages.filter((entry) => entry.fileCount / total >= 0.15);
  if (primary.length === 0) {
    return [
      {
        id: makeId("primary-language", "unknown"),
        kind: "primary-language",
        value: "Unknown",
        confidence: "Low",
        evidence: [`no language accounts for even 15% of ${total} source file(s)`],
        sourceFiles: [],
        sourceDetectionIds: [],
      },
    ];
  }
  return primary.map((entry) => {
    const share = entry.fileCount / total;
    return {
      id: makeId("primary-language", entry.language),
      kind: "primary-language",
      value: entry.language,
      confidence: share >= 0.4 ? "High" : "Medium",
      evidence: [`${entry.fileCount} of ${total} source file(s) (${Math.round(share * 100)}%)`],
      sourceFiles: [],
      sourceDetectionIds: [],
    };
  });
}
