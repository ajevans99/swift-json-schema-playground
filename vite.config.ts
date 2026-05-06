/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/swift-json-schema-playground/',
  plugins: [react(), tailwindcss()],
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
