# Monorepo einvoice — Design Spec

> Date: 2026-04-01
> Status: Draft

## Contexte

Le projet `mcp-einvoice` contient aujourd'hui dans un seul repo : la couche
adapter e-invoicing (interface, 3 implémentations PA, shared utils) ET le
serveur MCP (tools, viewers, server bootstrap).

Le module Dolibarr (`dolibarr-invoice`, PHP) a besoin d'appeler les PDP
(Iopole, Storecove, SuperPDP) depuis PHP. Dolibarr ne peut pas importer de
TypeScript directement — il lui faut une API REST HTTP.

Ce REST API est un nouveau consommateur TypeScript de la couche adapter, ce qui
justifie l'extraction du core dans un package partagé.

## Objectif

Restructurer en **monorepo Deno workspaces** avec 3 packages :

1. `@casys/einvoice-core` — couche adapter, types, shared utils
2. `@casys/mcp-einvoice` — serveur MCP (nom inchangé, pas de breaking change)
3. `@casys/einvoice-rest` — serveur REST Hono pour Dolibarr et autres clients HTTP

## Architecture

```
einvoice/                             repo GitHub (renommé depuis mcp-einvoice)
  deno.json                           workspaces + tasks globales
  packages/
    core/                             @casys/einvoice-core
    mcp/                              @casys/mcp-einvoice
    rest/                             @casys/einvoice-rest
```

```
Dolibarr (PHP) ──HTTP──> einvoice-rest (Hono)
                              │
                              ▼
                        einvoice-core (adapters)
                              ▲
                              │
Claude Desktop ──MCP──> mcp-einvoice (tools/viewers)
```

## Package 1 : `@casys/einvoice-core`

### Contenu

Tout ce qui est aujourd'hui la couche business e-invoicing, sans dépendance MCP.

```
packages/core/
  deno.json                           name: @casys/einvoice-core
  mod.ts                              exports publics
  src/
    adapter.ts                        EInvoiceAdapter interface + tous les types
    adapters/
      base-adapter.ts                 BaseAdapter (abstract, NotSupportedError stubs)
      registry.ts                     createAdapter(name), listAdapterNames()
      shared/
        errors.ts                     NotSupportedError, AdapterAPIError
        http-client.ts                BaseHttpClient (abstract)
        oauth2.ts                     createOAuth2TokenProvider
        encoding.ts                   uint8ToBase64, encodePathSegment
        env.ts                        requireEnv
        direction.ts                  normalizeDirection
        types.ts                      types partagés entre adapters
      afnor/
        base-adapter.ts               AfnorBaseAdapter extends BaseAdapter
        client.ts                     AFNOR HTTP client
        types.ts                      types AFNOR
      iopole/
        adapter.ts                    IopoleAdapter
        client.ts                     IopoleClient extends BaseHttpClient
        normalize.ts                  normalizeForIopole()
        api-specs/                    6 OpenAPI JSON specs
      storecove/
        adapter.ts                    StorecoveAdapter
        client.ts                     StorecoveClient
      superpdp/
        adapter.ts                    SuperPDPAdapter
        client.ts                     SuperPDPClient
        normalize.ts                  normalizeForSuperPDP()
        api-specs/                    superpdp.json, afnor-flow.json
    testing/
      helpers.ts                      createMockAdapter()
```

### Exports (`mod.ts`)

- Interface : `EInvoiceAdapter`, `AdapterMethodName`
- Types : `InvoiceDetail`, `SearchInvoicesResult`, `InvoiceSearchFilters`,
  `StatusHistoryResult`, `StatusEntry`, `SendStatusRequest`,
  `SearchDirectoryFrResult`, `DirectoryFrRow`, `ListBusinessEntitiesResult`,
  `BusinessEntityRow`, `DownloadResult`, `PaginatedRequest`,
  `EmitInvoiceRequest`, `GenerateInvoiceRequest`, `GenerateFacturXRequest`,
  `CreateWebhookRequest`, `UpdateWebhookRequest`, `InvoiceDirection`,
  `InvoiceLineItem`, `InvoiceSearchRow`, `DirectoryFrSearchFilters`,
  `DirectoryIntSearchFilters`
