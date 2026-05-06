const KEY = 'swift-json-schema-playground:v1'

export interface PersistedState {
  schema: string
  instance: string
}

function isPersistedState(value: unknown): value is PersistedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).schema === 'string' &&
    typeof (value as Record<string, unknown>).instance === 'string'
  )
}

export function loadPersistedState(): PersistedState | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw == null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isPersistedState(parsed)) return null
    return { schema: parsed.schema, instance: parsed.instance }
  } catch {
    return null
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state))
  } catch {
    // Swallow storage errors (private mode, quota exceeded, disabled, etc.).
  }
}
