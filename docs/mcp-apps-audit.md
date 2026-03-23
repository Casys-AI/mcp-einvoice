# MCP Apps Audit — lib/einvoice

Audit against the
[MCP Apps SDK spec](https://github.com/modelcontextprotocol/ext-apps) (ext-apps
v1.x).

Date: 2026-03-15

## Architecture

```
Host (Claude Desktop, basic-host, etc.)
  1. Calls MCP tool (e.g. einvoice_invoice_search)
  2. MCP server executes handler → adapter → Iopole API → JSON result
  3. Tool result includes _meta.ui.resourceUri → host loads HTML resource in iframe
  4. Host sends tool result to iframe via postMessage
  5. SDK App (in iframe) receives data via ontoolresult handler
  6. Viewer can call back server tools via app.callServerTool() (e.g. accept invoice)
```

Viewers: `invoice-viewer` (single invoice detail + actions) and `doclist-viewer`
(table with sort/filter/pagination).

Both use React + `@modelcontextprotocol/ext-apps` SDK +
`vite-plugin-singlefile`.

## Findings

### P0 — Handler registration after connect()

**Files:** `InvoiceViewer.tsx:220-224`, `DoclistViewer.tsx:187-191`

The spec requires all handlers to be registered BEFORE `app.connect()`.
Currently:

```tsx
app.connect().catch(() => {}); // connects first
app.ontoolresult = (result) => {}; // handlers assigned after
app.ontoolinputpartial = () => {};
```

Should be:

```tsx
app.ontoolresult = (result) => {}; // handlers first
app.ontoolinputpartial = () => {};
app.connect().catch(() => {}); // then connect
```

- [ ] Fix InvoiceViewer
- [ ] Fix DoclistViewer

### P0 — Missing safe area insets handling

**Files:** `InvoiceViewer.tsx`, `DoclistViewer.tsx`

Neither viewer implements `app.onhostcontextchanged`. The spec says: "Always
respect safeAreaInsets". On mobile hosts or certain desktop layouts, content
will be clipped.

Minimal fix:

```tsx
app.onhostcontextchanged = (ctx) => {
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
};
```

- [ ] Fix InvoiceViewer
- [ ] Fix DoclistViewer

### P1 — McpDataLoader.tsx is dead code

**File:** `src/ui/shared/McpDataLoader.tsx`

Implements the MCP Apps iframe protocol by hand (postMessage `ui/initialize`,
`ui/notifications/tool-result`, `window.mcpData`). This was the approach before
the official SDK existed.

Both viewers now use the SDK `App` class directly and do NOT import
`McpDataLoader`. It should be removed to avoid confusion.

- [ ] Delete McpDataLoader.tsx

### ~~P1 — Text fallback for non-UI hosts~~ RESOLVED

`ConcurrentMCPServer` auto-wraps plain return values into
`{ content: [{ type: "text", text: JSON.stringify(result) }] }`. No action
needed.

### P2 — No onteardown handler

Neither viewer implements `app.onteardown`. Currently acceptable since there are
no persistent connections (WebSocket, intervals) to clean up. The refresh
mechanism is event-driven (focus/visibilitychange listeners).

- [ ] Add onteardown if persistent resources are added later

### P2 — No host theme integration (by design)

Viewers use a custom Iopole theme (`global.css` with `--bg-*`, `--text-*` CSS
vars) instead of consuming host CSS variables via `useHostStyles(app)`. This
means the viewer will look like Iopole (teal accent), not like the host.

This is acceptable if Iopole branding is intentional. If seamless host
integration is preferred later:

- [ ] Add `useHostStyles(app)` and map host vars to local vars
- [ ] Or: keep Iopole branding, document the choice

## What's correctly implemented

- **Tool-Resource linkage**: tools have `_meta.ui.resourceUri` pointing to
  registered resources
- **vite-plugin-singlefile**: builds produce self-contained HTML files
- **callServerTool**: InvoiceViewer uses it for
  accept/reject/dispute/mark-seen/download actions
- **Visibility-aware refresh**: pauses when tab is hidden, resumes on focus
- **ontoolresult + ontoolinputpartial**: both lifecycle hooks are wired
- **Resource fallback logging**: server.ts warns when UI dist is not built (no
  silent fallback)
