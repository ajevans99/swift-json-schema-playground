// Web Worker that hosts the Swift WebAssembly JSON Schema validator.
//
// Loads `validator.wasm` once at boot, instantiates it with:
//   • a `@bjorn3/browser_wasi_shim` WASI implementation,
//   • the JavaScriptKit JS runtime (vendored at `./runtime/runtime.mjs`)
//     to bridge `globalThis` between the wasm sandbox and JS,
//   • stub functions for the BridgeJS (`bjs`) imports the Swift toolchain
//     emits but our codepath never actually calls.
//
// Once the wasm has run its `_start` entry point, the Swift code has
// registered a `globalThis.swiftValidate(schemaJSON, instanceJSON)` function
// (a `JSClosure`). Every postMessage we receive is dispatched through it.

/// <reference lib="webworker" />

import {
  WASI,
  OpenFile,
  File,
  ConsoleStdout,
  PreopenDirectory,
  WASIProcExit,
} from '@bjorn3/browser_wasi_shim'

import { SwiftRuntime } from './runtime/runtime.mjs'
import type { ValidatorRequest, ValidatorResponse, ValidationOutcome } from './types.ts'
import { createRemoteResolver } from './remoteRefs'

declare const self: DedicatedWorkerGlobalScope & {
  swiftValidate?: (
    schema: string,
    instance: string,
    remoteSchemasJSON?: string,
  ) => string
}

// All BridgeJS (`bjs:`) imports the wasm module declares. The Swift code we
// run only uses `JSObject.global.X = .object(JSClosure)` style APIs, which
// flow through the `javascript_kit` import module — none of the bjs hooks
// should ever fire. We stub them with throwers so a regression here surfaces
// loudly instead of corrupting memory.
const BJS_IMPORT_NAMES = [
  'swift_js_throw',
  'swift_js_closure_unregister',
  'swift_js_pop_i32',
  'swift_js_push_i32',
  'swift_js_push_i64',
  'swift_js_pop_i64',
  'swift_js_pop_f32',
  'swift_js_push_f32',
  'swift_js_pop_f64',
  'swift_js_push_f64',
  'swift_js_init_memory_with_result',
  'swift_js_init_memory',
  'swift_js_return_string',
  'swift_js_push_string',
  'swift_js_retain',
  'swift_js_release',
  'swift_js_make_js_string',
  'swift_js_pop_pointer',
  'swift_js_push_pointer',
  'swift_js_return_optional_bool',
  'swift_js_get_optional_int_presence',
  'swift_js_get_optional_int_value',
  'swift_js_return_optional_int',
  'swift_js_get_optional_string',
  'swift_js_return_optional_string',
  'swift_js_return_optional_object',
  'swift_js_get_optional_heap_object_pointer',
  'swift_js_return_optional_heap_object',
  'swift_js_get_optional_float_presence',
  'swift_js_get_optional_float_value',
  'swift_js_return_optional_float',
  'swift_js_get_optional_double_presence',
  'swift_js_get_optional_double_value',
  'swift_js_return_optional_double',
] as const

function buildBjsStubs(): WebAssembly.ModuleImports {
  const stubs: Record<string, (...args: unknown[]) => never> = {}
  for (const name of BJS_IMPORT_NAMES) {
    stubs[name] = () => {
      throw new Error(
        `Unexpected call to BridgeJS import \`bjs.${name}\` — the Swift code is ` +
          `using BridgeJS bindings that this loader does not implement.`,
      )
    }
  }
  return stubs
}

/**
 * The vendored `SwiftRuntime.setInstance` rejects WASI executable modules
 * (anything exporting `_start`), but our wasm is a single-threaded WASI
 * executable. Hide `_start` from the runtime's reflective check while leaving
 * everything else intact, so we can still invoke `_start` ourselves through
 * the WASI shim afterwards.
 *
 * NOTE: we cannot wrap `instance.exports` in a `Proxy` and lie about `_start`
 * via `get`/`has` traps. The WebAssembly Instance namespace is a frozen object
 * whose properties are non-configurable + non-writable, and the JS Proxy
 * invariants forbid a `get` trap from returning `undefined` for such a
 * property — V8 / JSC throw `'get' on proxy: property '_start' is a read-only
 * and non-configurable data property on the proxy target ...`. So instead we
 * build a plain object that mirrors every export *except* `_start`, and hand
 * that to the runtime.
 */
