# @casys/mcp-einvoice

MCP server for French e-invoicing — PA-agnostic via the adapter pattern.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  MCP Tools (27 tools, einvoice_*)                │
│  invoice · directory · status · reporting · webhook │
├──────────────────────────────────────────────────┤
│  MCP Apps (4 viewers)                            │
│  invoice-viewer · doclist-viewer                 │
│  status-timeline · directory-card                │
├──────────────────────────────────────────────────┤
│  EInvoiceAdapter (interface)                     │
│  PA-agnostic: emitInvoice, searchInvoices, ...   │
├──────────┬───────────────────────────────────────┤
│  Iopole  │  Autres PA via EInvoiceAdapter        │
│ (REST)   │  (ajout sans toucher aux tools)       │
└──────────┴───────────────────────────────────────┘
```

Chaque PA (Plateforme Agréée) implémente `EInvoiceAdapter`. Les tools MCP appellent l'adapter, jamais l'API directement.

## Configuration

### Variables d'environnement

```bash
# Choix du provider (default: iopole)
EINVOICE_ADAPTER=iopole

# Config Iopole — OAuth2 client credentials
IOPOLE_API_URL=https://api.ppd.iopole.fr/v1      # sandbox
IOPOLE_CLIENT_ID=your-client-id
IOPOLE_CLIENT_SECRET=your-client-secret
IOPOLE_CUSTOMER_ID=your-customer-id               # required since 2026-02-01

# Optionnel — token endpoint Keycloak (default: production)
# Sandbox : https://auth.ppd.iopole.fr/realms/iopole/protocol/openid-connect/token
IOPOLE_AUTH_URL=https://auth.iopole.com/realms/iopole/protocol/openid-connect/token

# Sécurité (optionnel — mode HTTP du serveur MCP)
MCP_AUTH_PROVIDER=oidc
MCP_AUTH_ISSUER=https://auth.example.com
MCP_AUTH_AUDIENCE=mcp-einvoice
MCP_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
```

### MCP config (stdio mode)

```json
{
  "mcpServers": {
    "einvoice": {
      "command": "deno",
      "args": ["run", "--allow-all", "server.ts"],
      "env": {
        "EINVOICE_ADAPTER": "iopole",
        "IOPOLE_API_URL": "https://api.ppd.iopole.fr/v1",
        "IOPOLE_CLIENT_ID": "your-client-id",
        "IOPOLE_CLIENT_SECRET": "your-client-secret",
        "IOPOLE_CUSTOMER_ID": "your-customer-id"
      }
    }
  }
}
```

### HTTP mode

```bash
deno run --allow-all server.ts --http --port=3015
```

Options :
- `--http` — mode HTTP (default: stdio)
- `--port=3015` — port HTTP (default: 3015)
- `--hostname=0.0.0.0` — hostname (default: 0.0.0.0)
- `--adapter=iopole` — override le provider (default: env `EINVOICE_ADAPTER` ou `iopole`)
- `--categories=invoice,status` — filtrer les catégories de tools

**Note** : en mode HTTP, le `generated-store` (flow generate → emit) est in-memory et single-instance. Ne pas déployer derrière un load-balancer sans sticky sessions.

## Tools (27)

| Catégorie | N | Tools | Description |
|-----------|---|-------|-------------|
| **invoice** | 13 | `emit`, `search`, `get`, `download`, `download_readable`, `files`, `attachments`, `download_file`, `mark_seen`, `not_seen`, `generate_cii`, `generate_ubl`, `generate_facturx` | Émission, recherche, téléchargement, génération CII/UBL/Factur-X |
| **directory** | 3 | `fr_search`, `int_search`, `peppol_check` | Annuaire PPF (France) + Peppol (international) |
| **status** | 4 | `send`, `history`, `not_seen`, `mark_seen` | Cycle de vie facture (APPROVED, REFUSED, DISPUTED, PAYMENT_SENT...) |
| **reporting** | 2 | `invoice_transaction`, `transaction` | E-reporting DGFiP (B2C, international) |
| **webhook** | 5 | `list`, `get`, `create`, `update`, `delete` | Notifications temps réel |

Tous les noms de tools sont préfixés `einvoice_<category>_` (ex: `einvoice_invoice_search`).

### Flow generate → preview → emit

1. **Generate** (`generate_cii`, `generate_ubl`, `generate_facturx`) : Génère le XML/PDF, stocke le fichier côté serveur, retourne un `generated_id` + preview pour le viewer
2. **Preview** : Le `invoice-viewer` affiche la facture avec un bouton "Déposer"
3. **Emit** (`emit`) : Accepte `generated_id` (consomme le fichier stocké) ou `file_base64` + `filename` direct

Les fichiers générés expirent après 10 minutes.

## MCP Apps (4 viewers)

| Viewer | Tools associés | Description |
|--------|---------------|-------------|
| **invoice-viewer** | `get`, `generate_*` | Facture détaillée avec actions (accepter, rejeter, contester, marquer lu, télécharger, déposer) |
| **doclist-viewer** | `search`, `not_seen`, `fr_search`, `int_search`, `webhook_list` | Table générique avec drill-down (clic → appel tool) |
| **status-timeline** | `history` | Timeline verticale des changements de statut |
| **directory-card** | `fr_search` (single result) | Fiche entreprise avec SIREN/SIRET, réseaux, détails |

Build des viewers :

```bash
cd src/ui && node build-all.mjs
```

## Utilisation directe de l'adapter

```typescript
import { createIopoleAdapter } from "@casys/mcp-einvoice";

