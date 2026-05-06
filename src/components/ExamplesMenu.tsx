import { useId } from 'react'
import type { ChangeEvent } from 'react'
import type { Example } from '../examples/registry'
import { EXAMPLES } from '../examples/registry'

export type ExamplesMenuStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; example: Example }
  | { kind: 'error'; example: Example; message: string }

interface ExamplesMenuProps {
  /** Currently loaded example (controls the `<select>` value), or `null`. */
  selected: Example | null
  status: ExamplesMenuStatus
  onSelect: (example: Example) => void
  onClear: () => void
  onRetry: (example: Example) => void
}

const PLACEHOLDER_VALUE = ''

export function ExamplesMenu({
  selected,
  status,
  onSelect,
  onClear,
  onRetry,
}: ExamplesMenuProps) {
  const labelId = useId()
  const isLoading = status.kind === 'loading'
  const value = selected?.id ?? PLACEHOLDER_VALUE

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (!id) return
    const example = EXAMPLES.find((x) => x.id === id)
    if (example) onSelect(example)
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <label id={labelId} className="sr-only">
        Load example schema
      </label>
      <div className="relative">
        <select
          aria-labelledby={labelId}
          value={value}
          onChange={handleChange}
          disabled={isLoading}
          title={selected?.description ?? 'Load a real-world example schema'}
          className="appearance-none rounded border border-slate-300 bg-white py-1 pl-2 pr-7 font-medium text-slate-700 shadow-sm hover:border-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
        >
          <option value={PLACEHOLDER_VALUE}>
            {selected ? 'Examples ▾' : 'Examples ▾'}
          </option>
          {EXAMPLES.map((example) => (
            <option key={example.id} value={example.id} title={example.description}>
              {example.name}
            </option>
          ))}
        </select>
      </div>
      {selected && !isLoading && status.kind !== 'error' && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear loaded example "${selected.name}"`}
          title="Clear loaded example (keeps editor contents)"
          className="rounded border border-transparent px-1.5 py-0.5 font-mono text-slate-500 hover:border-slate-300 hover:text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
        >
          ✕
        </button>
      )}
      {status.kind === 'loading' && (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500"
          />
          Loading {status.example.name}…
        </span>
      )}
      {status.kind === 'error' && (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"
        >
          Failed to load {status.example.name}
          <button
            type="button"
            onClick={() => onRetry(status.example)}
            className="rounded border border-red-300 px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Retry
          </button>
        </span>
      )}
    </div>
  )
}

export default ExamplesMenu
