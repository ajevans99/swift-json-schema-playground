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
public func validate(schemaJSON: String, instanceJSON: String) -> String {
  let schema: Schema
  do {
    schema = try Schema(instance: schemaJSON)
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
// it via `globalThis.swiftValidate(schemaString, instanceString)` which always
// returns a JSON-encoded `ValidationOutput` string.
let _swiftValidateClosure = JSClosure { args in
  guard args.count >= 2,
    let schemaJSON = args[0].string,
    let instanceJSON = args[1].string
  else {
    return JSValue.string(
      internalError(
        "swiftValidate(schemaJSON, instanceJSON) requires two string arguments"
      )
    )
  }
  return JSValue.string(
    validate(schemaJSON: schemaJSON, instanceJSON: instanceJSON)
  )
}

JSObject.global.swiftValidate = .object(_swiftValidateClosure)

#else

struct SmokeInput: Decodable {
  let schema: String
  let instance: String
}

let stdinData = FileHandle.standardInput.readDataToEndOfFile()

if stdinData.isEmpty {
  FileHandle.standardError.write(
    Data(
      "Provide JSON of shape {\"schema\":\"...\",\"instance\":\"...\"} on stdin.\n"
        .utf8
    )
  )
  exit(64)
}

do {
  let input = try JSONDecoder().decode(SmokeInput.self, from: stdinData)
  let output = validate(schemaJSON: input.schema, instanceJSON: input.instance)
  print(output)
} catch {
  print(internalError("Failed to decode smoke-test input: \(error)"))
  exit(65)
}

#endif
