#!/usr/bin/env bash
#
# Build the JSONSchemaWasm SwiftPM executable to a single WebAssembly binary
# and copy it to ../public/validator.wasm so the playground can load it from
# a Web Worker.
#
# Prerequisites:
#   1. A Swift toolchain that includes wasm-capable clang (Swift.org build,
#      NOT the Apple Xcode toolchain — Xcode's clang lacks the WebAssembly
#      LLVM backend). Easiest route on macOS:
#
#          curl -O https://download.swift.org/swiftly/darwin/swiftly.pkg
#          installer -pkg swiftly.pkg -target CurrentUserHomeDirectory
#          ~/.swiftly/bin/swiftly init --quiet-shell-followup --assume-yes
#          . ~/.swiftly/env.sh
#          swiftly install ${SWIFT_VERSION}
#          swiftly use      ${SWIFT_VERSION}
#
#   2. The matching Swift SDK for WebAssembly (single-threaded; we cannot use
#      the *-threads variant because GitHub Pages can't set the COOP/COEP
#      headers SharedArrayBuffer requires):
#
#          swift sdk install ${WASM_SDK_URL} --checksum ${WASM_SDK_CHECKSUM}
#
# The script will fail fast with a clear message if either prerequisite is
# missing, and will print the exact commands to fix it.

set -euo pipefail

# ---- Configuration ----------------------------------------------------------

SWIFT_VERSION="6.3.1"
WASM_SDK_ID="swift-${SWIFT_VERSION}-RELEASE_wasm"
WASM_SDK_URL="https://download.swift.org/swift-${SWIFT_VERSION}-release/wasm-sdk/swift-${SWIFT_VERSION}-RELEASE/swift-${SWIFT_VERSION}-RELEASE_wasm.artifactbundle.tar.gz"
WASM_SDK_CHECKSUM="bd47baa20771f366d8beed7970afaa30742b2210097afd15f85427226d8f4cf2"

PRODUCT_NAME="JSONSchemaWasm"
TRIPLE="wasm32-unknown-wasip1"
CONFIGURATION="release"

# ---- Paths ------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/public"
OUTPUT_PATH="${OUTPUT_DIR}/validator.wasm"

cd "${SCRIPT_DIR}"

# ---- Toolchain selection ----------------------------------------------------

