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
