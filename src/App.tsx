import { useEffect, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'
import { Header } from './components/Header'
import { SchemaEditor } from './components/SchemaEditor'
import { InstanceEditor } from './components/InstanceEditor'
import {
  ResultsPanel,
  type ResultsState,
} from './components/ResultsPanel'
import { loadPersistedState, savePersistedState } from './storage'
import { resolveErrorTarget } from './editor/errorTarget'
import type { ValidationError } from './types'
import { validator } from './validator/client'

const DEFAULT_SCHEMA = `${JSON.stringify(
  {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  null,
  2,
)}\n`

const DEFAULT_INSTANCE = `${JSON.stringify({ name: 'Alice' }, null, 2)}\n`

const MARKER_OWNER = 'swift-json-schema'
const VALIDATION_DEBOUNCE_MS = 300

const STATUS_DOT: Record<ResultsState, string> = {
  idle: 'bg-slate-400',
  validating: 'bg-sky-500 animate-pulse',
  valid: 'bg-emerald-500',
  invalid: 'bg-amber-500',
  error: 'bg-red-500',
}

const STATUS_LABEL: Record<ResultsState, string> = {
  idle: 'Idle',
  validating: 'Validating…',
  valid: 'Valid',
  invalid: 'Invalid',
  error: 'Error',
}

function isAbortError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'AbortError'
  )
}

function App() {
  const [schema, setSchema] = useState<string>(
    () => loadPersistedState()?.schema ?? DEFAULT_SCHEMA,
  )
  const [instance, setInstance] = useState<string>(
    () => loadPersistedState()?.instance ?? DEFAULT_INSTANCE,
  )

  const [validationState, setValidationState] = useState<ResultsState>('idle')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const schemaEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const instanceEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const monacoRef = useRef<typeof monaco | null>(null)

  // Persist schema/instance to localStorage (300 ms debounce).
  useEffect(() => {
    const handle = setTimeout(() => {
      savePersistedState({ schema, instance })
    }, 300)
    return () => clearTimeout(handle)
  }, [schema, instance])

  // Debounced re-validation on edit. Older calls are superseded by the
  // ValidatorClient and reject with AbortError, which we silently ignore so
  // the UI only ever reflects the freshest result.
  useEffect(() => {
    const handle = setTimeout(() => {
      setValidationState('validating')
      validator
        .validate(schema, instance)
        .then((result) => {
          setErrors(result.errors)
          setValidationState(result.valid ? 'valid' : 'invalid')
          setErrorMessage(null)
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return
          setValidationState('error')
          setErrors([])
          setErrorMessage(
            err instanceof Error ? err.message : String(err),
          )
        })
    }, VALIDATION_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [schema, instance])

  // Apply Monaco markers (squiggles) on each editor's model whenever the
  // error set or underlying text changes. Skips silently if the editors
  // haven't mounted yet.
  useEffect(() => {
    const monacoNs = monacoRef.current
    const schemaEditor = schemaEditorRef.current
    const instanceEditor = instanceEditorRef.current
    if (!monacoNs || !schemaEditor || !instanceEditor) return

    const schemaModel = schemaEditor.getModel()
    const instanceModel = instanceEditor.getModel()
    if (!schemaModel || !instanceModel) return

    const clear = () => {
      monacoNs.editor.setModelMarkers(schemaModel, MARKER_OWNER, [])
      monacoNs.editor.setModelMarkers(instanceModel, MARKER_OWNER, [])
    }

    if (validationState !== 'invalid' || errors.length === 0) {
      clear()
      return
    }

    const schemaMarkers: monaco.editor.IMarkerData[] = []
    const instanceMarkers: monaco.editor.IMarkerData[] = []
    for (const error of errors) {
      const resolved = resolveErrorTarget(error, schema, instance)
      if (!resolved) continue
      const marker: monaco.editor.IMarkerData = {
        severity: monacoNs.MarkerSeverity.Error,
        message: `${error.keyword}: ${error.message}`,
        startLineNumber: resolved.range.startLineNumber,
        startColumn: resolved.range.startColumn,
        endLineNumber: resolved.range.endLineNumber,
        endColumn: resolved.range.endColumn,
      }
      if (resolved.target === 'instance') {
        instanceMarkers.push(marker)
      } else {
        schemaMarkers.push(marker)
      }
    }

    monacoNs.editor.setModelMarkers(schemaModel, MARKER_OWNER, schemaMarkers)
    monacoNs.editor.setModelMarkers(
      instanceModel,
      MARKER_OWNER,
      instanceMarkers,
    )
  }, [errors, validationState, schema, instance])

  const handleErrorClick = (error: ValidationError) => {
    const monacoNs = monacoRef.current
    const schemaEditor = schemaEditorRef.current
    const instanceEditor = instanceEditorRef.current
    if (!monacoNs || !schemaEditor || !instanceEditor) return

    const resolved = resolveErrorTarget(error, schema, instance)
    if (!resolved) return

    const editor =
      resolved.target === 'instance' ? instanceEditor : schemaEditor
    editor.focus()
    editor.revealRangeInCenter(
      resolved.range,
      monacoNs.editor.ScrollType.Smooth,
    )
    editor.setSelection(resolved.range)
  }

  const status = (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[validationState]}`}
        aria-hidden="true"
      />
      <span>{STATUS_LABEL[validationState]}</span>
    </span>
  )

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header status={status} />
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <SchemaEditor
            value={schema}
            onChange={setSchema}
            onMount={(editor, monacoNs) => {
              schemaEditorRef.current = editor
              monacoRef.current = monacoNs
            }}
          />
          <InstanceEditor
            value={instance}
            onChange={setInstance}
            onMount={(editor, monacoNs) => {
              instanceEditorRef.current = editor
              monacoRef.current = monacoNs
            }}
          />
        </div>
        <ResultsPanel
          state={validationState}
          errors={errors}
          errorMessage={errorMessage}
          onErrorClick={handleErrorClick}
        />
      </main>
    </div>
  )
}

export default App
