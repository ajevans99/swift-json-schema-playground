import type { ReactNode } from 'react'

interface HeaderProps {
  status?: ReactNode
  examples?: ReactNode
}

export function Header({ status, examples }: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <h1 className="truncate font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
          swift-json-schema-playground
        </h1>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          JSON Schema validation in the browser, powered by Swift → WASM
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        {examples}
        <span>{status ?? <span data-slot="status-placeholder">—</span>}</span>
      </div>
    </header>
  )
}

export default Header
