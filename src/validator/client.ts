// Main-thread proxy for the Swift WebAssembly validator hosted in a Web
// Worker. Spawns the worker, correlates request/response pairs by id, and
// implements supersedence: at most one validation is in-flight at a time, so
// a stale result can never race a fresh one into the UI.

import ValidatorWorker from './worker.ts?worker'
import type {
  ValidationOutcome,
  ValidatorRequest,
  ValidatorResponse,
} from './types.ts'

export type { ValidationError, ValidationOutcome } from './types.ts'

/**
 * Minimal subset of the DOM `Worker` interface that `ValidatorClient` uses.
 * Extracted so tests can inject a fake without spinning up a real worker.
 */
export interface WorkerLike {
  postMessage(message: ValidatorRequest): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ValidatorResponse>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<ValidatorResponse>) => void,
  ): void
  terminate(): void
}

interface PendingRequest {
  id: number
  resolve: (value: ValidationOutcome) => void
  reject: (reason: unknown) => void
}

/**
 * Validator client.
 *
 * Supersedence policy: only one request is ever considered "live". When
 * `validate()` is called while a previous request is still pending, that
 * previous Promise is rejected with `new DOMException('Superseded', 'AbortError')`
 * before the new request is dispatched. Any worker response whose id does
 * not match the latest live request is discarded — this prevents stale
 * validation results from racing fresh ones into the UI when the user types
 * faster than the wasm can validate.
 */
export class ValidatorClient {
  private readonly worker: WorkerLike
  private readonly listener: (event: MessageEvent<ValidatorResponse>) => void
  private nextId = 1
  private pending: PendingRequest | null = null
  private terminated = false

  constructor(worker?: WorkerLike) {
    this.worker = worker ?? (new ValidatorWorker() as unknown as WorkerLike)
    this.listener = (event) => this.handleResponse(event.data)
    this.worker.addEventListener('message', this.listener)
  }

  validate(schema: string, instance: string): Promise<ValidationOutcome> {
    if (this.terminated) {
      return Promise.reject(new Error('ValidatorClient has been terminated'))
    }

    this.supersedePending()

    const id = this.nextId++
    const promise = new Promise<ValidationOutcome>((resolve, reject) => {
      this.pending = { id, resolve, reject }
    })
    this.worker.postMessage({ id, schema, instance })
    return promise
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    this.supersedePending()
    this.worker.removeEventListener('message', this.listener)
    this.worker.terminate()
  }

  private supersedePending(): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    pending.reject(makeAbortError('Superseded'))
  }

  private handleResponse(response: ValidatorResponse): void {
    const pending = this.pending
    // Discard stale responses (older than the currently-tracked request, or
    // arriving after `terminate()` cleared it).
    if (!pending || pending.id !== response.id) return
    this.pending = null
    if (response.ok) {
      pending.resolve(response.result)
    } else {
      pending.reject(new Error(response.error))
    }
  }
}

/**
 * Construct an `AbortError`-style exception. Falls back to a plain `Error`
 * with a `name` of `'AbortError'` in environments without `DOMException`
 * (e.g. older Node versions used by some CI runners).
 */
function makeAbortError(message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError')
  }
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

/**
 * Convenience singleton for app-wide use. Construction (which spawns the
 * underlying Web Worker) is deferred until first method access so that
 * importing this module in non-browser contexts — most notably Vitest with
 * jsdom — does not eagerly instantiate a Worker that may not be supported.
 */
let _singleton: ValidatorClient | null = null
export const validator: ValidatorClient = new Proxy({} as ValidatorClient, {
  get(_, prop, receiver) {
    _singleton ??= new ValidatorClient()
    const value = Reflect.get(_singleton, prop, receiver)
    return typeof value === 'function' ? value.bind(_singleton) : value
  },
}) as ValidatorClient
