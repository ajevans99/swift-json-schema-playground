import type { ReactNode } from 'react'
import {
  SWIFT_JSON_SCHEMA_VERSION,
  swiftJSONSchemaReleaseURL,
} from '../swiftJSONSchemaVersion'

export const PLAYGROUND_REPO_URL =
  'https://github.com/ajevans99/swift-json-schema-playground'

interface HeaderProps {
  status?: ReactNode
  examples?: ReactNode
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12.02C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

export function Header({ status, examples }: HeaderProps) {
  const versionLabel =
    SWIFT_JSON_SCHEMA_VERSION === 'unknown'
      ? 'swift-json-schema'
      : `swift-json-schema v${SWIFT_JSON_SCHEMA_VERSION}`
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
          <span className="truncate">JSON Schema Playground</span>
          <a
            href={PLAYGROUND_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View JSON Schema Playground on GitHub"
            title="View JSON Schema Playground on GitHub"
            className="inline-flex shrink-0 items-center text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <GitHubMark className="h-4 w-4" />
          </a>
        </h1>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          Powered by{' '}
          <a
            href={swiftJSONSchemaReleaseURL()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline decoration-dotted underline-offset-2 hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-400"
            title={`View ${versionLabel} on GitHub`}
          >
            {versionLabel}
          </a>{' '}
          compiled to WASM
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
