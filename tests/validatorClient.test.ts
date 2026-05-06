import { describe, expect, test, vi } from 'vitest'

import { ValidatorClient, type WorkerLike } from '../src/validator/client.ts'
import type {
  ValidationOutcome,
  ValidatorRequest,
  ValidatorResponse,
} from '../src/validator/types.ts'

type ResponseBuilder = (req: ValidatorRequest) => ValidatorResponse | Promise<ValidatorResponse>

interface FakeWorker extends WorkerLike {
  posted: ValidatorRequest[]
  terminated: boolean
  terminate: ReturnType<typeof vi.fn>
  /** Test helper: manually fire an event at all registered listeners. */
  emit(response: ValidatorResponse): void
}

function createFakeWorker(build: ResponseBuilder): FakeWorker {
  const listeners = new Set<(event: MessageEvent<ValidatorResponse>) => void>()
  const posted: ValidatorRequest[] = []
  let terminated = false
  const terminate = vi.fn(() => {
    terminated = true
  })

  const emit = (response: ValidatorResponse) => {
    const event = { data: response } as MessageEvent<ValidatorResponse>
    for (const l of listeners) l(event)
  }

  const fake: FakeWorker = {
    posted,
    get terminated() {
      return terminated
    },
    terminate,
    emit,
    postMessage(message) {
      posted.push(message)
      Promise.resolve(build(message)).then(emit)
    },
    addEventListener(_type, listener) {
      listeners.add(listener)
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener)
    },
  }
  return fake
}

const successOutcome: ValidationOutcome = {
  valid: true,
  errors: [],
}

describe('ValidatorClient', () => {
  test('resolves with the worker-supplied result', async () => {
    const worker = createFakeWorker((req) => ({
      id: req.id,
      ok: true,
      result: successOutcome,
    }))
    const client = new ValidatorClient(worker)

    const result = await client.validate('{"type":"string"}', '"hi"')
    expect(result).toEqual(successOutcome)
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0]).toMatchObject({
      schema: '{"type":"string"}',
      instance: '"hi"',
    })
  })

  test('rejects when the worker reports an error', async () => {
    const worker = createFakeWorker((req) => ({
      id: req.id,
      ok: false,
      error: 'boom',
    }))
    const client = new ValidatorClient(worker)

    await expect(client.validate('{}', '{}')).rejects.toThrow('boom')
  })

  test('supersedes the previous in-flight request with an AbortError', async () => {
    // Build responses keyed by id so we can deliver them in a controlled order.
    const pending = new Map<number, (response: ValidatorResponse) => void>()
    const worker = createFakeWorker(
      (req) =>
        new Promise<ValidatorResponse>((resolve) => {
          pending.set(req.id, resolve)
        }),
    )
    const client = new ValidatorClient(worker)

    const first = client.validate('{}', '1')
    const second = client.validate('{}', '2')

    // The first promise must reject before either response arrives, with an
    // AbortError-shaped exception. We assert via `.name` so the check works
    // both when DOMException is available (browsers + recent Node) and when
    // we fall back to a tagged Error.
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })

    // Now deliver the (now-stale) response for the first id — it must be
    // ignored, and the second promise must still resolve when its response
    // arrives.
    const firstId = worker.posted[0].id
    const secondId = worker.posted[1].id
    pending.get(firstId)!({ id: firstId, ok: true, result: successOutcome })
    // Yield so the (ignored) message is delivered before the second.
    await Promise.resolve()
    pending.get(secondId)!({
      id: secondId,
      ok: true,
      result: { valid: false, errors: [] },
    })

    await expect(second).resolves.toEqual({ valid: false, errors: [] })
  })

  test('discards messages whose id no longer matches the live request', async () => {
    // Use a worker whose echo we control manually.
    let resolveBuild: ((response: ValidatorResponse) => void) | null = null
    const worker = createFakeWorker(
      () =>
        new Promise<ValidatorResponse>((resolve) => {
          resolveBuild = resolve
        }),
    )
    const client = new ValidatorClient(worker)
    const promise = client.validate('{}', '{}')
    const liveId = worker.posted[0].id

    // Fire a stale event with a wrong id — it must be silently ignored.
    worker.emit({ id: liveId + 1000, ok: true, result: { valid: false, errors: [] } })

    // Now resolve the real build with the matching id.
    resolveBuild!({ id: liveId, ok: true, result: successOutcome })
    await expect(promise).resolves.toEqual(successOutcome)
  })

  test('terminate() shuts down the worker and rejects in-flight work', async () => {
    const worker = createFakeWorker(
      () => new Promise<ValidatorResponse>(() => {}), // never settles
    )
    const client = new ValidatorClient(worker)

    const inflight = client.validate('{}', '{}')
    client.terminate()
    expect(worker.terminate).toHaveBeenCalledTimes(1)

    await expect(inflight).rejects.toMatchObject({ name: 'AbortError' })
    await expect(client.validate('{}', '{}')).rejects.toThrow(/terminated/)
    // Calling terminate again is a no-op.
    client.terminate()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
