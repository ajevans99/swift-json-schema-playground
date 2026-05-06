import type { Example } from './registry'

// Per-session in-memory cache keyed by the upstream URL. Entries persist
// for the lifetime of the page (no eviction); each upstream is small
// (tens of KB) and the registry has a fixed handful of entries.
const cache = new Map<string, string>()

function tryPrettyPrint(text: string): string {
  try {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`
  } catch {
    // The upstream isn't valid JSON (or is JSON-with-comments etc.).
    // Hand back the raw text and let the editor surface the issue.
    return text
  }
}

/** Fetch (or return cached) schema text for an example, pretty-printed. */
export async function loadSchema(example: Example): Promise<string> {
  const cached = cache.get(example.schemaURL)
  if (cached !== undefined) return cached

  const res = await fetch(example.schemaURL)
  if (!res.ok) {
    throw new Error(
      `Failed to load ${example.name}: HTTP ${res.status} ${res.statusText}`,
    )
  }
  const raw = await res.text()
  const formatted = tryPrettyPrint(raw)
  cache.set(example.schemaURL, formatted)
  return formatted
}

export interface LoadedExample {
  schema: string
  instance: string
}

/**
 * Resolve both editor contents for an example. Self-validating examples
 * (`instance === null`) reuse the schema text as the instance.
 */
export async function loadExample(example: Example): Promise<LoadedExample> {
  const schema = await loadSchema(example)
  const instance = example.instance ?? schema
  return { schema, instance }
}

/** Test helper. Not exported from the package entry intentionally. */
export function _resetExampleCacheForTests(): void {
  cache.clear()
}
