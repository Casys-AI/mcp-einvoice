/**
 * E-Invoice REST Server
 *
 * @module einvoice-rest/server
 */

import { createAdapter } from "@casys/einvoice-core";
import { createApp } from "./src/app.ts";

const DEFAULT_PORT = 3016;

function main() {
  const args = Deno.args;

  const adapterArg = args.find((a) => a.startsWith("--adapter="));
  const adapterName = adapterArg
    ? adapterArg.split("=")[1]
    : Deno.env.get("EINVOICE_ADAPTER") || "iopole";

  const portArg = args.find((a) => a.startsWith("--port="));
  const port = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : parseInt(Deno.env.get("PORT") || String(DEFAULT_PORT), 10);

  const noAuth = args.includes("--no-auth");
  const apiKey = noAuth ? null : (Deno.env.get("EINVOICE_REST_API_KEY") ?? null);
  if (!apiKey && !noAuth) {
    console.error(
      "[einvoice-rest] WARNING: No EINVOICE_REST_API_KEY set. Use --no-auth to disable auth explicitly.",
    );
  }

  const adapter = createAdapter(adapterName);
  const app = createApp(adapter, apiKey);

  console.error(
    `[einvoice-rest] Starting — adapter=${adapterName}, port=${port}, auth=${
      apiKey ? "enabled" : "disabled"
    }`,
  );

  Deno.serve({ port }, app.fetch);
}

main();