- Adapters : `createIopoleAdapter()`, `createStorecoveAdapter()`,
  `createSuperPDPAdapter()`
- Registry : `createAdapter(name)`, `listAdapterNames()`
- Base classes : `BaseAdapter`, `AfnorBaseAdapter`
- Errors : `NotSupportedError`, `AdapterAPIError`
- HTTP : `BaseHttpClient`, `BaseClientConfig`
- Auth : `createOAuth2TokenProvider`
- Utils : `uint8ToBase64`, `encodePathSegment`, `requireEnv`,
  `normalizeDirection`
- Testing : `createMockAdapter()`

### Dépendances

Aucune dépendance externe. Utilise uniquement les Web APIs standard (fetch,
URL, crypto, TextEncoder, etc.).

## Package 2 : `@casys/mcp-einvoice`

### Contenu

Le serveur MCP existant, allégé de la couche adapter. Tout ce qui est
spécifique MCP : tools, viewers, server bootstrap.

```
packages/mcp/
  deno.json                           name: @casys/mcp-einvoice
  server.ts                           entry point MCP
  src/
    client.ts                         EInvoiceToolsClient
    generated-store.ts                store temporaire generate -> emit
    runtime.ts                        abstraction Deno
    runtime.node.ts                   abstraction Node.js
    tools/
      mod.ts                          registry tools
      types.ts                        EInvoiceTool, EInvoiceToolContext
      invoice.ts                      13 tools invoice
      directory.ts                    3 tools directory
      status.ts                       2 tools status
      reporting.ts                    2 tools reporting
      webhook.ts                      5 tools webhook
      config.ts                       14 tools config
      error-mapper.ts                 einvoiceErrorMapper
    ui/                               viewers React (build + dist)
    testing/                          helpers test MCP-spécifiques
```

### Dépendances

```json
{
  "imports": {
    "@casys/einvoice-core": "jsr:@casys/einvoice-core@^0.1.0",
    "@casys/mcp-server": "jsr:@casys/mcp-server@^0.12.0"
  }
}
```

### Changements dans les imports

Avant :
```ts
import type { EInvoiceAdapter } from "./src/adapter.ts";
import { createIopoleAdapter } from "./src/adapters/iopole/adapter.ts";
```

Apres :
```ts
import type { EInvoiceAdapter } from "@casys/einvoice-core";
import { createIopoleAdapter } from "@casys/einvoice-core";
```

## Package 3 : `@casys/einvoice-rest`

### Stack

- **Hono** — routeur HTTP, léger, compatible Deno
- **`@hono/zod-openapi`** — routes déclaratives avec validation Zod + génération
  OpenAPI automatique
- **`@hono/swagger-ui`** — Swagger UI sur `GET /docs`

### Structure

```
packages/rest/
  deno.json                           name: @casys/einvoice-rest
  server.ts                           entry point (parse args, create adapter, serve)
  src/
    app.ts                            Hono app + API key middleware
    routes/
      invoices.ts                     13 routes invoice
      directory.ts                    3 routes directory
      status.ts                       4 routes status
      reporting.ts                    2 routes reporting
      webhooks.ts                     5 routes webhook
      config.ts                       18 routes config/entities/identifiers
```

### Authentification

API key via header `Authorization: Bearer <key>`.

```
Env var : EINVOICE_REST_API_KEY
Flag :    --no-auth (dev uniquement, désactive la vérification)
```

Middleware Hono qui vérifie le header sur toutes les routes `/api/*`.
Retourne 401 si absent ou invalide.

### Dépendances

```json
{
  "imports": {
    "@casys/einvoice-core": "jsr:@casys/einvoice-core@^0.1.0",
    "hono": "npm:hono@^4",
    "@hono/zod-openapi": "npm:@hono/zod-openapi@^0.18",
    "@hono/swagger-ui": "npm:@hono/swagger-ui@^0.5",
    "zod": "npm:zod@^3"
  }
}
```

