// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "JSONSchemaWasm",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "JSONSchemaWasm", targets: ["JSONSchemaWasm"])
  ],
  dependencies: [
    .package(name: "swift-json-schema", path: "../../swift-json-schema"),
    .package(url: "https://github.com/swiftwasm/JavaScriptKit", from: "0.51.0"),
  ],
  targets: [
    .executableTarget(
      name: "JSONSchemaWasm",
      dependencies: [
        .product(name: "JSONSchema", package: "swift-json-schema"),
        .product(name: "JavaScriptKit", package: "JavaScriptKit"),
      ]
    )
  ]
)
