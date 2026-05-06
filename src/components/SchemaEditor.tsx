interface SchemaEditorProps {
  value: string
  onChange: (next: string) => void
}

export function SchemaEditor({ value, onChange }: SchemaEditorProps) {
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <p className="border-b border-dashed border-slate-200 px-3 py-1 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Schema editor (Monaco) — coming soon
        </p>
        <textarea
          aria-label="Schema JSON"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
      </div>
    </section>
  )
}

export default SchemaEditor
