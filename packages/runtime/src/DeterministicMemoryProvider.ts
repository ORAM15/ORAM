/**
 * DeterministicMemoryProvider — the Runtime's safe, dependency-free default provider.
 *
 * This provider satisfies the Runtime Provider contract without invoking an external model, filesystem,
 * shell, Git, or network operation. It makes the advertised `memory` provider id resolvable from the default
 * Runtime composition while keeping real providers explicitly registered and selected.
 */

import type { Provider, ProviderCapabilities, ProviderResult } from "./ProviderRegistry";

export const DETERMINISTIC_MEMORY_PROVIDER_ID = "memory";

export class DeterministicMemoryProvider implements Provider {
  readonly id = DETERMINISTIC_MEMORY_PROVIDER_ID;

  capabilities(): ProviderCapabilities {
    return { canImplement: true, canDecide: false, canValidate: false };
  }

  async implement(_workOrder: unknown): Promise<ProviderResult> {
    return {
      status: "success",
      modifiedFiles: [],
      testsExecuted: 0,
      testsPassed: 0,
      warnings: ["Deterministic memory provider is simulation-only; no repository changes were made."],
      errors: [],
      executionSummary: "Deterministic memory provider accepted the work order without external side effects.",
      providerEvidence: { simulated: true, provider: this.id },
    };
  }
}
