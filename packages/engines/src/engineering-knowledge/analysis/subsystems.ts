/**
 * Coarse, stable subsystem identification from RepositoryAnalysis.repositoryStructure.
 *
 * A monorepo's "package"-role top-level directory (e.g. packages/) is expanded to its immediate children --
 * one subsystem per workspace package, since that is the natural ownership unit in a monorepo. Every other
 * candidate role (source/infrastructure) stays at the top level, one subsystem per top-level directory, to
 * keep granularity coarse and stable for a single-package repository (nothing here descends into a plain
 * "src" directory's own internal layering -- src/domain, src/controllers etc. remain part of the same "src"
 * subsystem; that finer layering is what architecturalPatterns already reports separately).
 */

import type { Confidence, RepositoryAnalysis } from "../../repository-analyzer/analysis/types";
import { makeId } from "../../repository-analyzer/analysis/identity";
import type { SubsystemRole } from "./types";

const SUBSYSTEM_ROLES: ReadonlySet<string> = new Set(["source", "package", "infrastructure"]);

export interface SubsystemBase {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly role: SubsystemRole;
  readonly confidence: Confidence;
}

export function detectSubsystemBases(analysis: RepositoryAnalysis): SubsystemBase[] {
  const topLevel = analysis.repositoryStructure.filter((entry) => !entry.path.includes("/"));
  const bases: SubsystemBase[] = [];

  for (const entry of topLevel) {
    if (entry.role === "package") {
      const children = analysis.repositoryStructure.filter(
        (candidate) => candidate.path.startsWith(`${entry.path}/`) && candidate.path.split("/").length === 2
      );
      if (children.length > 0) {
        for (const child of children) {
          // A structural inference (direct child of a directory already classified "package"), not a
          // naming-convention guess -- stronger than the keyword-match confidence used below, hence "High".
          bases.push({ id: makeId("subsystem", child.path), name: child.path, path: child.path, role: "package", confidence: "High" });
        }
        continue;
      }
    }
    if (SUBSYSTEM_ROLES.has(entry.role)) {
      bases.push({ id: makeId("subsystem", entry.path), name: entry.path, path: entry.path, role: entry.role as SubsystemRole, confidence: entry.confidence });
    }
  }

  return bases;
}
