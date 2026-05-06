import type * as monaco from 'monaco-editor'
import { MonacoJsonEditor } from './MonacoJsonEditor'

interface SchemaEditorProps {
  value: string
  onChange: (next: string) => void
  onMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoNs: typeof monaco,
  ) => void
}

export function SchemaEditor({ value, onChange, onMount }: SchemaEditorProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Schema
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          JSON
        </span>
      </header>
      <MonacoJsonEditor
        value={value}
        onChange={onChange}
        path="schema.json"
        ariaLabel="Schema JSON"
        onMount={onMount}
      />
    </section>
  )
}

export default SchemaEditor
