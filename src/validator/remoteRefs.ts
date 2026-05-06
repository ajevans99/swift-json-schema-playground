/**
 * Generic external `$ref` resolver.
 *
 * Walks a JSON Schema for `$ref` strings that point to non-fragment URLs,
 * fetches each one (with an in-memory session cache), and returns a dict
 * keyed by absolute URL. Resolution is iterative: fetched documents are
 * also walked, so transitive refs are picked up — capped at a few rounds
 * to bound cycles and pathological graphs.
 *
 * Failed fetches (CORS, 404, network) are silently dropped — the validator
 * will surface a clear "Unable to resolve $ref" error for those, which is
 * a better UX than failing the whole validation here.
 */

const MAX_FETCH_ROUNDS = 5

/** Walk an arbitrary JSON node, collecting every `$ref` string value. */
function collectRefs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        into.add(value)
      } else {
        collectRefs(value, into)
      }
    }
  }
}

/**
 * Resolve a `$ref` string to the absolute document URL it targets, or
 * `null` if it's a pure fragment / un-resolvable.
 *
 * - `"#/foo"` → null (internal — validator handles it)
 * - `"https://x.test/foo.json"` → `"https://x.test/foo.json"` (fragment stripped)
 * - `"meta/core"` + baseURI `"https://json-schema.org/draft/2020-12/schema"`
 *   → `"https://json-schema.org/draft/2020-12/meta/core"`
 */
export function resolveRefURL(ref: string, baseURI: string | undefined): string | null {
  const hashIdx = ref.indexOf('#')
  const docPart = hashIdx === -1 ? ref : ref.substring(0, hashIdx)
  if (docPart === '') return null
  if (/^https?:\/\//i.test(docPart)) return docPart
  if (!baseURI) return null
  try {
    return new URL(docPart, baseURI).toString()
  } catch {
    return null
  }
}

/** Extract the schema's top-level `$id` to use as the base URI for relatives. */
function topLevelBaseURI(schema: unknown): string | undefined {
  if (schema && typeof schema === 'object' && '$id' in (schema as object)) {
    const id = (schema as { $id?: unknown }).$id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return undefined
}

export interface RemoteResolverOptions {
  /** Optional fetch implementation override (for testing). */
  fetchImpl?: typeof fetch
  /** Override max iterative-resolution rounds. */
  maxRounds?: number
}

export interface RemoteResolver {
  /**
   * Walk `schemaText`, fetch any external `$ref` URLs (transitively), and
   * return a `{ url → parsedSchema }` dict. Empty if there's nothing
   * external. Same URL is never fetched twice across calls thanks to the
   * shared cache.
   */
  resolve(schemaText: string): Promise<Record<string, unknown>>
  /** Test/diagnostic helper. */
  cacheSize(): number
}

/** Construct a resolver with its own internal cache. Each Worker should
 *  instantiate one and reuse it for the lifetime of the worker. */
export function createRemoteResolver(
  options: RemoteResolverOptions = {},
): RemoteResolver {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxRounds = options.maxRounds ?? MAX_FETCH_ROUNDS
  const cache = new Map<string, unknown>()
  // Marks URLs we've tried and failed; avoid retrying them every keystroke.
  const failed = new Set<string>()

  async function resolve(schemaText: string): Promise<Record<string, unknown>> {
    let schema: unknown
    try {
      schema = JSON.parse(schemaText)
    } catch {
      return {}
    }
    const ownId = topLevelBaseURI(schema)
    const result: Record<string, unknown> = {}

    let pendingRefs = new Set<string>()
    collectRefs(schema, pendingRefs)

    for (let round = 0; round < maxRounds; round++) {
      const nextRefs = new Set<string>()
      const fetches: Promise<void>[] = []
      for (const ref of pendingRefs) {
        const url = resolveRefURL(ref, ownId)
        if (!url) continue
        // Don't try to fetch the document we're already validating — the
        // validator already has it.
        if (ownId && url === ownId) continue
        if (url in result) continue
        if (failed.has(url)) continue
        if (cache.has(url)) {
          const cached = cache.get(url)
          result[url] = cached
          collectRefs(cached, nextRefs)
          continue
        }
        fetches.push(
          (async () => {
            try {
              const res = await fetchImpl(url)
              if (!res.ok) {
                failed.add(url)
                return
              }
              const text = await res.text()
              const parsed: unknown = JSON.parse(text)
              cache.set(url, parsed)
              result[url] = parsed
              collectRefs(parsed, nextRefs)
            } catch {
              failed.add(url)
            }
          })(),
        )
      }
      await Promise.all(fetches)
      if (nextRefs.size === 0) break
      pendingRefs = nextRefs
    }
    return result
  }

  return {
    resolve,
    cacheSize: () => cache.size,
  }
}
