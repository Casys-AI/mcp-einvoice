#!/usr/bin/env bash
# Build @casys/einvoice-rest for Node.js distribution
#
# What this does:
# 1. Copies packages/core/src/ into the dist workspace (core-src/)
# 2. Copies packages/rest/ into the dist workspace
# 3. Replaces core runtime.ts with runtime.node.ts
# 4. Rewrites @casys/einvoice-core imports to relative paths
# 5. Strips .ts extensions from relative imports (Node ESM convention)
# 6. Bundles server.node.ts into a single einvoice-rest.mjs with esbuild
# 7. Produces a publishable npm package in dist-rest-node/pkg/
#
# Output: dist-rest-node/pkg/ ready for npm publish
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-rest-node"
VERSION="$(grep '"version"' "$ROOT_DIR/packages/rest/deno.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')"

echo "[build-rest-node] Building @casys/einvoice-rest for Node.js v$VERSION..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy core (adapter layer) into dist/core/ (matches import paths in mod.ts: "./src/...")
mkdir -p "$DIST_DIR/core"
cp -r "$ROOT_DIR/packages/core/src" "$DIST_DIR/core/src"
cp "$ROOT_DIR/packages/core/mod.ts" "$DIST_DIR/core/mod.ts"

# Copy rest source
cp -r "$ROOT_DIR/packages/rest/src" "$DIST_DIR/src"
cp "$ROOT_DIR/packages/rest/server.node.ts" "$DIST_DIR/server.ts"

# Remove test files
find "$DIST_DIR" -name "*_test.ts" -o -name "*.test.ts" -o -name "*.bench.ts" | xargs rm -f 2>/dev/null || true

# Replace core runtime.ts with runtime.node.ts
cp "$DIST_DIR/core/src/runtime.node.ts" "$DIST_DIR/core/src/runtime.ts"
rm -f "$DIST_DIR/core/src/runtime.node.ts"

# Rewrite @casys/einvoice-core imports to relative paths
# In server.ts (root level): @casys/einvoice-core -> ./core/mod.ts
perl -i'' -pe 's|from "\@casys/einvoice-core"|from "./core/mod.ts"|g' "$DIST_DIR/server.ts"
# In src/ files: @casys/einvoice-core -> ../core/mod.ts
find "$DIST_DIR/src" -name "*.ts" -exec perl -i'' \
  -pe 's|from "\@casys/einvoice-core"|from "../core/mod.ts"|g' {} +

# Strip .ts extensions from relative imports -> .js (Node ESM)
find "$DIST_DIR" -name "*.ts" -exec perl -i'' \
  -pe 's/from "(\.[^"]*?)\.ts"/from "$1.js"/g; s/import\("(\.[^"]*?)\.ts"\)/import("$1.js")/g' \
  {} +

# Generate package.json for the intermediate Node workspace
cat > "$DIST_DIR/package.json" <<PKGJSON
{
  "name": "@casys/einvoice-rest-build",
  "private": true,
  "version": "$VERSION",
  "type": "module",
  "dependencies": {
    "@hono/node-server": "^1.14.4",
    "hono": "^4.7.11",
    "@hono/zod-openapi": "^0.18.3",
    "@hono/swagger-ui": "^0.5.1",
    "zod": "^3.24.3"
  },
  "devDependencies": {
    "esbuild": "^0.25.12"
  }
}
PKGJSON

pushd "$DIST_DIR" >/dev/null
npm install --no-fund --no-audit

mkdir -p pkg

./node_modules/.bin/esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=pkg/einvoice-rest.mjs \
  --external:node:* \
  --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' \
  2>&1

{ printf '#!/usr/bin/env node\n'; cat pkg/einvoice-rest.mjs; } > pkg/einvoice-rest.mjs.tmp && mv pkg/einvoice-rest.mjs.tmp pkg/einvoice-rest.mjs
chmod +x pkg/einvoice-rest.mjs

# Generate package.json for the published package
cat > pkg/package.json <<PKGJSON
{
  "name": "@casys/einvoice-rest",
  "version": "$VERSION",
  "description": "REST API for e-invoicing — Hono + Zod OpenAPI, runtime-agnostic (Node.js build)",
  "type": "module",
  "bin": {
    "einvoice-rest": "einvoice-rest.mjs"
  },
  "files": [
    "einvoice-rest.mjs",
    "README.md"
  ],
  "keywords": [
    "einvoice",
    "e-invoicing",
    "rest",
    "hono",
    "openapi",
    "iopole",
    "storecove",
    "superpdp"
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

echo "[build-rest-node] Done! Publishable package: $DIST_DIR/pkg"
echo ""
echo "Useful commands:"
echo "  node $DIST_DIR/pkg/einvoice-rest.mjs --no-auth --port=3016"
echo "  cd $DIST_DIR/pkg && npm pack"
