/**
 * MCP Server Bootstrap for E-Invoice
 *
 * PA-agnostic MCP server for French e-invoicing.
 * Uses the adapter pattern — currently Iopole, extensible to other PA.
 *
 * Usage in .pml.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "einvoice": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/einvoice/server.ts"],
 *       "env": {
 *         "EINVOICE_ADAPTER": "iopole",
 *         "IOPOLE_API_URL": "https://api.ppd.iopole.fr/v1",
 *         "IOPOLE_CLIENT_ID": "your-client-id",
 *         "IOPOLE_CLIENT_SECRET": "your-client-secret",
 *         "IOPOLE_CUSTOMER_ID": "your-customer-id"
 *       }
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3015):
 *   deno run --allow-all lib/einvoice/server.ts --http
 *   deno run --allow-all lib/einvoice/server.ts --http --port=3015
 *
 * Environment:
 *   EINVOICE_ADAPTER=iopole                         Adapter to use (default: iopole)
 *   IOPOLE_API_URL=https://api.ppd.iopole.fr/v1     Iopole API base URL
 *   IOPOLE_CLIENT_ID=xxx                             OAuth2 client ID
 *   IOPOLE_CLIENT_SECRET=xxx                         OAuth2 client secret
 *   IOPOLE_CUSTOMER_ID=xxx                           Required header (since 2026-02-01)
 *   IOPOLE_AUTH_URL=xxx                              Token endpoint (optional, default: production)
 *
 * @module lib/einvoice/server
 */

import { ConcurrentMCPServer, launchInspector } from "@casys/mcp-server";
import { einvoiceErrorMapper } from "./src/tools/error-mapper.ts";
import { EInvoiceToolsClient } from "./src/client.ts";
import type { EInvoiceAdapter } from "./src/adapter.ts";
import { createIopoleAdapter } from "./src/adapters/iopole/adapter.ts";
import { createStorecoveAdapter } from "./src/adapters/storecove/adapter.ts";
import { createSuperPDPAdapter } from "./src/adapters/superpdp/adapter.ts";
import {
  env,
  exit,
  getArgs,
  onSignal,
  readTextFile,
  statSync,
} from "./src/runtime.ts";

const DEFAULT_HTTP_PORT = 3015;
const LOG_PREFIX = "[mcp-einvoice]";

/**
 * Create the appropriate adapter based on config.
 * Currently only Iopole is implemented.
 */
function createAdapter(adapterName: string): EInvoiceAdapter {
  switch (adapterName) {
    case "iopole":
      return createIopoleAdapter();
    case "storecove":
      return createStorecoveAdapter();
    case "superpdp":
      return createSuperPDPAdapter();
    default:
      throw new Error(
        `${LOG_PREFIX} Unknown adapter: "${adapterName}". ` +
          `Available adapters: iopole, storecove, superpdp`,
      );
  }
}

async function main() {
  const args = getArgs();

  // Inspector mode — launch MCP Inspector for interactive debugging
  if (args.includes("--inspect")) {
    await launchInspector("deno", [
      "run",
      "--allow-all",
      import.meta.filename!,
    ]);
    return;
  }

  // Adapter selection
  const adapterArg = args.find((arg) => arg.startsWith("--adapter="));
  const adapterName = adapterArg
    ? adapterArg.split("=")[1]
    : env("EINVOICE_ADAPTER") || "iopole";

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // HTTP mode
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "localhost";

  // Initialize adapter
  const adapter = createAdapter(adapterName);

  // Initialize tools client
  const toolsClient = new EInvoiceToolsClient(
    categories ? { categories } : undefined,
  );

  // Build MCP server
  const server = new ConcurrentMCPServer({
    name: "mcp-einvoice",
    version: "0.1.1",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    toolErrorMapper: einvoiceErrorMapper,
    logger: (msg: string) => console.error(`${LOG_PREFIX} ${msg}`),
  });

  // Register tools supported by this adapter (filtered by capabilities)
  const mcpTools = toolsClient.toMCPFormat(adapter);
  const handlers = toolsClient.buildHandlersMap(adapter);
  server.registerTools(mcpTools, handlers);

  // Register UI viewers (MCP Apps)
  server.registerViewers({
    prefix: "mcp-einvoice",
    moduleUrl: import.meta.url,
    viewers: [
      "invoice-viewer",
      "doclist-viewer",
      "status-timeline",
      "directory-card",
      "directory-list",
      "action-result",
    ],
    exists: statSync,
    readFile: readTextFile,
  });

  console.error(
    `${LOG_PREFIX} Initialized — adapter=${adapterName}, ${toolsClient.count} tools${
      categories ? ` (categories: ${categories.join(", ")})` : ""
    }`,
  );

  // Start server
  if (httpFlag) {
    await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      onListen: (info: { hostname: string; port: number }) => {
        console.error(
          `${LOG_PREFIX} HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    onSignal("SIGINT", () => {
      console.error(`${LOG_PREFIX} Shutting down...`);
      exit(0);
    });
  } else {
    await server.start();
    console.error(`${LOG_PREFIX} stdio mode ready`);
  }
}

main().catch((err) => {
  console.error(`${LOG_PREFIX} Fatal error:`, err);
  exit(1);
});
