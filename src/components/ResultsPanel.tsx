import type { ValidationError } from '../types'

export type ResultsState = 'idle' | 'validating' | 'valid' | 'invalid' | 'error'

interface ResultsPanelProps {
  errors: ValidationError[] | null
  state: ResultsState
}

const STATE_LABEL: Record<ResultsState, string> = {
  idle: 'No validation run yet.',
  validating: 'Validating…',
  valid: 'Instance is valid against the schema.',
  invalid: 'Instance is invalid.',
  error: 'Validator encountered an error.',
}

const STATE_TONE: Record<ResultsState, string> = {
  idle: 'text-slate-500 dark:text-slate-400',
  validating: 'text-slate-600 dark:text-slate-300',
  valid: 'text-emerald-600 dark:text-emerald-400',
  invalid: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
}

export function ResultsPanel({ errors, state }: ResultsPanelProps) {
  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Results
        </h2>
        <span
          className={`text-[10px] font-medium uppercase tracking-wide ${STATE_TONE[state]}`}
        >
          {state}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <p className={`text-sm ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</p>
        {errors && errors.length > 0 && (
          <ul className="mt-3 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-200">
            {errors.map((error, index) => (
              <li
                key={`${error.instancePath}-${error.schemaPath}-${index}`}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-800/50"
              >
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {error.keyword}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  at{' '}
                  <code>{error.instancePath || '/'}</code>
                </span>
                <span className="block text-slate-700 dark:text-slate-200">
                  {error.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default ResultsPanel
