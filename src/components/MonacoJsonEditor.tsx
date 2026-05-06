import Editor from '@monaco-editor/react'
import { useMonacoTheme } from '../editor/useMonacoTheme'

interface MonacoJsonEditorProps {
  value: string
  onChange: (next: string) => void
  path: string
  ariaLabel?: string
}

export function MonacoJsonEditor({ value, onChange, path, ariaLabel }: MonacoJsonEditorProps) {
  const theme = useMonacoTheme()

  return (
    <div className="min-h-0 flex-1" aria-label={ariaLabel}>
      <Editor
        height="100%"
        language="json"
        theme={theme}
        value={value}
        path={path}
        onChange={(next) => onChange(next ?? '')}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 13,
          tabSize: 2,
          wordWrap: 'on',
          lineNumbers: 'on',
          renderLineHighlight: 'all',
        }}
      />
    </div>
  )
}

export default MonacoJsonEditor
