import { useCallback, useEffect, useState } from 'react'
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

interface ResultPayload {
  valid: boolean
  errors: ValidationError[]
  runtimeError?: string
}

/**
 * Build the JSON payload exposed via Copy / Download. Mirrors the shape the
 * Swift WASM validator returns over the wire (`{ valid, errors }`), with an
 * optional `runtimeError` field for the rare `state === 'error'` path so
 * downloaders see *something* instead of an empty errors array.
 */
function buildResultPayload(
  state: ResultsState,
  errors: ValidationError[],
  errorMessage: string | null | undefined,
): ResultPayload {
  if (state === 'error') {
    return {
      valid: false,
      errors: [],
      runtimeError: errorMessage ?? 'Unknown validator error',
    }
  }
  return { valid: state === 'valid', errors }
}

function formatPayload(payload: ResultPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

function downloadFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `validation-result-${ts}.json`
}

/** Trigger a browser download of `text` as `filename`. */
function triggerDownload(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Defer revoke so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Copy text to clipboard, returning whether the copy succeeded. */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ResultsPanel({
  errors,
  state,
  errorMessage,
  onErrorClick,
}: ResultsPanelProps) {
  const exportable = state === 'valid' || state === 'invalid' || state === 'error'

  // "Copied!" badge state — flips back to "Copy" after a moment.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  useEffect(() => {
    if (copyState === 'idle') return
    const handle = setTimeout(() => setCopyState('idle'), 1500)
    return () => clearTimeout(handle)
  }, [copyState])

  const handleCopy = useCallback(async () => {
    const text = formatPayload(buildResultPayload(state, errors, errorMessage))
    const ok = await copyToClipboard(text)
    setCopyState(ok ? 'copied' : 'failed')
  }, [state, errors, errorMessage])

  const handleDownload = useCallback(() => {
    const text = formatPayload(buildResultPayload(state, errors, errorMessage))
    triggerDownload(text, downloadFilename())
  }, [state, errors, errorMessage])

  const copyLabel =
    copyState === 'copied'
      ? 'Copied!'
      : copyState === 'failed'
        ? 'Copy failed'
        : 'Copy'

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Results
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!exportable}
            className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Copy validation result JSON to clipboard"
            aria-label="Copy validation result JSON to clipboard"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!exportable}
            className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Download validation result as JSON"
            aria-label="Download validation result as JSON"
          >
            Download
          </button>
          <span
            className={`text-[11px] font-medium uppercase tracking-wide ${STATE_TONE[state]}`}
          >
            {summary(state, errors.length)}
          </span>
        </div>
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
