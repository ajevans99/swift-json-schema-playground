import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { SchemaEditor } from './components/SchemaEditor'
import { InstanceEditor } from './components/InstanceEditor'
import { ResultsPanel } from './components/ResultsPanel'
import { loadPersistedState, savePersistedState } from './storage'

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

function App() {
  const [schema, setSchema] = useState<string>(
    () => loadPersistedState()?.schema ?? DEFAULT_SCHEMA,
  )
  const [instance, setInstance] = useState<string>(
    () => loadPersistedState()?.instance ?? DEFAULT_INSTANCE,
  )

  useEffect(() => {
    const handle = setTimeout(() => {
      savePersistedState({ schema, instance })
    }, 300)
    return () => clearTimeout(handle)
  }, [schema, instance])

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <SchemaEditor value={schema} onChange={setSchema} />
          <InstanceEditor value={instance} onChange={setInstance} />
        </div>
        <ResultsPanel state="idle" errors={null} />
      </main>
    </div>
  )
}

export default App
