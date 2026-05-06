// Re-export the shared `ValidationError` shape so consumers can import
// everything validator-related from `src/validator/`.
export type { ValidationError } from '../types.ts'
import type { ValidationError } from '../types.ts'

/** The result envelope returned by the Swift wasm validator. */
export interface ValidationOutcome {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Wire format for messages exchanged between the main thread client and the
 * validator Web Worker.
 */
export interface ValidatorRequest {
  id: number
  schema: string
  instance: string
}

export type ValidatorResponse =
  | { id: number; ok: true; result: ValidationOutcome }
  | { id: number; ok: false; error: string }
