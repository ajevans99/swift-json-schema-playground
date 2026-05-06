import type { ValidationError } from '../types'
import { pointerToRange, type Range1Based } from './pointerToRange'

export type ErrorTarget = 'instance' | 'schema'

export interface ResolvedError {
  target: ErrorTarget
  range: Range1Based
}

function normalizeSchemaPointer(schemaPath: string): string {
  return schemaPath.startsWith('#') ? schemaPath.slice(1) : schemaPath
}

/**
 * Decide which editor an error belongs to and where in that editor's text the
 * offending value lives.
 *
 * Heuristic: try the instance pointer first — `pointerToRange` succeeds for
 * the empty pointer (returning a range over the entire instance), so most
 * validator errors naturally land on the instance editor at either the
 * specific bad value or the root. Only fall back to the schema editor when
 * the instance pointer can't be resolved (e.g. the instance text is
 * malformed JSON, or the validator returned a pointer that doesn't exist in
 * the current text).
 */
export function resolveErrorTarget(
  error: ValidationError,
  schemaText: string,
  instanceText: string,
): ResolvedError | null {
  const instanceRange = pointerToRange(instanceText, error.instancePath)
  if (instanceRange) return { target: 'instance', range: instanceRange }
  const schemaRange = pointerToRange(
    schemaText,
    normalizeSchemaPointer(error.schemaPath),
  )
  if (schemaRange) return { target: 'schema', range: schemaRange }
  return null
}
