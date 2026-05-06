import Foundation
import JSONSchema

#if canImport(JavaScriptKit) && os(WASI)
import JavaScriptKit
#endif

/// JSON-encoded result envelope returned to the JS caller.
///
/// Shape:
/// ```json
/// {
///   "valid": true|false,
///   "errors": [
///     { "instancePath": "/foo/0",
///       "schemaPath": "#/properties/foo/items",
///       "message": "...",
///       "keyword": "type" }
///   ]
/// }
/// ```
struct ValidationOutput: Encodable {
  let valid: Bool
  let errors: [ValidationErrorOutput]
}

struct ValidationErrorOutput: Encodable {
  let instancePath: String
  let schemaPath: String
  let message: String
  let keyword: String
}

/// JSON pointer description in `swift-json-schema` is the `#/...` URI fragment
/// form. The browser convention (matching Ajv / the `instancePath` field used
/// in most JS validators) is the raw RFC 6901 pointer (e.g. `/foo/0`) for the
/// instance and the `#/...` fragment for the schema. Translate accordingly.
private func instancePathString(_ pointer: JSONPointer) -> String {
  let s = pointer.description
  if s == "#" { return "" }
  if s.hasPrefix("#") { return String(s.dropFirst()) }
  return s
}

private func schemaPathString(_ pointer: JSONPointer) -> String {
  pointer.description
}

/// Recursively flattens nested validation errors into a flat list. The
/// swift-json-schema validator nests errors under composite keywords like
/// `properties` / `allOf`; for the playground UI we want every leaf error
/// surfaced with its full instance/schema location.
private func flatten(
  _ errors: [ValidationError]?,
  into sink: inout [ValidationErrorOutput]
) {
  guard let errors else { return }
  for error in errors {
    if let nested = error.errors, !nested.isEmpty {
      flatten(nested, into: &sink)
    } else {
      sink.append(
        ValidationErrorOutput(
          instancePath: instancePathString(error.instanceLocation),
          schemaPath: schemaPathString(error.keywordLocation),
          message: error.message,
          keyword: error.keyword
        )
      )
    }
  }
}

private func encode(_ output: ValidationOutput) -> String {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.withoutEscapingSlashes]
  if let data = try? encoder.encode(output),
    let str = String(data: data, encoding: .utf8)
  {
    return str
  }
  // Last-resort hand-rolled fallback so this function never fails.
  return #"{"valid":false,"errors":[{"instancePath":"","schemaPath":"","message":"failed to encode validation result","keyword":"$internal"}]}"#
}

private func internalError(_ reason: String) -> String {
  encode(
    ValidationOutput(
      valid: false,
      errors: [
        ValidationErrorOutput(
          instancePath: "",
          schemaPath: "",
          message: reason,
          keyword: "$internal"
        )
      ]
    )
  )
}

/// Validates `instanceJSON` against `schemaJSON` and returns a JSON-encoded
/// `ValidationOutput`. Never throws — all failure modes are surfaced through
/// the result envelope so JS callers only need to parse a single response
/// shape.
///
/// `remoteSchemasJSON` is an optional JSON-encoded `[String: JSONValue]`
/// dictionary (`{ "https://example.com/foo": <schemaObject>, ... }`) of
/// pre-fetched external schemas. The JS host pre-fetches `$ref` targets and
/// passes them in here so the validator can resolve them without the wasm
/// having to do its own HTTP. The bundled meta vocabularies always win on
/// collision so user-supplied junk can't override the canonical ones.
public func validate(
  schemaJSON: String,
  instanceJSON: String,
  remoteSchemasJSON: String? = nil
) -> String {
  // Build the merged remoteSchemas dictionary first so we can fail fast on
  // malformed JS input.
  var combinedRemote = bundledMetaVocabularies
  if let raw = remoteSchemasJSON, !raw.isEmpty {
    guard let data = raw.data(using: .utf8) else {
      return internalError("remoteSchemas JSON could not be encoded as UTF-8")
    }
    do {
      let userRemote = try JSONDecoder().decode([String: JSONValue].self, from: data)
      // User-supplied entries fill in everything outside the bundled vocab
      // namespace; the bundled ones we ship win on conflict.
      for (k, v) in userRemote where combinedRemote[k] == nil {
        combinedRemote[k] = v
      }
    } catch {
      return internalError("Failed to parse remoteSchemas JSON: \(error)")
    }
  }

  let schema: Schema
  do {
    schema = try Schema(
      instance: schemaJSON,
      remoteSchemas: combinedRemote
    )
  } catch {
    return internalError("Failed to parse schema: \(error)")
  }

  let result: ValidationResult
  do {
    result = try schema.validate(instance: instanceJSON)
  } catch {
    return internalError("Failed to parse instance or run validation: \(error)")
  }

  var flat: [ValidationErrorOutput] = []
  flatten(result.errors, into: &flat)

  return encode(ValidationOutput(valid: result.isValid, errors: flat))
}

