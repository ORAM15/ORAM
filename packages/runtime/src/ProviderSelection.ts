/**
 * Provider selection at the Runtime composition boundary.
 *
 * Provider choice is configuration, not business logic. The safe default is the deterministic in-memory
 * provider id (`memory`); external providers must be explicitly registered and selected by their stable id.
 * This module deliberately does not import any concrete external AI provider, so Core Runtime remains
 * independent of Ollama, Gemini, OpenAI, Claude Code, or any other AI tool.
 */

import type { Provider, ProviderRegistry } from "./ProviderRegistry";

export const DEFAULT_PROVIDER_ID = "memory";

export interface ProviderSelectionConfig {
  /** Stable provider id registered in the Runtime ProviderRegistry. */
  readonly providerId?: string;
}

/** Returns the configured provider id, failing closed for an explicitly empty value. */
export function resolveProviderId(config?: ProviderSelectionConfig): string {
  if (config?.providerId === undefined) return DEFAULT_PROVIDER_ID;
  const id = config.providerId.trim();
  if (!id) throw new Error("Provider selection requires a non-empty providerId when configured.");
  return id;
}

/** Resolves the selected provider through the registry; unknown ids fail closed there. */
export function selectProvider(registry: ProviderRegistry, config?: ProviderSelectionConfig): Provider {
  return registry.resolve(resolveProviderId(config));
}