const adapter = createIopoleAdapter();

// Rechercher des factures (Lucene syntax)
const results = await adapter.searchInvoices({
  q: 'status:accepted AND direction:received',
  expand: "businessData",
  offset: 0,
  limit: 20,
});

// Envoyer un statut
await adapter.sendStatus({
  invoiceId: "uuid-de-la-facture",
  code: "APPROVED",
  message: "Facture validée",
});

// Chercher dans l'annuaire PPF
const company = await adapter.searchDirectoryFr({
  q: 'siret:"43446637100011"',
});

// Générer une facture CII
const xml = await adapter.generateCII({
  invoice: { invoiceId: "F-001", seller: { ... }, buyer: { ... }, ... },
  flavor: "EN16931",
});
```

## Ajouter un adapter (nouveau PA)

1. Créer `src/adapters/my-pa.ts` implémentant `EInvoiceAdapter`
2. Ajouter le case dans `server.ts` → `createAdapter()`

```typescript
import type { EInvoiceAdapter } from "../adapter.ts";

export class MyPAAdapter implements EInvoiceAdapter {
  readonly name = "my-pa";
  // Implémenter les 27 méthodes de l'interface
}
```

L'interface `EInvoiceAdapter` est définie dans `src/adapter.ts` — 27 méthodes couvrant factures, annuaire, statuts, reporting et webhooks.

## Node.js

Build single-file CLI via esbuild :

```bash
./scripts/build-node.sh
# Produit dist-node/bin/mcp-einvoice.mjs (~1.3MB)
```

Le script swap `runtime.ts` par `runtime.node.ts` et strip les extensions `.ts` des imports.

## Structure

```
├── deno.json              # Package @casys/mcp-einvoice
├── mod.ts                 # Public API
├── server.ts              # MCP server (stdio + HTTP)
├── scripts/
│   └── build-node.sh      # esbuild single-file build
└── src/
    ├── adapter.ts         # EInvoiceAdapter interface (26 méthodes)
    ├── generated-store.ts # Temp file store (generate → emit flow)
    ├── adapters/
    │   └── iopole.ts      # IopoleAdapter
    ├── api/
    │   └── iopole-client.ts  # HTTP client + OAuth2 token provider
    ├── runtime.ts         # Deno runtime (env vars)
    ├── runtime.node.ts    # Node.js runtime
    ├── tools/
    │   ├── types.ts       # EInvoiceTool, EInvoiceToolContext
    │   ├── mod.ts         # Registry (27 tools)
    │   ├── invoice.ts     # 13 tools
    │   ├── directory.ts   # 3 tools
    │   ├── status.ts      # 4 tools
    │   ├── reporting.ts   # 2 tools
    │   └── webhook.ts     # 5 tools
    ├── testing/
    │   └── helpers.ts     # Mock fetch, mock adapter
    └── ui/
        ├── build-all.mjs
        ├── shared/          # Theme, brand, refresh
        ├── invoice-viewer/  # Viewer facture interactif
        ├── doclist-viewer/  # Table générique drill-down
        ├── status-timeline/ # Timeline verticale statuts
        └── directory-card/  # Fiche entreprise
```

## Iopole API

- Production : `https://api.iopole.com/v1`
- Sandbox : `https://api.ppd.iopole.fr/v1`
- Search : `https://api.ppd.iopole.fr/v1.1/invoice/search` (version v1.1)
- Auth : OAuth2 `client_credentials` (token TTL 10 min, auto-refresh 60s avant expiry)
- Token endpoint : `https://auth.iopole.com/realms/iopole/protocol/openid-connect/token`
- Header `customer-id` obligatoire sur toutes les requêtes (depuis 2026-02-01)
