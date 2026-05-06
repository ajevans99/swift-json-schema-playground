import { describe, expect, test } from 'vitest'
import { pointerToPath, pointerToRange } from '../src/editor/pointerToRange'

describe('pointerToPath', () => {
  test('empty pointer → empty path', () => {
    expect(pointerToPath('')).toEqual([])
  })

  test('object key', () => {
    expect(pointerToPath('/foo')).toEqual(['foo'])
  })

  test('array index becomes a number', () => {
    expect(pointerToPath('/items/0')).toEqual(['items', 0])
  })

  test('decodes ~1 → / and ~0 → ~', () => {
    expect(pointerToPath('/a~1b/x~0y')).toEqual(['a/b', 'x~y'])
  })
})

describe('pointerToRange', () => {
  test('empty pointer returns range over the whole root value', () => {
    const text = '{"foo":"bar"}'
    const range = pointerToRange(text, '')
    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: text.length + 1,
    })
  })

  test('object property: /foo → range over "bar"', () => {
    const text = '{"foo":"bar"}'
    const range = pointerToRange(text, '/foo')
    // "bar" starts at index 7 (0-based) → column 8, length 5 → end column 13
    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: 8,
      endLineNumber: 1,
      endColumn: 13,
    })
    expect(text.slice(7, 12)).toBe('"bar"')
  })

  test('array index: /items/1 → range over 22', () => {
    const text = '{"items":[1,22,333]}'
    const range = pointerToRange(text, '/items/1')
    // "22" begins at index 12 → column 13, length 2 → end column 15
    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: 13,
      endLineNumber: 1,
      endColumn: 15,
    })
    expect(text.slice(12, 14)).toBe('22')
  })

  test('nested: /a/b/c → range over 42', () => {
    const text = '{"a":{"b":{"c":42}}}'
    const range = pointerToRange(text, '/a/b/c')
    const start = text.indexOf('42')
    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: start + 1,
      endLineNumber: 1,
      endColumn: start + 1 + 2,
    })
  })

  test('multi-line pretty-printed JSON maps to correct line numbers', () => {
    const text = [
      '{',
      '  "foo": {',
      '    "bar": 7',
      '  }',
      '}',
      '',
    ].join('\n')
    const range = pointerToRange(text, '/foo/bar')
    // "7" is on line 3, after `    "bar": ` which is 11 chars → column 12
    expect(range).toEqual({
      startLineNumber: 3,
      startColumn: 12,
      endLineNumber: 3,
      endColumn: 13,
    })
  })

  test('pointer escapes: /a~1b and /x~0y resolve correctly', () => {
    const text = '{"a/b":1,"x~y":2}'
    const r1 = pointerToRange(text, '/a~1b')
    const r2 = pointerToRange(text, '/x~0y')
    const start1 = text.indexOf('1')
    const start2 = text.indexOf('2')
    expect(r1).toEqual({
      startLineNumber: 1,
      startColumn: start1 + 1,
      endLineNumber: 1,
      endColumn: start1 + 2,
    })
    expect(r2).toEqual({
      startLineNumber: 1,
      startColumn: start2 + 1,
      endLineNumber: 1,
      endColumn: start2 + 2,
    })
  })

  test('unresolvable pointer returns null', () => {
    expect(pointerToRange('{"foo":1}', '/missing')).toBeNull()
    expect(pointerToRange('{"foo":[1,2]}', '/foo/9')).toBeNull()
  })

  test('invalid JSON returns null', () => {
    expect(pointerToRange('not json at all', '/foo')).toBeNull()
    expect(pointerToRange('', '')).toBeNull()
  })
})
