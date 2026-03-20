/**
 * UI Watch — auto-rebuild viewers on file change.
 *
 * Watches src/ui/ for TSX/TS/CSS changes and runs build-all.mjs.
 * Use alongside `deno task serve` for a fast dev loop:
 *
 *   Terminal 1: deno task serve
 *   Terminal 2: deno task ui:watch
 *
 * After rebuild, just trigger a new tool call in Claude Desktop
 * or MCP Inspector — the server serves fresh dist/ on each request.
 */

const WATCH_DIR = "src/ui";
const EXTENSIONS = [".tsx", ".ts", ".css"];
const DEBOUNCE_MS = 500;

let timeout: number | undefined;
let building = false;

async function rebuild() {
  if (building) return;
  building = true;
  console.log("\n🔨 Rebuilding viewers...");
  const start = Date.now();
  const cmd = new Deno.Command("node", {
    args: ["build-all.mjs"],
    cwd: "src/ui",
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  const elapsed = Date.now() - start;
  if (code === 0) {
    console.log(`✓ Rebuilt in ${elapsed}ms`);
  } else {
    console.error(`✕ Build failed (${elapsed}ms)`);
    console.error(new TextDecoder().decode(stderr));
  }
  building = false;
}

console.log(`👀 Watching ${WATCH_DIR}/ for changes (${EXTENSIONS.join(", ")})...`);
console.log("   Run 'deno task serve' in another terminal.\n");

const watcher = Deno.watchFs(WATCH_DIR, { recursive: true });
for await (const event of watcher) {
  const relevant = event.paths.some((p) =>
    EXTENSIONS.some((ext) => p.endsWith(ext)) && !p.includes("node_modules") && !p.includes("/dist/")
  );
  if (!relevant) continue;

  // Debounce — wait for rapid file saves to settle
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => rebuild(), DEBOUNCE_MS);
}
