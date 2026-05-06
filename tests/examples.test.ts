import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  EXAMPLES,
  DEFAULT_EXAMPLE_ID,
  buildExampleHash,
  findExampleById,
  parseExampleFromHash,
  type Example,
} from '../src/examples/registry'
import {
  _resetExampleCacheForTests,
  loadExample,
  loadSchema,
} from '../src/examples/loader'

const realFetch = globalThis.fetch

beforeEach(() => {
  _resetExampleCacheForTests()
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

function makeMockExample(overrides: Partial<Example> = {}): Example {
  return {
    id: 'mock',
    name: 'Mock Example',
    description: 'desc',
    schemaURL: 'https://example.invalid/mock.json',
    instance: '{"hello":"world"}\n',
    ...overrides,
  }
}

function mockFetchOk(body: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function mockFetchFailing(status: number, statusText: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    return new Response('nope', { status, statusText })
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

describe('registry', () => {
  test('exposes the locked-in 7 examples in order', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual([
      'json-schema-2020-12',
      'openapi-3.1',
      'github-workflow',
      'package-json',
      'tsconfig-json',
      'geojson-feature',
      'json-resume',
    ])
  })

  test('default example is the JSON Schema 2020-12 meta-schema', () => {
    expect(DEFAULT_EXAMPLE_ID).toBe('json-schema-2020-12')
    const def = findExampleById(DEFAULT_EXAMPLE_ID)
    expect(def?.instance).toBeNull() // self-validating
  })

  test('all non-meta examples have a non-empty inline instance', () => {
    for (const e of EXAMPLES.filter((x) => x.id !== 'json-schema-2020-12')) {
      expect(e.instance, `example ${e.id} should have an instance`).toBeTruthy()
      expect(() => JSON.parse(e.instance!)).not.toThrow()
    }
  })

  test('findExampleById returns the right example or null', () => {
    expect(findExampleById('openapi-3.1')?.name).toBe('OpenAPI 3.1')
    expect(findExampleById('not-a-real-id')).toBeNull()
    expect(findExampleById(null)).toBeNull()
    expect(findExampleById(undefined)).toBeNull()
    expect(findExampleById('')).toBeNull()
  })

  test('buildExampleHash produces a parseable hash', () => {
    const hash = buildExampleHash('package-json')
    expect(hash).toBe('#example=package-json')
    expect(parseExampleFromHash(hash)?.id).toBe('package-json')
  })
})

describe('parseExampleFromHash', () => {
  test('returns the matching example for a valid hash', () => {
    expect(parseExampleFromHash('#example=openapi-3.1')?.id).toBe('openapi-3.1')
  })

  test('accepts a hash without the leading #', () => {
    expect(parseExampleFromHash('example=geojson-feature')?.id).toBe(
      'geojson-feature',
    )
  })

  test('returns null for a missing/empty hash', () => {
    expect(parseExampleFromHash('')).toBeNull()
    expect(parseExampleFromHash('#')).toBeNull()
  })

  test('returns null for an unknown id', () => {
    expect(parseExampleFromHash('#example=does-not-exist')).toBeNull()
  })

  test('returns null when the example key is absent', () => {
    expect(parseExampleFromHash('#foo=bar')).toBeNull()
  })

  test('handles multiple hash params and picks the example one', () => {
    expect(parseExampleFromHash('#foo=bar&example=tsconfig-json')?.id).toBe(
      'tsconfig-json',
    )
  })
})

describe('loader.loadSchema', () => {
  test('fetches once and caches subsequent calls', async () => {
    const ex = makeMockExample()
    const fetchMock = mockFetchOk('{"$id":"x","type":"object"}')

    const first = await loadSchema(ex)
    const second = await loadSchema(ex)

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('pretty-prints minified JSON when possible', async () => {
    const ex = makeMockExample()
    mockFetchOk('{"a":1,"b":2}')
    const text = await loadSchema(ex)
    // Pretty-printing should introduce newlines.
    expect(text).toContain('\n')
    expect(JSON.parse(text)).toEqual({ a: 1, b: 2 })
  })

  test('returns raw text if the upstream is not valid JSON', async () => {
    const ex = makeMockExample()
    mockFetchOk('not json {')
    const text = await loadSchema(ex)
    expect(text).toBe('not json {')
  })

  test('rejects with a useful message on non-OK responses', async () => {
    const ex = makeMockExample({ name: 'My Example' })
    mockFetchFailing(503, 'Service Unavailable')
    await expect(loadSchema(ex)).rejects.toThrow(
      /Failed to load My Example: HTTP 503/,
    )
  })
})

describe('loader.loadExample', () => {
  test('uses the inline instance when provided', async () => {
    const ex = makeMockExample({ instance: '{"hand-written":true}\n' })
    mockFetchOk('{"x":1}')
    const { schema, instance } = await loadExample(ex)
    expect(JSON.parse(schema)).toEqual({ x: 1 })
    expect(instance).toBe('{"hand-written":true}\n')
  })

  test('reuses the schema as the instance for self-validating examples', async () => {
    const ex = makeMockExample({ instance: null })
    mockFetchOk('{"$id":"meta","type":"object"}')
    const { schema, instance } = await loadExample(ex)
    expect(instance).toBe(schema)
  })
})
