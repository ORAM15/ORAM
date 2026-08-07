/**
 * ProviderRegistry — resolves a configured provider id to a live Provider instance.
 *
 * Generalizes implementation-executor.js's existing PROVIDERS map + resolveProvider() (see
 * docs/ORAM_SPECIFICATION_v1.md Section 6 and ORAM_V3_MIGRATION_PLAN.md Section 4.1 -- that pattern is
 * explicitly called out as reusable prior art, not something to redesign from scratch) into a registry the
 * Runtime consults instead of a module-level constant.
 *
 * Adds one capability today's lookup doesn't have: capability negotiation
 * (docs/ORAM_SPECIFICATION_v1.md Section 6, "Identity and capability") -- a provider can be asked what it
 * supports before the Runtime commits to it, instead of only failing closed on an unrecognized name. Fail-
 * closed on a truly unknown/misconfigured id is preserved, not weakened (see resolve() below).
 *
 * TODO(providers): the Provider/ProviderCapabilities shapes below are a MINIMAL placeholder, duplicated
 *   here (rather than imported from @oram/providers) only so this package can compile independently during
 *   scaffolding -- @oram/providers is scaffolded as README-only in this phase (see
 *   ORAM_V3_MIGRATION_PLAN.md Milestone 3). Once that package's real Provider interface exists, this file
 *   should import it from "@oram/providers" and this local declaration should be deleted.
 * TODO(runtime): decide registration model -- static config-driven list vs. filesystem/package discovery
 *   (relevant once @oram/plugins exists for third-party providers).
 */

/**
 * PRELIMINARY shape -- see the TODO(providers) note above. Mirrors implementation-executor.js's
 * normalizeProviderResult() output shape exactly: {status, modifiedFiles, testsExecuted, testsPassed,
 * warnings, errors, executionSummary, providerEvidence}.
 */
export interface ProviderResult {
  readonly status: "success" | "failure" | "cancelled" | "blocked";
  readonly modifiedFiles: ReadonlyArray<string>;
  readonly testsExecuted: number;
  readonly testsPassed: number;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
  readonly executionSummary: string;
  readonly providerEvidence: Record<string, unknown> | null;
}

export interface ProviderCapabilities {
  readonly canImplement: boolean;
  readonly canDecide: boolean;
  readonly canValidate: boolean;
}

/** PRELIMINARY shape -- see the TODO(providers) note above. `workOrder`/`decisionContext` are typed `unknown` pending @oram/artifacts. */
export interface Provider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  implement(workOrder: unknown): Promise<ProviderResult>;
  decide?(decisionContext: unknown): Promise<unknown>;
}

export interface ProviderRegistry {
  /** Registers a provider under its own `id`. Throws if that id is already registered. */
  register(provider: Provider): void;

  /** Resolves a provider by id. Throws (fails closed) if unknown -- matches today's resolveProvider() behavior in scripts/implementation-executor.js exactly. */
  resolve(id: string): Provider;

  /** Lists every registered provider's id and capabilities, for `oram doctor` / `oram init`'s provider prompt. */
  list(): ReadonlyArray<{ id: string; capabilities: ProviderCapabilities }>;
}

/**
 * Reference implementation. register()/resolve()/list() are simple enough (a typed Map wrapper) to
 * implement now without constituting "business logic" -- no Provider itself is bundled or invoked here.
 */
export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  register(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered.`);
    }
    this.providers.set(provider.id, provider);
  }

  resolve(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) {
      const known = [...this.providers.keys()];
      throw new Error(`Unknown provider "${id}". Registered providers: ${known.length ? known.join(", ") : "none"}.`);
    }
    return provider;
  }

  list(): ReadonlyArray<{ id: string; capabilities: ProviderCapabilities }> {
    return [...this.providers.values()].map((provider) => ({ id: provider.id, capabilities: provider.capabilities() }));
  }
}
