import { useCallback, useEffect, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'
import { Header } from './components/Header'
import { SchemaEditor } from './components/SchemaEditor'
import { InstanceEditor } from './components/InstanceEditor'
import {
  ResultsPanel,
  type ResultsState,
} from './components/ResultsPanel'
import {
  ExamplesMenu,
  type ExamplesMenuStatus,
} from './components/ExamplesMenu'
import { loadPersistedState, savePersistedState } from './storage'
import { resolveErrorTarget } from './editor/errorTarget'
import type { ValidationError } from './types'
import { validator } from './validator/client'
import {
  DEFAULT_EXAMPLE_ID,
  buildExampleHash,
  findExampleById,
  parseExampleFromHash,
  type Example,
} from './examples/registry'
import { loadExample } from './examples/loader'

// Tiny built-in defaults used only as a last-resort fallback if the
// default example fails to fetch (e.g. user is offline). The default
// "first run" experience is now the JSON Schema 2020-12 meta-schema
// loaded by ID; see {@link DEFAULT_EXAMPLE_ID}.
const FALLBACK_SCHEMA = `${JSON.stringify(
  {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  null,
  2,
)}\n`

const FALLBACK_INSTANCE = `${JSON.stringify({ name: 'Alice' }, null, 2)}\n`

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

interface InitialState {
  schema: string
  instance: string
  /** Example to auto-fetch on mount (overrides schema/instance once it loads). */
  pendingExample: Example | null
  /** The example whose contents are currently in the editors, if any. */
  loadedExample: Example | null
}

function computeInitialState(): InitialState {
  // 1. URL hash takes precedence — it makes example URLs sharable.
  const hashExample =
    typeof window !== 'undefined'
      ? parseExampleFromHash(window.location.hash)
      : null
  if (hashExample) {
    // Show fallback contents until the fetch resolves; the loaded example
    // will replace them.
    return {
      schema: FALLBACK_SCHEMA,
      instance: FALLBACK_INSTANCE,
      pendingExample: hashExample,
      loadedExample: null,
    }
  }

  // 2. localStorage — returning users get whatever they were last editing.
  const persisted = loadPersistedState()
  if (persisted) {
    return {
      schema: persisted.schema,
      instance: persisted.instance,
      pendingExample: null,
      loadedExample: null,
    }
  }

  // 3. First-time visitors get the JSON Schema meta-schema example.
  const defaultExample = findExampleById(DEFAULT_EXAMPLE_ID)
  return {
    schema: FALLBACK_SCHEMA,
    instance: FALLBACK_INSTANCE,
    pendingExample: defaultExample,
    loadedExample: null,
  }
}

function App() {
  const [initial] = useState<InitialState>(computeInitialState)
  const [schema, setSchema] = useState<string>(initial.schema)
  const [instance, setInstance] = useState<string>(initial.instance)

  const [validationState, setValidationState] = useState<ResultsState>('idle')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [loadedExample, setLoadedExample] = useState<Example | null>(
    initial.loadedExample,
  )
  const [examplesStatus, setExamplesStatus] = useState<ExamplesMenuStatus>(
    initial.pendingExample
      ? { kind: 'loading', example: initial.pendingExample }
      : { kind: 'idle' },
  )

  // When true, the next user-driven onChange in either editor is treated
  // as "user diverged from the loaded example" and clears both the loaded
  // example state and the URL hash. Set to true after we programmatically
  // populate the editors with an example's contents.
  const armedForDivergenceRef = useRef<boolean>(false)

  const schemaEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const instanceEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const monacoRef = useRef<typeof monaco | null>(null)

  // Tracks the latest in-flight example fetch so a stale response can't
  // overwrite a newer selection.
  const pendingExampleRef = useRef<Example | null>(null)

  const applyExample = useCallback(async (example: Example) => {
    pendingExampleRef.current = example
    setExamplesStatus({ kind: 'loading', example })
    try {
      const { schema: nextSchema, instance: nextInstance } =
        await loadExample(example)
      // Bail if a newer selection superseded us.
      if (pendingExampleRef.current !== example) return
      armedForDivergenceRef.current = true
      setSchema(nextSchema)
      setInstance(nextInstance)
      setLoadedExample(example)
      setExamplesStatus({ kind: 'idle' })
      // Reflect the selection in the URL so it's sharable.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', buildExampleHash(example.id))
      }
    } catch (err) {
      if (pendingExampleRef.current !== example) return
      const message = err instanceof Error ? err.message : String(err)
      setExamplesStatus({ kind: 'error', example, message })
    }
  }, [])

  // Auto-load the example chosen by hash/default on first mount. The
  // initial `examplesStatus` was already initialized to a "loading" state
  // by `useState`, so this effect only kicks off the async fetch — any
  // resulting state updates happen asynchronously.
  useEffect(() => {
    if (initial.pendingExample) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void applyExample(initial.pendingExample)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep state in sync if the user navigates via back/forward to a
  // different `#example=` anchor.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onHashChange = () => {
      const next = parseExampleFromHash(window.location.hash)
      if (next && next !== loadedExample) {
        void applyExample(next)
      } else if (!next && loadedExample) {
        // Hash was cleared externally; drop our loaded-example marker but
        // leave the editor contents alone.
        setLoadedExample(null)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [applyExample, loadedExample])

  const handleSchemaChange = useCallback((next: string) => {
    setSchema(next)
    if (armedForDivergenceRef.current) {
      armedForDivergenceRef.current = false
      setLoadedExample(null)
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        )
      }
    }
  }, [])

  const handleInstanceChange = useCallback((next: string) => {
    setInstance(next)
    if (armedForDivergenceRef.current) {
      armedForDivergenceRef.current = false
      setLoadedExample(null)
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        )
      }
    }
  }, [])

  const handleClearExample = useCallback(() => {
    setLoadedExample(null)
    armedForDivergenceRef.current = false
    setExamplesStatus({ kind: 'idle' })
    pendingExampleRef.current = null
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    }
  }, [])

  const handleClearSchema = useCallback(() => {
    setSchema('')
    handleClearExample()
  }, [handleClearExample])

  const handleClearInstance = useCallback(() => {
    setInstance('')
    handleClearExample()
  }, [handleClearExample])

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

  const examples = (
    <ExamplesMenu
      selected={loadedExample}
      status={examplesStatus}
      onSelect={(example) => void applyExample(example)}
      onClear={handleClearExample}
      onRetry={(example) => void applyExample(example)}
    />
  )

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header status={status} examples={examples} />
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <SchemaEditor
            value={schema}
            onChange={handleSchemaChange}
            onClear={handleClearSchema}
            onMount={(editor, monacoNs) => {
              schemaEditorRef.current = editor
              monacoRef.current = monacoNs
            }}
          />
          <InstanceEditor
            value={instance}
            onChange={handleInstanceChange}
            onClear={handleClearInstance}
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
