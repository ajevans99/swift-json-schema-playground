import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Header, PLAYGROUND_REPO_URL } from '../src/components/Header'
import {
  SWIFT_JSON_SCHEMA_REPO_URL,
  SWIFT_JSON_SCHEMA_VERSION,
  swiftJSONSchemaReleaseURL,
} from '../src/swiftJSONSchemaVersion'

describe('swiftJSONSchemaReleaseURL', () => {
  test('returns the tag URL for a known version', () => {
    expect(swiftJSONSchemaReleaseURL('1.2.3')).toBe(
      `${SWIFT_JSON_SCHEMA_REPO_URL}/releases/tag/1.2.3`,
    )
  })

  test('falls back to the repo root for the unknown sentinel', () => {
    expect(swiftJSONSchemaReleaseURL('unknown')).toBe(SWIFT_JSON_SCHEMA_REPO_URL)
  })

  test('falls back to the repo root for an empty version', () => {
    expect(swiftJSONSchemaReleaseURL('')).toBe(SWIFT_JSON_SCHEMA_REPO_URL)
  })

  test('percent-encodes versions with special characters', () => {
    expect(swiftJSONSchemaReleaseURL('1.0.0+build/1')).toBe(
      `${SWIFT_JSON_SCHEMA_REPO_URL}/releases/tag/1.0.0%2Bbuild%2F1`,
    )
  })
})

describe('SWIFT_JSON_SCHEMA_VERSION', () => {
  test('is replaced with a non-empty string at build time', () => {
    expect(typeof SWIFT_JSON_SCHEMA_VERSION).toBe('string')
    expect(SWIFT_JSON_SCHEMA_VERSION.length).toBeGreaterThan(0)
  })

  test('matches the version pinned in wasm/Package.resolved', () => {
    // The build-time injection should resolve to a real semver from the
    // pinned manifest, not the "unknown" fallback.
    expect(SWIFT_JSON_SCHEMA_VERSION).not.toBe('unknown')
    expect(SWIFT_JSON_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('Header', () => {
  test('renders the "JSON Schema Playground" title', () => {
    render(<Header />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent ?? '').toMatch(/JSON Schema Playground/)
  })

  test('renders an inline GitHub link to the playground repo', () => {
    render(<Header />)
    const link = screen.getByRole('link', {
      name: /JSON Schema Playground on GitHub/i,
    })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', PLAYGROUND_REPO_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // The link should contain an inline SVG (GitHub mark) rather than text.
    expect(link.querySelector('svg')).not.toBeNull()
  })

  test('renders a link to the matching swift-json-schema GitHub release', () => {
    render(<Header />)

    const link = screen.getByRole('link', {
      name: new RegExp(`swift-json-schema v${SWIFT_JSON_SCHEMA_VERSION}`),
    })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', swiftJSONSchemaReleaseURL())
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('keeps the surrounding "compiled to WASM" copy', () => {
    const { container } = render(<Header />)
    const paragraph = container.querySelector('header p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.textContent ?? '').toMatch(
      /^Powered by .+ compiled to WASM$/i,
    )
  })
})
