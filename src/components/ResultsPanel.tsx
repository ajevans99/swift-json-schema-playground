import type { ValidationError } from '../types'

export type ResultsState = 'idle' | 'validating' | 'valid' | 'invalid' | 'error'

interface ResultsPanelProps {
  errors: ValidationError[]
  state: ResultsState
  errorMessage?: string | null
  onErrorClick?: (error: ValidationError) => void
}

const STATE_TONE: Record<ResultsState, string> = {
  idle: 'text-slate-500 dark:text-slate-400',
  validating: 'text-sky-600 dark:text-sky-400',
  valid: 'text-emerald-600 dark:text-emerald-400',
  invalid: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
}

function summary(state: ResultsState, errorCount: number): string {
  switch (state) {
    case 'idle':
      return 'Idle'
    case 'validating':
      return 'Validating…'
    case 'valid':
      return 'Valid'
    case 'invalid':
      return `${errorCount} error${errorCount === 1 ? '' : 's'}`
    case 'error':
      return 'Validator error'
  }
}

export function ResultsPanel({
  errors,
  state,
  errorMessage,
  onErrorClick,
}: ResultsPanelProps) {
  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Results
        </h2>
        <span
          className={`text-[11px] font-medium uppercase tracking-wide ${STATE_TONE[state]}`}
        >
          {summary(state, errors.length)}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {state === 'idle' && (
          <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
            Edit the schema or instance to validate.
          </p>
        )}
        {state === 'validating' && (
          <p className="animate-pulse p-3 text-sm text-sky-600 dark:text-sky-400">
            Validating…
          </p>
        )}
        {state === 'valid' && (
          <p className="p-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Instance is valid against the schema.
          </p>
        )}
        {state === 'error' && (
          <div className="m-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Validator error</p>
            {errorMessage && (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                {errorMessage}
              </pre>
            )}
          </div>
        )}
        {state === 'invalid' && errors.length > 0 && (
          <ul
            className="divide-y divide-slate-100 dark:divide-slate-800"
            aria-label="Validation errors"
          >
            {errors.map((error, index) => (
              <li key={`${error.instancePath}|${error.schemaPath}|${index}`}>
                <button
                  type="button"
                  onClick={() => onErrorClick?.(error)}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                      {error.instancePath || '(root)'}
                    </code>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      {error.keyword}
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">
                      {error.message}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    schema: {error.schemaPath || '(root)'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {state === 'invalid' && errors.length === 0 && (
          <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
            Invalid, but the validator returned no errors.
          </p>
        )}
      </div>
    </section>
  )
}

export default ResultsPanel