### Pattern de route

Chaque fichier de routes exporte des routes `@hono/zod-openapi`. Chaque route
déclare son schéma Zod (input + output) qui sert à la fois de validation
runtime ET de source pour l'OpenAPI spec.

```ts
import { createRoute, z } from "@hono/zod-openapi";

const searchInvoices = createRoute({
  method: "get",
  path: "/api/invoices",
  tags: ["Invoices"],
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: "Search query" }),
      direction: z.enum(["sent", "received"]).optional(),
      status: z.string().optional(),
      offset: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: "Invoice search results",
      content: { "application/json": { schema: SearchInvoicesResultSchema } },
    },
  },
});

// Handler: pass-through vers adapter
app.openapi(searchInvoices, async (c) => {
  const query = c.req.valid("query");
  const result = await adapter.searchInvoices(query);
  return c.json(result);
});
```

### Table de routes complète

#### Invoices

| Verbe | Path | Adapter method |
|-------|------|----------------|
| POST | `/api/invoices/emit` | `emitInvoice` |
| GET | `/api/invoices` | `searchInvoices` |
| GET | `/api/invoices/:id` | `getInvoice` |
| GET | `/api/invoices/:id/download` | `downloadInvoice` |
| GET | `/api/invoices/:id/readable` | `downloadReadable` |
| GET | `/api/invoices/:id/files` | `getInvoiceFiles` |
| GET | `/api/invoices/:id/attachments` | `getAttachments` |
| GET | `/api/files/:fileId/download` | `downloadFile` |
| POST | `/api/invoices/:id/mark-seen` | `markInvoiceSeen` |
| GET | `/api/invoices/unseen` | `getUnseenInvoices` |
| POST | `/api/invoices/generate/cii` | `generateCII` |
| POST | `/api/invoices/generate/ubl` | `generateUBL` |
| POST | `/api/invoices/generate/facturx` | `generateFacturX` |

#### Directory

| Verbe | Path | Adapter method |
|-------|------|----------------|
| GET | `/api/directory/fr` | `searchDirectoryFr` |
| GET | `/api/directory/int` | `searchDirectoryInt` |
| GET | `/api/directory/peppol/check` | `checkPeppolParticipant` |

#### Status

| Verbe | Path | Adapter method |
|-------|------|----------------|
| POST | `/api/invoices/:id/status` | `sendStatus` |
| GET | `/api/invoices/:id/status-history` | `getStatusHistory` |
| GET | `/api/statuses/unseen` | `getUnseenStatuses` |
| POST | `/api/statuses/:id/mark-seen` | `markStatusSeen` |

#### Reporting

| Verbe | Path | Adapter method |
|-------|------|----------------|
| POST | `/api/reporting/invoice-transaction` | `reportInvoiceTransaction` |
| POST | `/api/reporting/entities/:entityId/transaction` | `reportTransaction` |

#### Webhooks

| Verbe | Path | Adapter method |
|-------|------|----------------|
| GET | `/api/webhooks` | `listWebhooks` |
| GET | `/api/webhooks/:id` | `getWebhook` |
| POST | `/api/webhooks` | `createWebhook` |
| PUT | `/api/webhooks/:id` | `updateWebhook` |
| DELETE | `/api/webhooks/:id` | `deleteWebhook` |

#### Config & Entities

