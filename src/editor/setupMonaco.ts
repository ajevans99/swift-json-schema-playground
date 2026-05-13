import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { loader } from '@monaco-editor/react'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  schemas: [],
  enableSchemaRequest: false,
  // The Swift WASM validator is the source of truth for schema validation;
  // Monaco's JSON language service is only here for parse / syntax help.
  // Suppress the "Unable to load schema from '<$schema URL>'. No schema
  // request service available" diagnostic that Monaco emits whenever a
  // document declares a `$schema` we deliberately don't fetch. We also
  // silence its own schema-based validation pass so it doesn't compete
  // with the WASM validator's results in the gutter.
  schemaRequest: 'ignore',
  schemaValidation: 'ignore',
})

// Custom dark theme that aligns the Monaco editor surface with the rest of
// the UI (Tailwind `slate-*` palette). The default `vs-dark` theme uses a
// warm-toned `#1e1e1e` background and `#CE9178` strings, which clash with
// the cool blue-grey slate UI and read as "brown" on these JSON-heavy
// editors. This theme keeps Monaco's structural colors but swaps the
// surface to slate-900 (matching the section backgrounds) and string-like
// tokens to cool sky/teal/violet hues.
monaco.editor.defineTheme('playground-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '7DD3FC' }, // sky-300
    { token: 'string.value.json', foreground: '5EEAD4' }, // teal-300
    { token: 'string', foreground: '5EEAD4' },
    { token: 'number', foreground: 'C4B5FD' }, // violet-300
    { token: 'keyword.json', foreground: 'F0ABFC' }, // fuchsia-300 (true/false/null)
    { token: 'delimiter', foreground: '94A3B8' }, // slate-400
  ],
  colors: {
    'editor.background': '#0F172A', // slate-900
    'editor.foreground': '#E2E8F0', // slate-200
    'editorLineNumber.foreground': '#475569', // slate-600
    'editorLineNumber.activeForeground': '#94A3B8', // slate-400
    'editor.lineHighlightBackground': '#1E293B', // slate-800
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#33415599', // slate-700 @ 60%
    'editor.inactiveSelectionBackground': '#33415566',
    'editor.selectionHighlightBackground': '#33415544',
    'editorCursor.foreground': '#CBD5E1', // slate-300
    'editorWhitespace.foreground': '#1E293B',
    'editorIndentGuide.background1': '#1E293B',
    'editorIndentGuide.activeBackground1': '#475569',
    'editorBracketMatch.background': '#33415566',
    'editorBracketMatch.border': '#64748B',
    'editorWidget.background': '#0F172A',
    'editorWidget.border': '#334155',
    'editorSuggestWidget.background': '#0F172A',
    'editorSuggestWidget.border': '#334155',
    'editorSuggestWidget.selectedBackground': '#1E293B',
    'editorHoverWidget.background': '#0F172A',
    'editorHoverWidget.border': '#334155',
    'editorGutter.background': '#0F172A',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#33415566',
    'scrollbarSlider.hoverBackground': '#475569AA',
    'scrollbarSlider.activeBackground': '#64748BAA',
    'minimap.background': '#0F172A',
  },
})

// Matching light theme so editors blend with the white section surfaces in
// light mode. Uses Tailwind `slate-*` for chrome and a calmer cyan/teal
// palette for tokens to mirror the dark theme's tone.
monaco.editor.defineTheme('playground-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '0369A1' }, // sky-700
    { token: 'string.value.json', foreground: '0F766E' }, // teal-700
    { token: 'string', foreground: '0F766E' },
    { token: 'number', foreground: '6D28D9' }, // violet-700
    { token: 'keyword.json', foreground: 'A21CAF' }, // fuchsia-700
    { token: 'delimiter', foreground: '475569' }, // slate-600
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#0F172A', // slate-900
    'editorLineNumber.foreground': '#94A3B8', // slate-400
    'editorLineNumber.activeForeground': '#475569', // slate-600
    'editor.lineHighlightBackground': '#F1F5F9', // slate-100
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#334155', // slate-700
    'editorIndentGuide.background1': '#E2E8F0',
    'editorIndentGuide.activeBackground1': '#94A3B8',
    'editorGutter.background': '#FFFFFF',
  },
})

export {}
