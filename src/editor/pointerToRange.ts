import { parseTree, type Node } from 'jsonc-parser'

export interface Range1Based {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/**
 * Convert an RFC 6901 JSON pointer (e.g. "/foo/0/bar") into an array of path
 * segments. Numeric-looking segments are returned as numbers so they can be
 * used to index arrays; the consumer is responsible for handling the case
 * where the parent is actually an object with numeric string keys.
 */
export function pointerToPath(pointer: string): (string | number)[] {
  if (pointer === '') return []
  if (pointer[0] !== '/') {
    // Not a valid JSON pointer; treat as no path so callers can fail gracefully.
    return []
  }
  const segments = pointer.slice(1).split('/')
  return segments.map((segment) => {
    const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (/^(0|[1-9]\d*)$/.test(decoded)) {
      return Number(decoded)
    }
    return decoded
  })
}

function findNode(root: Node, path: (string | number)[]): Node | undefined {
  let current: Node | undefined = root
  for (const segment of path) {
    if (!current) return undefined
    if (current.type === 'object') {
      const children: Node[] = current.children ?? []
      const key = String(segment)
      const property: Node | undefined = children.find(
        (child: Node) =>
          child.type === 'property' &&
          !!child.children &&
          child.children[0]?.value === key,
      )
      if (!property || !property.children || property.children.length < 2) {
        return undefined
      }
      current = property.children[1]
    } else if (current.type === 'array') {
      const index = typeof segment === 'number' ? segment : Number(segment)
      if (!Number.isInteger(index) || index < 0) return undefined
      const children: Node[] = current.children ?? []
      if (index >= children.length) return undefined
      current = children[index]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Convert a 0-based byte/character offset in `text` into a 1-based
 * { line, column } position using Monaco's convention.
 */
function offsetToPosition(
  text: string,
  offset: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: clamped - lineStart + 1 }
}

/**
 * Resolve a JSON pointer in `text` to a 1-based line/column range covering the
 * value at that pointer. Returns null if the text doesn't parse or the pointer
 * can't be resolved. The empty pointer ("") returns a range over the entire
 * root value.
 */
export function pointerToRange(
  text: string,
  pointer: string,
): Range1Based | null {
  const root = parseTree(text)
  if (!root) return null

  const path = pointerToPath(pointer)
  const node = path.length === 0 ? root : findNode(root, path)
  if (!node) return null

  const start = offsetToPosition(text, node.offset)
  const end = offsetToPosition(text, node.offset + node.length)
  return {
    startLineNumber: start.line,
    startColumn: start.column,
    endLineNumber: end.line,
    endColumn: end.column,
  }
}