function hideStartExport(instance: WebAssembly.Instance): WebAssembly.Instance {
  const filteredExports: Record<string, unknown> = {}
  for (const key of Object.keys(instance.exports)) {
    if (key === '_start') continue
    filteredExports[key] = (instance.exports as Record<string, unknown>)[key]
  }
  return new Proxy(instance, {
    get(target, prop, receiver) {
      if (prop === 'exports') return filteredExports
      return Reflect.get(target, prop, receiver)
    },
  })
}

function resolveWasmURL(): string {
  // `import.meta.env.BASE_URL` resolves to the Vite `base` (e.g.
  // `/swift-json-schema-playground/`). The wasm is copied to `public/` and so
  // is served at `${base}validator.wasm`.
  const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL
  return new URL(`${base}validator.wasm`, self.location.origin).href
}

async function instantiateWasm(): Promise<void> {
  const wasi = new WASI(
    [/* args */ 'validator.wasm'],
    [/* env */],
    [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered((line) => console.log('[validator.wasm]', line)),
      ConsoleStdout.lineBuffered((line) => console.error('[validator.wasm]', line)),
      new PreopenDirectory('/', new Map()),
    ],
    { debug: false },
  )

  const swift = new SwiftRuntime()

  const importObject: WebAssembly.Imports = {
    wasi_snapshot_preview1: wasi.wasiImport,
    javascript_kit: swift.wasmImports,
    bjs: buildBjsStubs(),
  }

  const url = resolveWasmURL()

  let instance: WebAssembly.Instance
  try {
    const result = await WebAssembly.instantiateStreaming(fetch(url), importObject)
    instance = result.instance
  } catch {
    // Some hosts (notably file:// and CDNs that mis-set the MIME type) reject
    // streaming compilation — fall back to a buffer-based instantiate.
    const bytes = await (await fetch(url)).arrayBuffer()
    const result = await WebAssembly.instantiate(bytes, importObject)
    instance = result.instance
  }

  swift.setInstance(hideStartExport(instance))

  // Run Swift main(). For a WASI executable that means `_start`, which
  // initialises the runtime and registers `globalThis.swiftValidate`.
  // `WASIProcExit(0)` is the normal "main returned" signal from the shim; any
  // other exception is a real failure.
  try {
    wasi.start(
      instance as Parameters<WASI['start']>[0],
    )
  } catch (e) {
    if (e instanceof WASIProcExit) {
      if (e.code !== 0) {
        throw new Error(`validator.wasm exited with non-zero status ${e.code}`, {
          cause: e,
        })
      }
      // status 0 — main() returned cleanly
    } else if (e instanceof swift.UnsafeEventLoopYield) {
      // Async Swift main yielded back to the JS event loop. Expected.
    } else {
      throw e
    }
  }

  if (typeof self.swiftValidate !== 'function') {
    throw new Error(
      'validator.wasm finished _start but did not register `globalThis.swiftValidate`.',
    )
  }
}

const ready: Promise<void> = instantiateWasm()

// One resolver per worker — its cache lives for the lifetime of the worker
// so the same external `$ref` URLs are only fetched once across many
// keystroke-driven validations.
const remoteResolver = createRemoteResolver()

self.addEventListener('message', async (event: MessageEvent<ValidatorRequest>) => {
  const { id, schema, instance } = event.data

  let response: ValidatorResponse
  try {
    await ready
    const fn = self.swiftValidate
    if (typeof fn !== 'function') {
      throw new Error('swiftValidate is not registered on globalThis')
    }
    // Pre-fetch any external $refs the schema points at. Failed fetches
    // are swallowed inside the resolver — the validator will surface
    // "Unable to resolve $ref" for those URLs as before.
    const remote = await remoteResolver.resolve(schema)
    const remoteSchemasJSON = Object.keys(remote).length > 0 ? JSON.stringify(remote) : ''
    const json = fn(schema, instance, remoteSchemasJSON)
    const result = JSON.parse(json) as ValidationOutcome
    response = { id, ok: true, result }
  } catch (err) {
    response = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  self.postMessage(response)
})