# Prefer swiftly-managed Swift if present so we get a wasm-capable clang. The
# default macOS `/usr/bin/swift` shells out to Xcode's toolchain, which does
# NOT include the WebAssembly LLVM backend and will fail with
# `unable to create target: 'No available targets are compatible with triple
# "wasm32-unknown-wasip1"'`.
if [ -f "${HOME}/.swiftly/env.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.swiftly/env.sh"
fi

if ! command -v swift >/dev/null 2>&1; then
  cat >&2 <<EOF
error: \`swift\` was not found on PATH.

Install Swift ${SWIFT_VERSION} via swiftly:

    curl -O https://download.swift.org/swiftly/darwin/swiftly.pkg
    installer -pkg swiftly.pkg -target CurrentUserHomeDirectory
    ~/.swiftly/bin/swiftly init --quiet-shell-followup --assume-yes
    . ~/.swiftly/env.sh
    swiftly install ${SWIFT_VERSION}
    swiftly use      ${SWIFT_VERSION}

Then re-run this script.
EOF
  exit 1
fi

SWIFT_PATH="$(command -v swift)"
SWIFT_VERSION_OUTPUT="$(swift --version 2>&1 | head -1)"

echo "==> Using swift at: ${SWIFT_PATH}"
echo "    ${SWIFT_VERSION_OUTPUT}"

# Verify the compiler driver actually supports the wasm32 target. This is the
# real gate — many Macs have a Swift on PATH that lacks wasm support.
if ! "$(dirname "${SWIFT_PATH}")/clang" --print-targets 2>/dev/null | grep -q '^[[:space:]]*wasm32'; then
  cat >&2 <<EOF
error: the active Swift toolchain's clang does not include a wasm32 target.

You probably have Xcode's toolchain on PATH. Install a Swift.org build of
Swift ${SWIFT_VERSION} via swiftly (see header of this script for details):

    swiftly install ${SWIFT_VERSION}
    swiftly use      ${SWIFT_VERSION}
    . ~/.swiftly/env.sh

Then re-run this script.
EOF
  exit 1
fi

# ---- SDK check --------------------------------------------------------------

if ! swift sdk list 2>/dev/null | grep -qx "${WASM_SDK_ID}"; then
  cat >&2 <<EOF
error: Swift SDK \`${WASM_SDK_ID}\` is not installed.

Install it with:

    swift sdk install \\
        ${WASM_SDK_URL} \\
        --checksum ${WASM_SDK_CHECKSUM}

Then re-run this script.
EOF
  exit 1
fi

echo "==> Using Swift SDK: ${WASM_SDK_ID}"

# ---- Build ------------------------------------------------------------------
#
# Size-targeted compiler/linker flags. Notes:
#   * `-Osize` tells the Swift optimizer to favor binary size over speed.
#     We don't ship the wasm to a perf-critical hot loop — validation runs
#     once per debounced edit — so trading a little runtime speed for ~tens
#     of MiB on disk is a clear win.
#   * `-wmo` enables whole-module optimization, which helps the linker
#     dead-strip unused code across files.
#   * `-gnone` drops debug info entirely. Swift's DWARF is enormous on wasm
#     (often >50% of the artifact). Stack traces from end users will lose
#     symbol names, but that's an acceptable trade for the playground.
#
# Note on linker flags: we deliberately do NOT pass `-Xlinker --gc-sections`
# / `-Xlinker --strip-all` here, even though wasm-ld supports them. SwiftPM
# applies `-Xlinker` to every link invocation in the build graph — including
# host-side SwiftSyntax macro tools (e.g. BridgeJSMacros) that link with the
# native macOS `ld`, which does not understand those GNU/wasm-ld flags and
# will fail the whole build. Stripping and dead-section removal are handled
# instead by the `wasm-opt` post-pass below, which is wasm-only and at least
# as effective.
echo "==> Building ${PRODUCT_NAME} for ${TRIPLE} (${CONFIGURATION})..."
swift build \
  --swift-sdk "${WASM_SDK_ID}" \
  -c "${CONFIGURATION}" \
  --product "${PRODUCT_NAME}" \
  -Xswiftc -Osize \
  -Xswiftc -wmo \
  -Xswiftc -gnone

BUILT_WASM="${SCRIPT_DIR}/.build/${TRIPLE}/${CONFIGURATION}/${PRODUCT_NAME}.wasm"

if [ ! -f "${BUILT_WASM}" ]; then
  echo "error: expected wasm artifact not found at ${BUILT_WASM}" >&2
  echo "       (looked under \`swift build\` output for ${TRIPLE}/${CONFIGURATION})" >&2
  find "${SCRIPT_DIR}/.build" -name "${PRODUCT_NAME}.wasm" -type f >&2 || true
  exit 1
fi

# ---- Install ----------------------------------------------------------------

mkdir -p "${OUTPUT_DIR}"
cp "${BUILT_WASM}" "${OUTPUT_PATH}"

# ---- Post-process with wasm-opt (binaryen) ----------------------------------
#
# `wasm-opt -Oz` runs binaryen's size-targeted optimization passes over the
# already-built module. On SwiftWasm artifacts this typically reclaims 40–60%
# more on top of the compiler-side flags above (vacuum, dead-code elimination,
# duplicate-function merging, etc.). The `--strip-debug` / `--strip-producers`
# flags drop the residual `name` and `producers` custom sections.
#
# We treat wasm-opt as optional: if it isn't installed, the script still
# produces a valid (just larger) artifact and prints a hint.
if command -v wasm-opt >/dev/null 2>&1; then
  PRE_OPT_BYTES="$(stat -f%z "${OUTPUT_PATH}" 2>/dev/null || stat -c%s "${OUTPUT_PATH}")"
  PRE_OPT_HUMAN="$(awk -v b="${PRE_OPT_BYTES}" 'BEGIN { printf "%.1f MiB", b / 1024 / 1024 }')"
  echo "==> wasm-opt -Oz (pre: ${PRE_OPT_BYTES} bytes / ${PRE_OPT_HUMAN})..."
  wasm-opt \
    -Oz \
    --strip-debug \
    --strip-producers \
    --vacuum \
    "${OUTPUT_PATH}" \
    -o "${OUTPUT_PATH}.opt"
  mv "${OUTPUT_PATH}.opt" "${OUTPUT_PATH}"
else
  cat >&2 <<EOF
warning: wasm-opt (binaryen) not found on PATH — skipping size-optimization
         post-pass. Install it for a much smaller artifact:

             brew install binaryen        # macOS
             apt-get install -y binaryen  # Debian / Ubuntu

EOF
fi

# ---- Report -----------------------------------------------------------------

WASM_SIZE_BYTES="$(stat -f%z "${OUTPUT_PATH}" 2>/dev/null || stat -c%s "${OUTPUT_PATH}")"
WASM_SIZE_HUMAN="$(awk -v b="${WASM_SIZE_BYTES}" 'BEGIN { printf "%.1f MiB", b / 1024 / 1024 }')"

# Approximate over-the-wire size: GitHub Pages auto-serves wasm with gzip,
# so this is closer to what users actually pay than the raw size.
WASM_GZIP_BYTES="$(gzip -9 -c "${OUTPUT_PATH}" | wc -c | tr -d ' ')"
WASM_GZIP_HUMAN="$(awk -v b="${WASM_GZIP_BYTES}" 'BEGIN { printf "%.1f MiB", b / 1024 / 1024 }')"

echo
echo "==> Built:        ${BUILT_WASM}"
echo "==> Copied:       ${OUTPUT_PATH}"
echo "==> Size (raw):   ${WASM_SIZE_BYTES} bytes (${WASM_SIZE_HUMAN})"
echo "==> Size (gzip):  ${WASM_GZIP_BYTES} bytes (${WASM_GZIP_HUMAN})"
file "${OUTPUT_PATH}" || true
