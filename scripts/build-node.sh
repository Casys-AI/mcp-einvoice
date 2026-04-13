#!/usr/bin/env bash
# Build @casys/mcp-einvoice for Node.js distribution
#
# Recreates the pre-monorepo flat layout in dist-node/:
#   dist-node/src/adapter.ts        (from core)
#   dist-node/src/adapters/...      (from core)
#   dist-node/src/tools/...         (from mcp)
#   dist-node/src/ui/...            (from mcp)
#   dist-node/src/client.ts         (from mcp)
#   dist-node/server.ts             (from mcp)
#
# Then: swap runtime, esbuild bundle with --alias for @casys/einvoice-core.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-node"
VERSION="$(grep '"version"' "$ROOT_DIR/packages/mcp/deno.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')"

echo "[build-node] Building @casys/mcp-einvoice v$VERSION for Node.js..."

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# ── Recreate flat src/ layout (core + mcp merged, like pre-monorepo) ──
cp -r "$ROOT_DIR/packages/core/src" "$DIST_DIR/src"
# Merge mcp on top, but skip testing/ (core has its own helpers.ts)
rsync -a --exclude='node_modules' --exclude='testing' "$ROOT_DIR/packages/mcp/src/" "$DIST_DIR/src/"
cp "$ROOT_DIR/packages/mcp/server.ts" "$DIST_DIR/server.ts"
cp "$ROOT_DIR/packages/mcp/mod.ts" "$DIST_DIR/mod.ts" 2>/dev/null || true

# Core mod.ts as the @casys/einvoice-core alias target
cp "$ROOT_DIR/packages/core/mod.ts" "$DIST_DIR/core-mod.ts"

# ── Clean up ──
find "$DIST_DIR" \( -name "*_test.ts" -o -name "*.test.ts" -o -name "*.bench.ts" \) -delete 2>/dev/null || true
rm -rf "$DIST_DIR/src/testing"

# Strip testing exports from core mod (Deno-only, uses jsr: imports)
perl -i -0777 -pe 's/\/\/ ─── Testing ─.*//s' "$DIST_DIR/core-mod.ts"
find "$DIST_DIR/src/ui" -maxdepth 1 -type d ! -name "ui" ! -name "dist" ! -name "shared" -exec rm -rf {} + 2>/dev/null || true
rm -f "$DIST_DIR/src/ui/build-all.mjs" "$DIST_DIR/src/ui/vite.single.config.mjs" "$DIST_DIR/src/ui/package.json" "$DIST_DIR/src/ui/package-lock.json" 2>/dev/null || true

# ── Swap Deno runtime → Node runtime ──
if [ -f "$DIST_DIR/src/runtime.node.ts" ]; then
  cp "$DIST_DIR/src/runtime.node.ts" "$DIST_DIR/src/runtime.ts"
  rm "$DIST_DIR/src/runtime.node.ts"
fi

# ── Intermediate workspace ──
cat > "$DIST_DIR/package.json" <<PKGJSON
{
  "name": "@casys/mcp-einvoice-build",
  "private": true,
  "version": "$VERSION",
  "type": "module",
  "dependencies": {
    "@casys/mcp-server": "^0.17.0",
    "@modelcontextprotocol/sdk": "^1.15.1"
  },
  "devDependencies": {
    "esbuild": "^0.25.12"
  }
}
PKGJSON

cp "$ROOT_DIR/README.md" "$DIST_DIR/README.md" 2>/dev/null || true

# ── Bundle ──
pushd "$DIST_DIR" >/dev/null
npm install --no-fund --no-audit

./node_modules/.bin/esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=bin/mcp-einvoice.mjs \
  --external:node:* \
  --alias:@casys/einvoice-core=./core-mod.ts \
  --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'

printf '#!/usr/bin/env node\n' | cat - bin/mcp-einvoice.mjs > bin/tmp.mjs && mv bin/tmp.mjs bin/mcp-einvoice.mjs
chmod +x bin/mcp-einvoice.mjs
cp -r src/ui/dist bin/ui-dist 2>/dev/null || true
cp README.md bin/README.md 2>/dev/null || true

cat > bin/package.json <<PKGJSON
{
  "name": "@casys/mcp-einvoice",
  "version": "$VERSION",
  "description": "PA-agnostic MCP server for French e-invoicing (Iopole, Chorus Pro...)",
  "type": "module",
  "bin": { "mcp-einvoice": "mcp-einvoice.mjs" },
  "files": ["mcp-einvoice.mjs", "ui-dist/**/*", "README.md"],
  "keywords": ["mcp", "einvoice", "e-invoicing", "iopole", "factur-x", "model-context-protocol"],
  "engines": { "node": ">=20.0.0" },
  "repository": { "type": "git", "url": "https://github.com/Casys-AI/mcp-einvoice" },
  "license": "MIT"
}
PKGJSON
popd >/dev/null

echo "[build-node] Done! Package: $DIST_DIR/bin"
