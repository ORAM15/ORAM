/**
 * Shared, deterministic identity helpers -- the mechanism behind "every emitted object gets a stable id"
 * (Identity Preservation milestone). No storage, no lookup/resolution, no graph: just a pure function from
 * (kind, value) to a stable string, so the SAME fact produces the SAME id on every run of the same
 * repository, and different kinds of fact can never collide even if their values happen to match.
 */

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unknown";
}

/** `kind` namespaces the id so e.g. framework:redis and database:redis (hypothetically) can never collide. */
export function makeId(kind: string, value: unknown): string {
  return `${slugify(kind)}:${slugify(String(value))}`;
}
