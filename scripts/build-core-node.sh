#!/usr/bin/env bash
# Build @casys/einvoice-core for Node.js distribution
#
# What this does:
# 1. Copies packages/core/src/ and mod.ts to dist-core-node/
# 2. Replaces runtime.ts with runtime.node.ts (process.env instead of Deno.env)
# 3. Strips .ts extensions from relative imports (Node ESM convention)
# 4. Bundles everything into a single index.mjs with esbuild
# 5. Produces a publishable npm package in dist-core-node/pkg/
#
# Output: dist-core-node/pkg/ ready for npm publish
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-core-node"
VERSION="$(grep '"version"' "$ROOT_DIR/packages/core/deno.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')"

echo "[build-core-node] Building @casys/einvoice-core for Node.js v$VERSION..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy core source
cp -r "$ROOT_DIR/packages/core/src" "$DIST_DIR/src"
cp "$ROOT_DIR/packages/core/mod.ts" "$DIST_DIR/mod.ts"

# Remove test files and Deno-only testing utilities (jsr:@std/assert, Deno.TestContext)
find "$DIST_DIR" -name "*_test.ts" -o -name "*.test.ts" -o -name "*.bench.ts" | xargs rm -f 2>/dev/null || true
rm -rf "$DIST_DIR/src/testing"

# Strip testing exports from mod.ts (Deno-only, uses jsr: imports)
perl -i -0777 -pe 's/\/\/ ─── Testing ─.*//s' "$DIST_DIR/mod.ts"

# Replace runtime.ts with runtime.node.ts
cp "$DIST_DIR/src/runtime.node.ts" "$DIST_DIR/src/runtime.ts"
rm -f "$DIST_DIR/src/runtime.node.ts"

# Strip .ts extensions from relative imports -> .js (Node ESM)
find "$DIST_DIR" -name "*.ts" -exec perl -i -pe \
  's/from "(\.[^"]*?)\.ts"/from "$1.js"/g; s/import\("(\.[^"]*?)\.ts"\)/import("$1.js")/g' {} +

# Generate package.json for the intermediate Node workspace
cat > "$DIST_DIR/package.json" <<PKGJSON
{
  "name": "@casys/einvoice-core-build",
  "private": true,
  "version": "$VERSION",
  "type": "module",
  "devDependencies": {
    "esbuild": "^0.25.12"
  }
}
PKGJSON

pushd "$DIST_DIR" >/dev/null
npm install --no-fund --no-audit

mkdir -p pkg

./node_modules/.bin/esbuild mod.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=pkg/index.mjs \
  --external:node:*

# Generate package.json for the published package
cat > pkg/package.json <<PKGJSON
{
  "name": "@casys/einvoice-core",
  "version": "$VERSION",
  "description": "PA-agnostic e-invoicing adapter layer for Node.js",
  "type": "module",
  "main": "index.mjs",
  "exports": {
    ".": "./index.mjs"
  },
  "files": [
    "index.mjs",
    "README.md"
  ],
  "keywords": [
    "einvoice",
    "e-invoicing",
    "iopole",
    "storecove",
    "superpdp",
    "adapter",
    "factur-x",
    "chorus-pro"
  ],
  "engines": {
    "node": ">=20.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Casys-AI/mcp-einvoice"
  },
  "license": "MIT"
}
PKGJSON

cp "$ROOT_DIR/README.md" pkg/README.md 2>/dev/null || true

popd >/dev/null

echo "[build-core-node] Done! Publishable package: $DIST_DIR/pkg"
echo ""
echo "Useful commands:"
echo "  cd $DIST_DIR/pkg && npm pack"
