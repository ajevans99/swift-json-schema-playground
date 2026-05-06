import { beforeEach, describe, expect, test } from 'vitest'
import { loadPersistedState, savePersistedState } from '../src/storage'

const KEY = 'swift-json-schema-playground:v1'

beforeEach(() => {
  globalThis.localStorage.clear()
})

describe('storage', () => {
  test('save → load round-trip returns the same object', () => {
    const state = { schema: '{"type":"string"}', instance: '"hi"' }
    savePersistedState(state)
    expect(loadPersistedState()).toEqual(state)
  })

  test('load with no key returns null', () => {
    expect(loadPersistedState()).toBeNull()
  })

  test('load with corrupt JSON returns null and does not throw', () => {
    globalThis.localStorage.setItem(KEY, '{not valid json')
    expect(() => loadPersistedState()).not.toThrow()
    expect(loadPersistedState()).toBeNull()
  })

  test('load with wrong shape (missing instance) returns null', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify({ schema: 'x' }))
    expect(loadPersistedState()).toBeNull()
  })

  test('load with non-string fields returns null', () => {
    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 1, instance: 'x' }),
    )
    expect(loadPersistedState()).toBeNull()
  })

  test('save tolerates localStorage throwing', () => {
    const original = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    try {
      expect(() =>
        savePersistedState({ schema: 'a', instance: 'b' }),
      ).not.toThrow()
    } finally {
      globalThis.localStorage.setItem = original
    }
  })
})