// MARK: - Bundled meta vocabularies
//
// The JSON Schema 2020-12 meta-schema is decomposed into seven vocabulary
// sub-schemas (`core`, `applicator`, `unevaluated`, `validation`,
// `meta-data`, `format-annotation`, `content`). When a user pastes the
// meta-schema (or any schema that `$ref`s those vocabularies) into the
// playground, the validator can't resolve the refs without them being
// pre-loaded in `remoteSchemas`.
//
// `swift-json-schema` ships these JSON files as bundled resources (used
// internally by `Dialect.loadMetaSchema()`). On the host we route them
// through `remoteSchemas`. On WASI we CAN'T — `Bundle.module`'s URL is
// resolved at compile time to a host filesystem path that doesn't exist
// in the browser, and reading it crashes the wasm module at init time
// (`resource_bundle_accessor.swift:12 Fatal error: could not load
// resource bundle ...`). On WASI we leave the dictionary empty; the JS
// host's remote-ref resolver will fetch the vocab schemas over HTTP at
// runtime instead.
//
// Computed once at module init; reused across every `validate` call.

/// Map of canonical vocabulary URLs → JSONValue contents, e.g.
/// `"https://json-schema.org/draft/2020-12/meta/core" → {...}`.
/// Empty on WASI (see comment above).
let bundledMetaVocabularies: [String: JSONValue] = loadBundledMetaVocabularies()

#if os(WASI)
private func loadBundledMetaVocabularies() -> [String: JSONValue] {
  // Touching `Bundle.jsonSchemaResources` here would trigger
  // `Bundle.module`'s resource accessor, which fatals in wasm (the
  // generated path is a host-machine absolute path baked at build
  // time). Return empty and let the JS-side ref resolver handle
  // meta vocabularies via the network.
  return [:]
}
#else
private func loadBundledMetaVocabularies() -> [String: JSONValue] {
  guard let baseURI = URL(string: "https://json-schema.org/draft/2020-12/schema") else {
    return [:]
  }
  guard let urls = Bundle.jsonSchemaResources.urls(
    forResourcesWithExtension: "json",
    subdirectory: nil
  ) else {
    return [:]
  }

  let decoder = JSONDecoder()
  var dict: [String: JSONValue] = [:]
  for url in urls {
    let lastComponent: String
    let resolvedURL: URL
    #if os(macOS) || os(iOS) || os(watchOS) || os(tvOS) || os(visionOS)
      lastComponent = url.lastPathComponent
      resolvedURL = url
    #else
      // On non-Apple non-WASI platforms (e.g. Linux) `Bundle.urls(...)`
      // returns `[NSURL]?`, whose `lastPathComponent` is also `String?`.
      // Coerce both.
      guard let pc = url.lastPathComponent else { continue }
      lastComponent = pc
      resolvedURL = url as URL
    #endif
    // Skip the umbrella meta-schema itself (`schema.json`) — only the
    // vocabulary sub-schemas need to be exposed as remote refs.
    guard !lastComponent.hasPrefix("schema") else { continue }
    let name = lastComponent.replacingOccurrences(of: ".json", with: "")
    guard let data = try? Data(contentsOf: resolvedURL),
          let value = try? decoder.decode(JSONValue.self, from: data),
          let key = URL(string: "meta/\(name)", relativeTo: baseURI)?.absoluteString
    else { continue }
    dict[key] = value
  }
  return dict
}
#endif

// MARK: - Entry points
//
// On wasm/WASI, register `validate` on `globalThis` (as `swiftValidate`) so the
// browser host (or a Web Worker) can invoke it through JavaScriptKit's runtime
// after the wasm module is started.
//
// On the host (macOS / Linux), keep the original stdin/stdout smoke harness so
// `swift run JSONSchemaWasm < input.json` continues to work for local
// debugging.

#if canImport(JavaScriptKit) && os(WASI)

// Retain the closure for the lifetime of the wasm instance. JS will call into
// it via `globalThis.swiftValidate(schemaString, instanceString, remoteSchemasJSON?)`
// which always returns a JSON-encoded `ValidationOutput` string.
let _swiftValidateClosure = JSClosure { args in
  guard args.count >= 2,
    let schemaJSON = args[0].string,
    let instanceJSON = args[1].string
  else {
    return JSValue.string(
      internalError(
        "swiftValidate(schemaJSON, instanceJSON, remoteSchemasJSON?) requires at least two string arguments"
      )
    )
  }
  let remoteSchemasJSON: String? = args.count >= 3 ? args[2].string : nil
  return JSValue.string(
    validate(
      schemaJSON: schemaJSON,
      instanceJSON: instanceJSON,
      remoteSchemasJSON: remoteSchemasJSON
    )
  )
}

JSObject.global.swiftValidate = .object(_swiftValidateClosure)

#else

struct SmokeInput: Decodable {
  let schema: String
  let instance: String
  let remoteSchemas: [String: JSONValue]?
}

let stdinData = FileHandle.standardInput.readDataToEndOfFile()

if stdinData.isEmpty {
  FileHandle.standardError.write(
    Data(
      "Provide JSON of shape {\"schema\":\"...\",\"instance\":\"...\",\"remoteSchemas\":{...}?} on stdin.\n"
        .utf8
    )
  )
  exit(64)
}

do {
  let input = try JSONDecoder().decode(SmokeInput.self, from: stdinData)
  let remoteSchemasJSON: String?
  if let remote = input.remoteSchemas {
    let encoder = JSONEncoder()
    let data = try encoder.encode(remote)
    remoteSchemasJSON = String(data: data, encoding: .utf8)
  } else {
    remoteSchemasJSON = nil
  }
  let output = validate(
    schemaJSON: input.schema,
    instanceJSON: input.instance,
    remoteSchemasJSON: remoteSchemasJSON
  )
  print(output)
} catch {
  print(internalError("Failed to decode smoke-test input: \(error)"))
  exit(65)
}

#endif
