# @casys/mcp-einvoice

MCP server for e-invoicing — PA-agnostic via the adapter pattern.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  MCP Tools (39 tools, einvoice_*)                    │
│  invoice · directory · status · reporting            │
│  webhook · config                                    │
├──────────────────────────────────────────────────────┤
│  MCP Apps (5 viewers)                                │
│  invoice-viewer · doclist-viewer · action-result     │
│  status-timeline · directory-card                    │
├──────────────────────────────────────────────────────┤
│  EInvoiceAdapter (interface) + capabilities filter   │
│  PA-agnostic: emitInvoice, searchInvoices, ...       │
├──────────┬───────────┬───────────────────────────────┤
│  Iopole  │ Storecove │  Other adapters via interface │
│ (PDP FR) │(Peppol AP)│                               │
│ 39 tools │ 21 tools  │                               │
└──────────┴───────────┴───────────────────────────────┘
```

Chaque PA (Plateforme Agréée / Access Point) implémente `EInvoiceAdapter`. Les tools MCP appellent l'adapter, jamais l'API directement. Seuls les tools supportés par l'adaptateur actif sont exposés au LLM (filtrage par `capabilities`).

## Configuration

### Variables d'environnement

```bash
# Choix du provider (default: iopole)
EINVOICE_ADAPTER=iopole   # ou storecove

# ── Iopole (PDP française, B2B) ──
IOPOLE_API_URL=https://api.ppd.iopole.fr/v1      # sandbox
IOPOLE_CLIENT_ID=your-client-id
IOPOLE_CLIENT_SECRET=your-client-secret
IOPOLE_CUSTOMER_ID=your-customer-id               # required since 2026-02-01
# Optionnel — token endpoint Keycloak (default: production)
IOPOLE_AUTH_URL=https://auth.ppd.iopole.fr/realms/iopole/protocol/openid-connect/token