| Verbe | Path | Adapter method |
|-------|------|----------------|
| GET | `/api/config/customer-id` | `getCustomerId` |
| GET | `/api/entities` | `listBusinessEntities` |
| GET | `/api/entities/:id` | `getBusinessEntity` |
| POST | `/api/entities/legal-unit` | `createLegalUnit` |
| POST | `/api/entities/office` | `createOffice` |
| DELETE | `/api/entities/:id` | `deleteBusinessEntity` |
| PUT | `/api/entities/:id/configure` | `configureBusinessEntity` |
| POST | `/api/entities/:id/claim` | `claimBusinessEntity` |
| POST | `/api/entities/claim-by-identifier` | `claimBusinessEntityByIdentifier` |
| POST | `/api/entities/enroll/french` | `enrollFrench` |
| POST | `/api/entities/enroll/international` | `enrollInternational` |
| POST | `/api/identifiers/:identifierId/register-network` | `registerNetwork` |
| POST | `/api/identifiers/register-network-by-scheme` | `registerNetworkByScheme` |
| DELETE | `/api/identifiers/network/:directoryId` | `unregisterNetwork` |
| POST | `/api/entities/:entityId/identifiers` | `createIdentifier` |
| POST | `/api/identifiers/by-scheme` | `createIdentifierByScheme` |
| DELETE | `/api/identifiers/:identifierId` | `deleteIdentifier` |
| DELETE | `/api/entities/:entityId/claim` | `deleteClaim` |

### Endpoints utilitaires

| Verbe | Path | Description |
|-------|------|-------------|
| GET | `/openapi.json` | Spec OpenAPI 3.1 générée |
| GET | `/docs` | Swagger UI |
| GET | `/health` | Health check (+ test connexion adapter) |

## Root `deno.json`

```json
{
  "workspaces": ["packages/core", "packages/mcp", "packages/rest"],
  "tasks": {
    "test": "deno test --allow-all packages/",
    "test:core": "deno test --allow-all packages/core/",
    "test:mcp": "deno test --allow-all packages/mcp/",
    "test:rest": "deno test --allow-all packages/rest/",
    "mcp:serve": "deno run --allow-all packages/mcp/server.ts --http --port=3015",
    "rest:serve": "deno run --allow-all packages/rest/server.ts --port=3016"
  }
}
```

## Migration

### Etape 1 : Restructurer le repo

1. Renommer le repo GitHub `mcp-einvoice` → `einvoice`
2. Créer `packages/core/`, `packages/mcp/`, `packages/rest/`
3. Déplacer `src/adapter.ts` + `src/adapters/` → `packages/core/src/`
4. Déplacer `src/tools/` + `src/ui/` + `src/client.ts` +
   `src/generated-store.ts` + `server.ts` → `packages/mcp/`
5. Mettre à jour tous les imports :
   - `packages/mcp/` importe depuis `@casys/einvoice-core` au lieu de chemins
     relatifs vers `../adapter.ts`, `../adapters/`
6. Créer les 3 `deno.json` workspace + le root `deno.json`
7. Vérifier : `deno task test` passe

### Etape 2 : einvoice-rest

1. Scaffolder `packages/rest/` avec Hono + `@hono/zod-openapi`
2. Implémenter les routes par groupe (invoices, directory, status, etc.)
3. Ajouter middleware API key
4. Ajouter `/openapi.json` + `/docs` (Swagger UI)
5. Ajouter `/health`
6. Tests : routes avec mock adapter

### Etape 3 : CI/CD

1. Mettre à jour le workflow CI pour publier les 3 packages sur JSR
2. Publier `@casys/einvoice-core` en premier (dépendance des deux autres)
3. `@casys/mcp-einvoice` garde sa config npm (build:node) si nécessaire

## Tests

- **core** : tests unitaires adapters (existants, déplacés) + E2E adapters
  (Iopole, SuperPDP)
- **mcp** : tests unitaires tools (existants, déplacés) — utilisent
  `createMockAdapter()` importé depuis core
- **rest** : tests de routes Hono — mock adapter, vérifient requête HTTP →
  réponse JSON, codes HTTP, validation Zod, auth API key

## Décisions

- Le repo GitHub est renommé `einvoice` (pas `einvoice-monorepo`)
- `@casys/mcp-einvoice` garde son nom JSR/npm pour éviter les breaking changes
- L'API REST écoute sur port 3016 par défaut (MCP reste sur 3015)
- Pas de generated-store dans le REST — Dolibarr gère son propre workflow
  generate → emit directement via deux appels REST successifs
- Les routes REST retournent les réponses adapter brutes (JSON) — pas de
  formatting content/structuredContent
- Les api-specs OpenAPI des PDP restent dans core (référence pour les adapters)
