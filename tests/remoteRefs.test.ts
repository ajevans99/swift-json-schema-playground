import { describe, expect, test, vi } from 'vitest'
import { createRemoteResolver, resolveRefURL } from '../src/validator/remoteRefs'

describe('resolveRefURL', () => {
  test('returns null for pure-fragment refs', () => {
    expect(resolveRefURL('#/foo', undefined)).toBeNull()
    expect(resolveRefURL('#', 'https://x.test/')).toBeNull()
  })

  test('returns absolute http(s) refs unchanged (fragment stripped)', () => {
    expect(resolveRefURL('https://x.test/a.json', undefined)).toBe(
      'https://x.test/a.json',
    )
    expect(resolveRefURL('https://x.test/a.json#/x', undefined)).toBe(
      'https://x.test/a.json',
    )
  })

  test('resolves relative refs against baseURI', () => {
    expect(
      resolveRefURL('meta/core', 'https://json-schema.org/draft/2020-12/schema'),
    ).toBe('https://json-schema.org/draft/2020-12/meta/core')
    expect(
      resolveRefURL('billing.json', 'https://example.com/api/v1/index.json'),
    ).toBe('https://example.com/api/v1/billing.json')
  })

  test('returns null for relative refs without a baseURI', () => {
    expect(resolveRefURL('billing.json', undefined)).toBeNull()
  })
})

describe('createRemoteResolver', () => {
  test('returns empty dict when schema has only internal refs', async () => {
    const fetchImpl = vi.fn()
    const resolver = createRemoteResolver({ fetchImpl })
    const result = await resolver.resolve(
      JSON.stringify({
        type: 'object',
        properties: { x: { $ref: '#/$defs/X' } },
        $defs: { X: { type: 'string' } },
      }),
    )
    expect(result).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('fetches each external ref once and caches across calls', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ type: 'integer' }),
    })
    const resolver = createRemoteResolver({ fetchImpl })

    const schema = JSON.stringify({
      allOf: [{ $ref: 'https://x.test/a.json' }, { $ref: 'https://x.test/a.json' }],
    })
    const r1 = await resolver.resolve(schema)
    expect(r1).toEqual({ 'https://x.test/a.json': { type: 'integer' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    // Second call should hit cache.
    const r2 = await resolver.resolve(schema)
    expect(r2).toEqual(r1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(resolver.cacheSize()).toBe(1)
  })

  test('resolves relative refs against the schema $id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({}),
    })
    const resolver = createRemoteResolver({ fetchImpl })

    await resolver.resolve(
      JSON.stringify({
        $id: 'https://json-schema.org/draft/2020-12/schema',
        allOf: [{ $ref: 'meta/core' }, { $ref: 'meta/applicator' }],
      }),
    )

    const calledURLs = fetchImpl.mock.calls.map((c) => c[0])
    expect(calledURLs).toEqual(
      expect.arrayContaining([
        'https://json-schema.org/draft/2020-12/meta/core',
        'https://json-schema.org/draft/2020-12/meta/applicator',
      ]),
    )
  })

  test('follows transitive refs from fetched documents', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ allOf: [{ $ref: 'https://x.test/b.json' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ type: 'string' }),
      })
    const resolver = createRemoteResolver({ fetchImpl })

    const r = await resolver.resolve(
      JSON.stringify({ $ref: 'https://x.test/a.json' }),
    )
    expect(Object.keys(r).sort()).toEqual([
      'https://x.test/a.json',
      'https://x.test/b.json',
    ])
  })

  test('drops failed fetches silently and does not retry them', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
    const resolver = createRemoteResolver({ fetchImpl })

    const r1 = await resolver.resolve(
      JSON.stringify({ $ref: 'https://x.test/missing.json' }),
    )
    expect(r1).toEqual({})

    // Second call should NOT re-fetch (failed-URL set).
    const r2 = await resolver.resolve(
      JSON.stringify({ $ref: 'https://x.test/missing.json' }),
    )
    expect(r2).toEqual({})
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('skips fetching the schema document itself ($id self-ref)', async () => {
    const fetchImpl = vi.fn()
    const resolver = createRemoteResolver({ fetchImpl })

    await resolver.resolve(
      JSON.stringify({
        $id: 'https://x.test/self.json',
        $ref: 'https://x.test/self.json',
      }),
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('returns empty dict for invalid JSON without throwing', async () => {
    const fetchImpl = vi.fn()
    const resolver = createRemoteResolver({ fetchImpl })
    const r = await resolver.resolve('{ invalid json')
    expect(r).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('respects maxRounds to bound transitive fetch chains', async () => {
    // Each fetched document points to a new URL, infinitely.
    let counter = 0
    const fetchImpl = vi.fn().mockImplementation(async () => {
      counter += 1
      return {
        ok: true,
        text: async () => JSON.stringify({ $ref: `https://x.test/${counter}.json` }),
      }
    })
    const resolver = createRemoteResolver({ fetchImpl, maxRounds: 3 })

    await resolver.resolve(
      JSON.stringify({ $ref: 'https://x.test/start.json' }),
    )
    // 1 (start) + 3 rounds of 1 follow-up each = 4 fetches max.
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4)
  })
})
