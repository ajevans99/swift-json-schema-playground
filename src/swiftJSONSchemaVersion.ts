// Surfaces the pinned `swift-json-schema` version (read from
// `wasm/Package.resolved` at build time by Vite's `define`) so the UI can
// display it, and builds a deep link to the matching GitHub release.

export const SWIFT_JSON_SCHEMA_REPO_URL =
  'https://github.com/ajevans99/swift-json-schema'

export const SWIFT_JSON_SCHEMA_VERSION: string = __SWIFT_JSON_SCHEMA_VERSION__

/**
 * Returns the GitHub URL that best matches the pinned version:
 *  - For a known semver string, the release tag page (e.g.
 *    `…/releases/tag/0.13.0`).
 *  - For the fallback `"unknown"` literal (Package.resolved missing /
 *    malformed at build time), the repo root.
 */
export function swiftJSONSchemaReleaseURL(
  version: string = SWIFT_JSON_SCHEMA_VERSION,
): string {
  if (!version || version === 'unknown') return SWIFT_JSON_SCHEMA_REPO_URL
  return `${SWIFT_JSON_SCHEMA_REPO_URL}/releases/tag/${encodeURIComponent(version)}`
}
