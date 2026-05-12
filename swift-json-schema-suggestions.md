# swift-json-schema — API suggestions

Living document of friction points and proposed API improvements discovered while building swift-json-schema-playground.

## Suggestions

### `JSONPointer.description` only emits the `#/...` URI-fragment form
- **Context**: Mapping `ValidationError.instanceLocation` and `keywordLocation` to the `instancePath` / `schemaPath` strings the playground UI surfaces (matching the convention used by Ajv and most JS validators).
- **Friction**: `JSONPointer` exposes a single string form via `description` — `#/foo/0`. Most JS-side consumers expect the raw RFC 6901 pointer for the *instance* path (`/foo/0`) and reserve the `#/...` fragment for the *schema* path. There is no public accessor for the bare pointer string and no public way to introspect the `path` components (the `Component` enum and `path` array are internal). I had to substring-trim the leading `#` myself, which feels brittle.
- **Proposal**: Add `public var rfc6901: String { get }` (raw pointer, no `#`) and either make `Component` public or add a `public var tokens: [String] { get }` returning the unescaped path components. Keep `description` as-is for backwards compatibility.
- **Discovered in**: `swift-wasm-package` / `wasm/Sources/JSONSchemaWasm/main.swift`

### `ValidationResult.errors` is a recursive tree; no built-in flatten
- **Context**: Returning a flat JSON array of leaf validation errors to the browser.
- **Friction**: `ValidationError.errors` nests sub-errors under composite keywords (`properties`, `allOf`, etc.). The top-level entries are essentially "wrapper" errors with messages like `"Validation failed for keyword 'properties'"` that are not useful on their own — every consumer who wants a flat error list (which is the common case for IDE-style UIs) has to write the same recursive walker.
- **Proposal**: Add `public var leafErrors: [ValidationError] { get }` (or a `flattened()` method) on `ValidationResult` that walks the tree and returns only the leaves. Optionally also expose a `public func allErrors() -> [ValidationError]` that yields every node for callers who do want the wrappers.
- **Discovered in**: `swift-wasm-package` / `wasm/Sources/JSONSchemaWasm/main.swift`

### `Schema.init(instance:)` and `validate(instance:)` throw untyped errors
- **Context**: Distinguishing "schema didn't parse", "instance didn't parse", and "internal validator issue" so the playground can surface a useful message to the user.
- **Friction**: Both initializers/methods are declared `throws` (untyped). The thrown values are a mix of `DecodingError` (from `JSONDecoder`) and `SchemaIssue`. Callers can't `catch` precisely without type-checking, and the errors that come out have raw `Swift.DecodingError` debug descriptions that are not user-friendly.
- **Proposal**: Either (a) introduce a typed error like `enum SchemaParseError: Error { case invalidJSON(DecodingError); case schemaIssue(SchemaIssue) }` and use Swift 6 typed throws (`throws(SchemaParseError)`), or (b) at minimum implement `LocalizedError` / `CustomStringConvertible` on `SchemaIssue` and document which error types can escape.
- **Discovered in**: `swift-wasm-package` / `wasm/Sources/JSONSchemaWasm/main.swift`

