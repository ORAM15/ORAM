/**
 * Consistent, friendly CLI error formatting -- every command prints through this instead of an ad-hoc
 * console.error() call, so "missing argument" / "not found" / "unknown command" all read the same way.
 */
export function printCliError(message: string, usage?: string): void {
  console.error(`Error: ${message}`);
  if (usage) console.error(`Usage: ${usage}`);
}
