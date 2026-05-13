/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read the pinned `swift-json-schema` version from `wasm/Package.resolved`
// at config-eval time so the UI can surface it (with a link to the matching
// GitHub release). Falls back to "unknown" if the file is missing or the
// pin can't be located — the UI degrades to a plain repo link in that case.
function readSwiftJSONSchemaVersion(): string {
  try {
    const path = resolve(__dirname, 'wasm/Package.resolved')
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      pins?: Array<{ identity?: string; state?: { version?: string } }>
    }
    const pin = data.pins?.find((p) => p.identity === 'swift-json-schema')
    return pin?.state?.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/swift-json-schema-playground/',
  plugins: [react(), tailwindcss()],
  define: {
    // Replaced as a string literal at build time. See
    // `src/swiftJSONSchemaVersion.ts` for the consumer side.
    __SWIFT_JSON_SCHEMA_VERSION__: JSON.stringify(readSwiftJSONSchemaVersion()),
  },
  // The validator worker (`src/validator/worker.ts`) imports ES modules
  // (the vendored JavaScriptKit runtime + `@bjorn3/browser_wasi_shim`), so
  // it must be emitted as an ES module worker rather than the default IIFE.
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'wasm/**'],
  },
})
