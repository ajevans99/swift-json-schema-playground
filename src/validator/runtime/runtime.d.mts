// Hand-rolled types for the vendored JavaScriptKit JS runtime
// (`runtime.mjs`, copied verbatim from
// `wasm/.build/checkouts/JavaScriptKit/Plugins/PackageToJS/Templates/runtime.mjs`).
//
// We only consume the small subset documented here. The upstream
// `runtime.d.ts` template ships preprocessor markers and would require
// a build step to consume directly.

export class SwiftRuntime {
  constructor(options?: Record<string, unknown>)

  /** WebAssembly imports the `javascript_kit` module must provide. */
  readonly wasmImports: WebAssembly.ModuleImports

  /**
   * Records the WebAssembly instance and wires up memory views.
   * Throws if `instance.exports._start` is a function (reactor ABI is required);
   * callers building from a WASI executable must hide `_start` via a Proxy
   * before passing the instance in.
   */
  setInstance(instance: WebAssembly.Instance): void

  /** Sentinel error class thrown by Swift Concurrency's main-drain hook. */
  readonly UnsafeEventLoopYield: { new (...args: unknown[]): Error } & {
    [Symbol.hasInstance](value: unknown): boolean
  }
}
