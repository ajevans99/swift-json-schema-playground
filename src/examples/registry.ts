// Curated registry of real-world JSON Schemas the playground can load on
// demand. Each entry pairs an authoritative schema URL with a small,
// hand-written instance that demonstrates the schema in action.
//
// All schema URLs were verified to serve `Access-Control-Allow-Origin: *`
// at the time the registry was authored (see the PR adding this file).

export interface Example {
  /** URL-safe slug used in the URL hash (`#example=<id>`). */
  id: string
  /** Human-readable label shown in the dropdown and as a tooltip title. */
  name: string
  /** One-line description used as the option's `title` (hover tooltip). */
  description: string
  /** Authoritative schema URL fetched at selection time. */
  schemaURL: string
  /**
   * Inline default instance JSON, pretty-printed and ready to drop into
   * the editor. Set to `null` for the self-validating meta-schema case;
   * the loader will reuse the schema text as the instance in that case.
   */
  instance: string | null
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

// Tiny Petstore-style sample for OpenAPI 3.1.
const OPENAPI_PETSTORE = pretty({
  openapi: '3.1.0',
  info: { title: 'Petstore', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        summary: 'List pets',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of pets to return',
            required: false,
            schema: { type: 'integer', format: 'int32', minimum: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'A page of pets',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['id', 'name'],
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})

// Minimal valid GitHub Actions workflow expressed as JSON. The
// `github-workflow` schema accepts JSON-encoded workflows just fine.
const GITHUB_WORKFLOW = pretty({
  name: 'CI',
  on: ['push', 'pull_request'],
  jobs: {
    build: {
      'runs-on': 'ubuntu-latest',
      steps: [
        { uses: 'actions/checkout@v4' },
        { name: 'Run tests', run: 'npm test' },
      ],
    },
  },
})

const PACKAGE_JSON = pretty({
  name: 'my-package',
  version: '0.1.0',
  description: 'An example package',
  license: 'MIT',
  scripts: {
    test: 'echo "no tests yet"',
  },
})

const TSCONFIG_JSON = pretty({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
  },
  include: ['src'],
})

// A GeoJSON Feature with a Point geometry over midtown Manhattan
// (Empire State Building, longitude/latitude order per the spec).
const GEOJSON_FEATURE = pretty({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [-73.9857, 40.7484],
  },
  properties: {
    name: 'Empire State Building',
    city: 'New York',
  },
})

const JSON_RESUME = pretty({
  basics: {
    name: 'Ada Lovelace',
    label: 'Mathematician',
    email: 'ada@example.com',
    summary: 'First computer programmer.',
  },
  work: [
    {
      name: 'Analytical Engine Co.',
      position: 'Programmer',
      startDate: '1843-01-01',
      summary: 'Wrote the first algorithm intended for a machine.',
    },
  ],
  skills: [
    {
      name: 'Algorithms',
      level: 'Master',
      keywords: ['Bernoulli numbers'],
    },
  ],
})

export const EXAMPLES: Example[] = [
  {
    id: 'json-schema-2020-12',
    name: 'JSON Schema 2020-12 meta-schema',
    description:
      'The official meta-schema. The instance is the schema itself — it validates against itself.',
    // Self-describing: the meta-schema describes JSON Schema documents,
    // including itself. We reuse the same text for both editors.
    schemaURL: 'https://json-schema.org/draft/2020-12/schema',
    instance: null,
  },
  {
    id: 'openapi-3.1',
    name: 'OpenAPI 3.1 (⚠ known issue)',
    description:
      'OpenAPI 3.1 specification schema with a tiny Petstore sample. Currently surfaces validation errors due to a known $dynamicRef resolution gap in swift-json-schema — see swift-json-schema-suggestions.md.',
    schemaURL: 'https://spec.openapis.org/oas/3.1/schema/2022-10-07',
    instance: OPENAPI_PETSTORE,
  },
  {
    id: 'github-workflow',
    name: 'GitHub Actions workflow',
    description:
      'SchemaStore github-workflow schema with a minimal CI job (JSON form).',
    schemaURL: 'https://json.schemastore.org/github-workflow.json',
    instance: GITHUB_WORKFLOW,
  },
  {
    id: 'package-json',
    name: 'package.json',
    description: 'SchemaStore package.json schema with a minimal manifest.',
    schemaURL: 'https://json.schemastore.org/package.json',
    instance: PACKAGE_JSON,
  },
  {
    id: 'tsconfig-json',
    name: 'tsconfig.json',
    description:
      'SchemaStore tsconfig.json schema with a minimal TypeScript config.',
    schemaURL: 'https://json.schemastore.org/tsconfig.json',
    instance: TSCONFIG_JSON,
  },
  {
    id: 'geojson-feature',
    name: 'GeoJSON Feature',
    description: 'GeoJSON Feature schema with a Point over Manhattan.',
    schemaURL: 'https://geojson.org/schema/Feature.json',
    instance: GEOJSON_FEATURE,
  },
  {
    id: 'json-resume',
    name: 'JSON Resume',
    description: 'jsonresume.org schema with a minimal Ada Lovelace résumé.',
    schemaURL:
      'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json',
    instance: JSON_RESUME,
  },
]

export const DEFAULT_EXAMPLE_ID: string = EXAMPLES[0].id

export function findExampleById(id: string | null | undefined): Example | null {
  if (!id) return null
  return EXAMPLES.find((e) => e.id === id) ?? null
}

const HASH_KEY = 'example'

/**
 * Parse `window.location.hash` (or any hash-like string) for a
 * `example=<id>` entry and return the matching {@link Example}, or `null`
 * if the hash is missing/invalid or the id is not in the registry.
 */
export function parseExampleFromHash(hash: string): Example | null {
  if (!hash) return null
  // Strip leading '#' if present.
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash
  if (!stripped) return null
  // The hash may carry multiple `key=value` pairs separated by '&'.
  const params = new URLSearchParams(stripped)
  const id = params.get(HASH_KEY)
  return findExampleById(id)
}

export function buildExampleHash(id: string): string {
  return `#${HASH_KEY}=${id}`
}
