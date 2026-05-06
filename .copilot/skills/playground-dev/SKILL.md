---
name: playground-dev
description: How to develop on swift-json-schema-playground — running the Vite dev server, rebuilding the Swift→WASM validator, running tests, and attaching a browser via Playwright CLI to inspect the running app. Use when the user wants to add a feature, fix a bug, or interact with the playground while it's running.
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(playwright-cli:*) Bash(./wasm/build.sh) Bash(cd:*)
---

# swift-json-schema-playground — dev guide

A Vite + React + TS playground that validates JSON Schemas using the
[`swift-json-schema`](https://github.com/ajevans99/swift-json-schema) Swift
package compiled to WebAssembly. Validation runs in a Web Worker.

## Quick orientation

| Where | What lives there |
| --- | --- |
| `src/` | React app — `App.tsx`, `components/`, `editor/`, `examples/`, `validator/` |
| `src/validator/worker.ts` | Web Worker that loads `validator.wasm`, walks `$ref`s, calls into Swift |
| `src/validator/remoteRefs.ts` | Walks user-supplied schemas for external `$ref` URLs and pre-fetches them |
| `wasm/` | SwiftPM project that wraps `../../swift-json-schema` and emits `validator.wasm` |
| `wasm/Sources/JSONSchemaWasm/main.swift` | The single Swift entry point: `validate(schemaJSON, instanceJSON, remoteSchemasJSON?)` |
| `wasm/build.sh` | SwiftWasm build → copies wasm to `public/validator.wasm` |
| `tests/` | Vitest unit tests (no Playwright tests yet) |
| `public/validator.wasm` | Built artifact, gitignored, rebuilt by CI on push to main |

## Workflows

### Run the dev server

```bash
npm install            # first time only
npm run dev            # serves at http://localhost:5173/swift-json-schema-playground/
                       # (or :5174, etc. — Vite picks the next free port)
```

### Run tests

```bash
npm test               # one-shot
npm run test:watch     # watch mode
```

### Type-check + lint

```bash
npx tsc -b
npm run lint
```

### Build a production bundle

```bash
npm run build          # outputs to dist/
```

### Rebuild the wasm validator

The wasm artifact is **NOT** auto-rebuilt by `npm run dev`. You only need this
after editing `wasm/Sources/...` OR after pulling changes that touch the
sibling `../swift-json-schema` package.

```bash
cd wasm && ./build.sh && cd ..
```

Prerequisites (one-time):
1. `../swift-json-schema` checked out as a sibling repo (`git clone https://github.com/ajevans99/swift-json-schema.git ../swift-json-schema`)
2. Swift 6.3.1 installed via [swiftly](https://www.swift.org/install/macos/)
3. SwiftWasm SDK installed — `wasm/build.sh` prints the exact `swift sdk install` command if it's missing

Output: ~44 MiB raw, ~17 MiB gzipped. Copied to `public/validator.wasm`.

## Attaching a browser for live inspection

To let your coding agent inspect the running app, attach Playwright CLI to
your Chrome session via the Playwright Extension. This is the *interactive*
workflow — it sees your existing tab with WASM already initialized.

### One-time machine setup

1. Install the [Playwright Extension](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) in Chrome
2. Click the extension → copy the auto-generated token
3. Add to `~/.zshrc`:
   ```sh
   export PLAYWRIGHT_MCP_EXTENSION_TOKEN="<paste token>"
   ```
4. `source ~/.zshrc`

### Per-session attach

```bash
# Terminal A: dev server
npm run dev

# Terminal B: attach (block waiting for extension)
playwright-cli attach --extension=chrome --session=playground

# In Chrome: extension icon → Connect → pick the localhost:5174 tab
```

### Drive the attached session

```bash
playwright-cli -s=playground goto "http://localhost:5174/swift-json-schema-playground/"
playwright-cli -s=playground snapshot                              # ARIA tree (preferred for understanding structure)
playwright-cli -s=playground console error                         # validator + react errors
playwright-cli -s=playground console debug --all                   # everything since session start
playwright-cli -s=playground screenshot                            # PNG to .playwright/screenshots/
playwright-cli -s=playground eval "document.title"                 # arbitrary JS in page context
```

### Project-specific browser gotchas

- **Monaco editor**: huge ARIA tree, unstable refs. Read/write content via the
  Monaco API rather than the snapshot tree:
  ```bash
  playwright-cli -s=playground eval "monaco.editor.getModels().find(m => m.uri.path === '/schema.json').getValue()"
  playwright-cli -s=playground eval "monaco.editor.getModels().find(m => m.uri.path === '/instance.json').setValue('{}')"
  ```
- **Web Worker logs**: the validator runs in a Worker. Its `console.log` calls
  are *not* captured by `playwright-cli console` directly — the worker forwards
  them to the main thread on its own. Look for lines prefixed `[validator.wasm]`.
- **Cold wasm init**: first validation after page load takes ~1–2s while the
  44 MiB wasm instantiates. Use `playwright-cli -s=playground wait-for --text Idle`
  to wait for the validator status to flip from "Validating…" to "Idle".
- **Vite port**: `npm run dev` defaults to 5173 but bumps to 5174/5175 if taken.
  Check the dev-server output for the actual URL before asking the agent to navigate.

### Detach

```bash
playwright-cli -s=playground detach        # leaves the browser tab alone
```

## Common task recipes

- **Add a new example schema**: edit `src/examples/registry.ts`, add inline
  instance JSON, then run `npm test` (covers registry + loader).
- **Change validator behavior**: edit `wasm/Sources/JSONSchemaWasm/main.swift`,
  rebuild with `cd wasm && ./build.sh`, hard-refresh the browser tab.
- **Wire a new UI component**: keep state in `App.tsx`, components stay
  presentational. Tailwind v4 — no `tailwind.config.js`.
- **CI**: pushes to `main` trigger `.github/workflows/deploy.yml` (build wasm +
  Vite + deploy to Pages). PRs trigger `.github/workflows/size-report.yml`
  which posts a sticky bundle-size comment.