# ── Storecove (Peppol Access Point, international) ──
STORECOVE_API_URL=https://api.storecove.com/api/v2
STORECOVE_API_KEY=your-api-key
# Optionnel — default legal entity for submissions
STORECOVE_LEGAL_ENTITY_ID=12345
```

### MCP config (stdio mode)

**Iopole :**
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

**Storecove :**
```json
{
  "mcpServers": {
    "einvoice": {
      "command": "deno",
      "args": ["run", "--allow-all", "server.ts"],
      "env": {
        "EINVOICE_ADAPTER": "storecove",
        "STORECOVE_API_URL": "https://api.storecove.com/api/v2",
        "STORECOVE_API_KEY": "your-api-key"
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
- `--adapter=storecove` — override le provider (default: env `EINVOICE_ADAPTER` ou `iopole`)
- `--categories=invoice,status` — filtrer les catégories de tools

**Note** : en mode HTTP, le `generated-store` (flow generate → submit) est in-memory et single-instance. Ne pas déployer derrière un load-balancer sans sticky sessions.

## Tools (39)

| Catégorie | N | Tools | Description |
|-----------|---|-------|-------------|
| **invoice** | 11 | `submit`, `search`, `get`, `download`, `download_readable`, `files`, `attachments`, `download_file`, `generate_cii`, `generate_ubl`, `generate_facturx` | Soumission, recherche, téléchargement, génération CII/UBL/Factur-X |
| **directory** | 3 | `fr_search`, `int_search`, `peppol_check` | Annuaire PPF (France) + Peppol (international) |
| **status** | 2 | `send`, `history` | Cycle de vie facture (APPROVED, REFUSED, DISPUTED, PAYMENT_SENT...) |
| **reporting** | 2 | `invoice_transaction`, `transaction` | E-reporting DGFiP (B2C, international) |
| **webhook** | 5 | `list`, `get`, `create`, `update`, `delete` | Notifications temps réel |
| **config** | 16 | `customer_id`, `entities_list`, `entity_get`, `entity_create_legal`, `entity_create_office`, `enroll_fr`, `entity_claim`, `entity_delete`, `network_register`, `network_register_by_id`, `network_unregister`, `identifier_create`, `identifier_create_by_scheme`, `identifier_delete`, `entity_configure`, `claim_delete` | Entités, inscription, réseaux, identifiants |

Tous les noms sont préfixés `einvoice_<category>_` (ex: `einvoice_invoice_search`).

Chaque tool déclare ses `requires` (méthodes adapter nécessaires). Seuls les tools dont l'adaptateur supporte toutes les `requires` sont exposés au LLM.

### Couverture par adaptateur

| Catégorie | Iopole | Storecove |
|-----------|--------|-----------|
| invoice (11) | 11 | 3 (submit, get, download) |
| directory (3) | 3 | 3 |
| status (2) | 2 | 1 (history) |
| reporting (2) | 2 | 0 |
| webhook (5) | 5 | 2 (list, delete) |
| config (16) | 16 | 10 |
| **Total** | **39** | **~21** |

### Flow generate → preview → submit

1. **Generate** (`generate_cii`, `generate_ubl`, `generate_facturx`) : Génère le XML/PDF, stocke le fichier côté serveur, retourne un `generated_id` + preview pour le viewer
2. **Preview** : Le `invoice-viewer` affiche la facture avec un bouton "Déposer"
3. **Submit** (`submit`) : Accepte `generated_id` (consomme le fichier stocké) ou `file_base64` + `filename` direct

Les fichiers générés expirent après 10 minutes.

## MCP Apps (5 viewers)

| Viewer | Tools associés | Description |
|--------|---------------|-------------|
| **invoice-viewer** | `get`, `generate_*` | Facture détaillée avec actions (accepter, rejeter, contester, télécharger, déposer) |
| **doclist-viewer** | `search`, `fr_search`, `int_search`, `webhook_list`, `entities_list` | Table générique avec drill-down (clic → appel tool) |
| **status-timeline** | `history` | Timeline verticale des changements de statut |
| **directory-card** | `entity_get` | Fiche entreprise avec SIREN/SIRET, réseaux, détails |
| **action-result** | `enroll_fr`, `network_register`, etc. | Résultat d'action avec feedback visuel |

Build des viewers :

```bash
cd src/ui && node build-all.mjs
```

## Ajouter un adapter

1. Créer `src/adapters/<name>/adapter.ts` implémentant `EInvoiceAdapter`
2. Déclarer les `capabilities` (méthodes supportées)
3. Ajouter le client HTTP dans `client.ts`
4. Exporter dans `src/adapters/mod.ts`
5. Ajouter le case dans `server.ts` → `createAdapter()`
6. Ajouter les API specs dans `api-specs/` et un `README.md`

```typescript
import type { EInvoiceAdapter } from "../../adapter.ts";

export class MyAdapter implements EInvoiceAdapter {
  readonly name = "my-adapter";
  readonly capabilities = new Set([
    "emitInvoice", "getInvoice", "searchDirectoryFr",
    // ... only methods this adapter actually supports
  ]);
  // Implement all 43 interface methods
  // Supported methods → real API calls
  // Unsupported methods → throw NotSupportedError with alternative
}
```

L'interface `EInvoiceAdapter` est définie dans `src/adapter.ts` — 43 méthodes couvrant factures, annuaire, statuts, reporting, webhooks et configuration opérateur. Voir `src/adapters/README.md` pour le guide détaillé.

## Structure

```
├── deno.json              # Package @casys/mcp-einvoice
├── mod.ts                 # Public API
├── server.ts              # MCP server (stdio + HTTP)
├── .env.example           # Template variables (iopole + storecove + superpdp)
└── src/
    ├── adapter.ts         # EInvoiceAdapter interface (43 methods + capabilities)
    ├── generated-store.ts # Temp file store (generate → submit flow)
    ├── client.ts          # EInvoiceToolsClient (tools registry + capability filtering)
    ├── adapters/
    │   ├── mod.ts         # Adapter exports
    │   ├── README.md      # Guide: adding new adapters
    │   ├── afnor/         # Shared AFNOR XP Z12-013 socle
    │   │   ├── base-adapter.ts  # AfnorBaseAdapter (abstract)
    │   │   └── client.ts  # AfnorClient (3 flow endpoints)
    │   ├── shared/        # Shared utilities
    │   │   └── oauth2.ts  # OAuth2 token provider
    │   ├── iopole/        # Iopole PA (French B2B) — extends AfnorBaseAdapter
    │   │   ├── adapter.ts
    │   │   ├── client.ts  # HTTP + OAuth2
    │   │   └── api-specs/ # 6 OpenAPI JSON specs
    │   ├── storecove/     # Storecove Peppol AP — implements EInvoiceAdapter
    │   │   ├── adapter.ts
    │   │   ├── client.ts  # HTTP + API key
    │   │   └── api-specs/ # OpenAPI Swagger 2.0 spec
    │   └── superpdp/      # Super PDP PA — extends AfnorBaseAdapter
    │       ├── adapter.ts # AFNOR (reporting) + native (rest)
    │       ├── client.ts  # HTTP + OAuth2
    │       └── api-specs/ # Native + AFNOR OpenAPI specs
    ├── runtime.ts         # Deno runtime (env vars)
    ├── runtime.node.ts    # Node.js runtime
    ├── tools/
    │   ├── types.ts       # EInvoiceTool + requires
    │   ├── mod.ts         # Registry (39 tools)
    │   ├── invoice.ts     # 11 tools
    │   ├── directory.ts   # 3 tools
    │   ├── status.ts      # 2 tools
    │   ├── reporting.ts   # 2 tools
    │   ├── webhook.ts     # 5 tools
    │   └── config.ts      # 16 tools
    ├── testing/
    │   └── helpers.ts     # Mock fetch, mock adapter
    └── ui/
        ├── build-all.mjs
        ├── shared/          # Theme, brand, refresh
        ├── invoice-viewer/
        ├── doclist-viewer/
        ├── status-timeline/
        ├── directory-card/
        └── action-result/
```

## Adapters

| Adapter | Scope | Auth | Base | Status |
|---------|-------|------|------|--------|
| **Iopole** | PA française (B2B) | OAuth2 | AfnorBaseAdapter | 39/39 tools |
| **Storecove** | Peppol AP (40+ pays) | API key | EInvoiceAdapter | 21/39 tools |
| **Super PDP** | PA française (B2B) | OAuth2 | AfnorBaseAdapter | 22/39 tools |