### No prebuilt SwiftWasm artifact ⇒ heavy CI plumbing for any wasm-targeting consumer
- **Context**: GitHub Actions workflow that builds `JSONSchemaWasm` (the playground's wasm wrapper) on every push to `main` so it can be deployed to GitHub Pages.
- **Friction**: To produce a single ~MB-sized `validator.wasm`, CI has to: (1) check out a *second* repo (this one) as a path-based SwiftPM sibling, (2) install swiftly, (3) install a full Swift toolchain, (4) install the SwiftWasm SDK artifactbundle (~hundreds of MB, slow even with caching), (5) run `swift build --swift-sdk wasm32-unknown-wasip1`. Cold builds are minutes long; cache invalidation on toolchain bumps means every Swift release rebuilds from scratch. None of this work is specific to the *consuming* app — every JS/web project that wants to use `swift-json-schema` would repeat all of it.
- **Proposal**: Publish a prebuilt, JS-callable `validator.wasm` (and matching `.d.ts`) as a GitHub Release asset (or an npm package) for each tagged release of `swift-json-schema`. Even a minimal "validate(schema, instance) → errors[]" surface would let downstream web consumers `npm install @swift-json-schema/validator-wasm` (or `curl` a release asset) and skip the entire Swift toolchain dance. The upstream repo is the only place that has all the context to build it correctly anyway.
- **Discovered in**: `swift-wasm-package` / `.github/workflows/deploy.yml`

### No `Schema` initializer that accepts `Data` or a pre-parsed `JSONValue` from a string
- **Context**: The wasm wrapper receives schema/instance as `String` from JS. We pay the cost of `Data(string.utf8)` inside the library on every call.
- **Friction**: `Schema.init(instance: String, ...)` is the only string-friendly entry point and it always allocates a fresh `JSONDecoder` and `Data`. There is no `Schema.init(data: Data, ...)` overload, and the `Schema.init(rawSchema: JSONValue, context:)` initializer requires hand-constructing a `Context` (which involves dialect/remote-schema/format-validator wiring) — too heavy for the common case.
- **Proposal**: Add `Schema.init(data: Data, dialect: Dialect = .draft2020_12, ...)` mirroring the `String` overload, and a similar `validate(instance data: Data)` on `ValidatableSchema`. Keeps the convenient defaults but lets callers avoid the extra `String -> Data` round-trip.
- **Discovered in**: `swift-wasm-package` / `wasm/Sources/JSONSchemaWasm/main.swift`

### JavaScriptKit's WASI executable check forces every JS host to monkey-patch `_start`
- **Context**: Loading `validator.wasm` (a `wasm32-unknown-wasip1` *executable* built without `-mexec-model=reactor`) into a Web Worker via the vendored JavaScriptKit `runtime.mjs`.
- **Friction**: `SwiftRuntime.setInstance(instance)` unconditionally throws if `instance.exports._start` is a function, with the message *"JavaScriptKit supports only WASI reactor ABI."*. But the SwiftWasm 6.3 toolchain still produces an executable `.wasm` by default — `swift build --swift-sdk wasm32-unknown-wasip1` exports `_start`, not `_initialize`. To use the runtime as published, every JS loader has to wrap the instance in a `Proxy` that hides the `_start` export from the runtime, then call WASI `start(instance)` (executable convention) themselves. This is undocumented and error-prone.
- **Proposal**: Either (a) detect both ABIs in `setInstance` (call `_initialize` for reactor, do nothing for executable) and let the host run `_start` itself, or (b) loudly document that consumers must build with `-Xswiftc -Xclang-linker -Xswiftc -mexec-model=reactor` and update SwiftWasm's `swift build` defaults / `Package.swift` template to set the linker flag automatically when JavaScriptKit is a dependency.
- **Discovered in**: `swift-json-schema-playground` / `src/validator/worker.ts` (`hideStartExport` helper)

### `bjs` import module is required even when the Swift code uses no BridgeJS APIs
- **Context**: Same wasm load. The artifact has 32 imports under the `bjs` module (e.g. `bjs.swift_js_throw`, `bjs.swift_js_push_string`) even though our Swift source only uses `JSObject.global.X = .object(JSClosure { ... })` — i.e. the original JavaScriptKit bridge, not the new BridgeJS bindings.
- **Friction**: The host *must* satisfy every `bjs` import or instantiation fails, but the runtime template (`PackageToJS/Templates/instantiate.js`) only auto-stubs them in the no-bridge fallback path that hand-rolled loaders aren't using. Each consumer ends up duplicating the ~32-entry stub table.
- **Proposal**: Either (a) export a `defaultBjsStubs()` helper from `runtime.mjs` that hand-rolled hosts can spread into their import object, or (b) make the wasm module not declare the bjs imports unless BridgeJS-generated Swift code is actually linked (treeshake at the linker level).
- **Discovered in**: `swift-json-schema-playground` / `src/validator/worker.ts` (`buildBjsStubs`)

### `runtime.d.ts` is an unprocessed PackageToJS template — unusable without the build plugin
- **Context**: Vendoring the JavaScriptKit JS runtime so the playground worker can `import { SwiftRuntime } from './runtime/runtime.mjs'` without depending on the (unpublished-at-this-version) npm package or the `swift package js` plugin.
- **Friction**: `runtime.mjs` is a fully-bundled, tree-shaken Rollup output and works as-is. But the matching `runtime.d.ts` still contains preprocessor directives (`/* #if USE_SHARED_MEMORY */ ... /* #endif */`) that TypeScript can't parse. Vendoring it forces consumers to either (a) hand-write a parallel `.d.ts` declaring just the subset they use (what we did) or (b) run the entire PackageToJS preprocessor just to get types.
- **Proposal**: Ship `runtime.d.ts` (and `instantiate.d.ts`) preprocessed for the most common configuration (browser, no shared memory, no bridge) alongside the Rollup `runtime.mjs`. Keep the templated source under a different name. Ideally publish them as an npm package (`@swiftwasm/javascriptkit-runtime` or similar) so consumers don't have to vendor at all.
- **Discovered in**: `swift-json-schema-playground` / `src/validator/runtime/runtime.d.mts`

### `ValidationError.schemaPath` is a URI-fragment string with no machine-friendly form
- **Context**: Wiring inline Monaco squiggles + click-to-jump on errors required mapping each `ValidationError` back to a specific `{ file, line, column }` in either the schema editor or the instance editor. Consumers have to derive that themselves with a JSON-pointer-resolves-to-range helper.
- **Friction**: `instancePath` arrives as a raw RFC 6901 pointer (`""`, `"/foo/0"`) but `schemaPath` arrives as a `#/…` URI fragment (`"#/properties/name/type"`). Every consumer that wants to resolve the schema location ends up writing the same `path.startsWith('#') ? path.slice(1) : path` slice — easy to forget, easy to get wrong on edge cases like `"#"` (which decodes to `""`). It would also be nice to know the source filename / `$id` so multi-document schemas (with `$ref`) can be routed to the right tab in the future.
- **Proposal**: On the wasm-side error envelope, emit `instancePointer: String` and `schemaPointer: String` (both raw RFC 6901, no `#` prefix), and additionally `schemaResource: String?` (the resolved `$id` URI of the schema document the error came from, when known). Keep the existing `schemaPath`/`instancePath` strings for back-compat or rename them outright in the JS shape.
- **Discovered in**: `swift-json-schema-playground` / `src/editor/errorTarget.ts`

### Validator errors don't surface a source `Range`, only a pointer
- **Context**: Same inline-squiggles use case. Each `ValidationError` is mapped to a 1-based `{ startLine, startColumn, endLine, endColumn }` via `pointerToRange`, which re-parses the JSON text on every render to walk the AST.
- **Friction**: The wasm validator already had to parse the schema and the instance; it knows the byte offsets of every node. Throwing that information away forces every consumer (editor, CLI, language server) to re-parse the source on the JS side just to highlight the offending value. With a 60 MiB schema or large instance documents this round-trip is wasteful, and `jsonc-parser`'s tolerant parse can return slightly different ranges than Swift's strict `JSONDecoder` (notably for whitespace-heavy or comment-bearing input).
- **Proposal**: Optionally include `instanceRange` and `schemaRange` on `ValidationError` (each `{ startLine: Int, startColumn: Int, endLine: Int, endColumn: Int }`, 1-based, UTF-16 code units to match Monaco/LSP convention). Gated behind a `Schema.validate(instance:options: .init(includeRanges: true))` flag so callers that don't need them aren't forced to pay the serialization cost.
- **Discovered in**: `swift-json-schema-playground` / `src/App.tsx` marker effect

### Cascading `unevaluatedProperties` errors swamp the real failure ⚠️ HIGH IMPACT
- **Context**: Any complex schema with `unevaluatedProperties: false` at multiple nesting levels (e.g. OpenAPI 3.1, AsyncAPI). When a deep keyword fails — even one keyword like `$dynamicRef` or a single `else` branch — the failure cascades up as `unevaluatedProperties` violations at *every ancestor level*, producing dozens of misleading errors that obscure the root cause.
- **Friction**: A single failure at instance path `#/paths/~1pets/get/parameters/0` produces ~9 errors:
  - 1 real error (`$dynamicRef '#meta'` cannot resolve)
  - 8 spurious `unevaluatedProperties` boolean-false errors at every parent — `openapi`, `info`, `paths`, `paths/~1pets`, `paths/~1pets/get`, `paths/~1pets/get/parameters`, `paths/~1pets/get/responses`, `paths/~1pets/get/summary` — because the failure of one inner property prevented the parent's `Properties` annotation from being recorded.
- **Root cause** (in `Sources/JSONSchema/Keywords/Keywords+Applicator.swift`): `Properties.validate` (line 277), `PatternProperties.validate` (line 334), and `AdditionalProperties.validate` (line 380) all call `try builder.throwIfErrors()` *before* `annotations.insert(...)`. When any sub-property fails, the throw skips the annotation insertion → `UnevaluatedProperties` later sees no `Properties` annotation → every property reads as "unevaluated."
- **Proposal**: Move `annotations.insert(keyword: self, ...)` to *before* `throwIfErrors()` in all three keywords. The annotation describes *which property names this keyword applied to*, not which validated successfully — that matches the spec wording ("the set of instance property names matched by this keyword"). However, this fix in isolation breaks four existing test-suite cases (`unevaluatedProperties with anyOf`, `unevaluatedProperties with if/then/else`, `unevaluatedProperties with if/then/else, then not defined`, `in-place applicator siblings, anyOf has unevaluated`) because `AnyOf.validate` (line 501) currently merges `subAnnotations` from *every* branch, including failing ones. Per spec §10.2.1.2, annotations from `anyOf` MUST come only from passing branches. So the complete fix is two-part:
  1. `Properties` / `PatternProperties` / `AdditionalProperties`: emit annotation before throw.
  2. `AnyOf` / `OneOf` (and audit `If` / `Then` / `Else` / `AllOf`): only merge `subAnnotations` from passing branches.
- **Discovered in**: `swift-json-schema-playground` OpenAPI 3.1 example. Reproducible standalone with the OpenAPI 3.1 schema + the sample petstore in `src/examples/registry.ts:OPENAPI_PETSTORE`.