- **Adapter pattern**: PA-agnostic, tools call adapter methods not API endpoints
- **Auto text wrapping**: ConcurrentMCPServer wraps plain results in content
  array (non-UI hosts get text)

## Upstream: @casys/mcp-server improvements

These are improvements to factor into `lib/server/` (`@casys/mcp-server`) to
eliminate boilerplate duplicated across consumers (einvoice, erpnext, future
packages).

Tracked here, to be implemented on a dedicated branch against `lib/server/`.

### Level 1 — registerViewers() helper

**Problem:** Every consumer repeats the same 15-line loop: enumerate viewers,
resolve dist path, registerResource with MCP_APP_MIME_TYPE, warn if not built.
Identical in einvoice and erpnext.

**Duplicated code per consumer:**

- `src/ui/viewers.ts` — hardcoded `UI_VIEWERS` array
- `src/ui/viewer-resource-paths.ts` — `resolveViewerDistPath()` (identical
  logic)
- `server.ts` — registration loop with warning fallback

**Proposed API:**

```ts
// In @casys/mcp-server
server.registerViewers({
  prefix: "mcp-einvoice",        // → uri: ui://mcp-einvoice/{viewerName}
  moduleUrl: import.meta.url,     // resolve dist paths relative to consumer
  viewers: ["invoice-viewer", "doclist-viewer"],
  // optional overrides:
  distPaths?: string[],           // custom candidate paths (default: src/ui/dist, ui-dist)
  humanName?: (name: string) => string,
});
```

**Implementation scope:**

- Add `registerViewers()` method to `ConcurrentMCPServer`
- Move `resolveViewerDistPath()` into `@casys/mcp-server` as shared util
- Consumers reduce to a single call + delete 2 files each

- [ ] Implement in lib/server/
- [ ] Migrate lib/einvoice/server.ts
- [ ] Migrate lib/erpnext/server.ts
- [ ] Delete viewer-resource-paths.ts + viewers.ts from both consumers

### ~~Level 2 — Shared UI build pipeline~~ ABANDONED

**Decision:** The build pipeline stays local in each consumer. Rationale:

1. **Independence** — Each lib (einvoice, erpnext) must work standalone.
   Requiring `@casys/mcp-server` at build time (to get a build script) creates a
   coupling that doesn't exist today. A consumer installing
   `@casys/mcp-einvoice` should not need the server framework just to build UIs.
2. **Build ≠ Runtime** — Build is Node.js + Vite, runtime is Deno + MCP server.
   Different worlds, different dependency graphs. Merging them gains nothing.
3. **The script is 20 lines** — The duplication is trivial. The Vite config may
   diverge per consumer (custom plugins, aliases, framework changes). Forcing a
   shared config would become a constraint, not a convenience.

**What IS shared (Level 1, implemented):**

- `registerViewers()` — runtime registration, already in `@casys/mcp-server`
- `resolveViewerDistPath()` — runtime path resolution, already in
  `@casys/mcp-server`
- `discoverViewers()` — runtime auto-discovery, already in `@casys/mcp-server`

The consumer keeps its own `build-all.mjs` + `vite.single.config.mjs`.

### Level 3 — Viewer React hook (deferred)

**Problem:** Each viewer reimplements the same lifecycle: App instantiation →
handler registration → connect() → ontoolresult parsing → refresh with
visibility gate → safe area insets. This is where the P0 bugs live (handler
order, missing safe area). Fixing it once in a shared hook prevents the bugs
from recurring in every new viewer.

**Sketch:**

```tsx
import { useMcpViewer } from "@casys/mcp-viewer";

function InvoiceViewer() {
  const { data, loading, error, refreshing, refresh, callAction } =
    useMcpViewer<InvoiceData>({
      name: "Invoice Viewer",
      refreshInterval: 15_000,
    });
  // Only render JSX — zero boilerplate
}
```

**Why deferred:** Creates a React dependency (separate package needed). ROI
unclear with only 2 consumers today. Revisit when a 3rd consumer appears or when
the P0 fixes feel like too much boilerplate to maintain per-viewer.

- [ ] Decide: separate `@casys/mcp-viewer` package vs inline in mcp-server
- [ ] Implement if 3rd consumer appears
