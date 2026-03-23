# mcp-einvoice

Serveur MCP pour la facturation électronique — agnostique plateforme via le
pattern adapter.

<p align="center">
  <img src="docs/logos/iopole.svg" alt="Iopole" height="40">&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/logos/storecove.png" alt="Storecove" height="40">&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/logos/superpdp.svg" alt="Super PDP" height="40">
</p>

## Pourquoi

La réforme de la facturation électronique en France (sept. 2026) impose
l'utilisation de Plateformes Agréées (PA). Il en existe 106+, chacune avec sa
propre API. Ce serveur MCP expose **une interface unique** pour toutes, avec 39
tools et 6 viewers interactifs.

## Adapters

|                                                  | Adapter       | Scope               | Tools | Base             |
| ------------------------------------------------ | ------------- | ------------------- | ----- | ---------------- |
| <img src="docs/logos/iopole.svg" height="16">    | **Iopole**    | PA française, B2B   | 39/39 | BaseAdapter      |
| <img src="docs/logos/storecove.png" height="16"> | **Storecove** | Peppol AP, 40+ pays | 19/39 | BaseAdapter      |
| <img src="docs/logos/superpdp.svg" height="16">  | **Super PDP** | PA française, B2B   | 20/39 | AfnorBaseAdapter |

`BaseAdapter` fournit des stubs `NotSupportedError` pour les 45 méthodes de
l'interface `EInvoiceAdapter`. Les PA françaises avec AFNOR héritent
d'`AfnorBaseAdapter` (socle
[AFNOR XP Z12-013](https://norminfo.afnor.org/norme/pr-xp-a00-002/standardisation-api-odpdp/211970))
qui ajoute les opérations flow. Les autres étendent `BaseAdapter` directement.

Le filtrage par `capabilities` assure que le LLM ne voit que les tools supportés
par l'adapter actif.

## Configuration rapide

```bash
cp .env.example .env
# Remplir les variables de l'adapter choisi, puis :
deno task serve          # HTTP mode (port 3015)
```

### MCP config (Claude Desktop / stdio)

```json
{
  "mcpServers": {
    "einvoice": {
      "command": "deno",
      "args": ["run", "--allow-all", "server.ts"],
      "env": {
        "EINVOICE_ADAPTER": "iopole",
        "IOPOLE_API_URL": "https://api.ppd.iopole.fr/v1",
        "IOPOLE_CLIENT_ID": "...",
        "IOPOLE_CLIENT_SECRET": "...",
        "IOPOLE_CUSTOMER_ID": "..."
      }
    }
  }
}
```

Remplacer `EINVOICE_ADAPTER` par `storecove` ou `superpdp` avec les variables
correspondantes (voir `.env.example`).

### Options serveur

```
--http                   Mode HTTP (default: stdio)
--port=3015              Port HTTP
--hostname=localhost     Bind address (default: localhost)
--adapter=iopole         Override adapter (default: env EINVOICE_ADAPTER)
--categories=invoice     Filtrer les catégories de tools
```

## Architecture

```
┌───────────────────────────────────────────────┐
│  39 MCP Tools (einvoice_*)                    │
│  invoice · directory · status · reporting     │
│  webhook · config                             │
├───────────────────────────────────────────────┤
│  6 MCP Apps (viewers React)                   │
│  invoice · doclist · timeline · card ·        │
│  directory-list · action                      │
├───────────────────────────────────────────────┤
│  EInvoiceAdapter (interface, 45 methods)      │
│  + capabilities → filtrage tools dynamique    │
├──────────┬────────────────────────────────────┤
│ BaseAdapter (abstract, NotSupported stubs)    │
├──────────┼────────────────────────────────────┤
│ AfnorBase│ Direct                             │
│ (AFNOR)  │                                    │
│ ┌──────┐ │ ┌─────────┐  ┌───────────┐        │
│ │ SPDP │ │ │ Iopole  │  │ Storecove │        │
│ └──────┘ │ └─────────┘  └───────────┘        │
└──────────┴────────────────────────────────────┘
```

## Tools

| Catégorie         | Tools                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **invoice** (11)  | submit, search, get, download, download_readable, files, attachments, download_file, generate_cii, generate_ubl, generate_facturx                                                                                                                                                          |
| **directory** (3) | fr_search, int_search, peppol_check                                                                                                                                                                                                                                                        |
| **status** (2)    | send, history                                                                                                                                                                                                                                                                              |
| **reporting** (2) | invoice_transaction, transaction                                                                                                                                                                                                                                                           |
| **webhook** (5)   | list, get, create, update, delete                                                                                                                                                                                                                                                          |
| **config** (16)   | customer_id, entities_list, entity_get, entity_create_legal, entity_create_office, enroll_fr, entity_claim, entity_delete, network_register, network_register_by_id, network_unregister, identifier_create, identifier_create_by_scheme, identifier_delete, entity_configure, claim_delete |

Tous préfixés `einvoice_<category>_`. Chaque tool déclare ses `requires` — seuls
ceux supportés par l'adapter actif sont exposés au LLM.

### Flow generate → preview → submit

1. `generate_*` → stocke le fichier, retourne `generated_id` + preview viewer
2. Le viewer affiche la facture avec bouton "Déposer"
3. `submit` consomme le `generated_id` (ou accepte `file_base64` direct)

## Viewers (MCP Apps)

| Viewer              | Usage                                                      |
| ------------------- | ---------------------------------------------------------- |
| **invoice-viewer**  | Facture détaillée + actions (accepter, rejeter, déposer)   |
| **doclist-viewer**  | Table avec drill-down, recherche, filtres direction/statut |
| **status-timeline** | Timeline verticale des changements de statut               |
| **directory-card**  | Fiche entreprise (SIREN/SIRET, réseaux)                    |
| **directory-list**  | Résultats annuaire — cartes avec expand, recherche client  |
| **action-result**   | Feedback visuel d'action (enroll, register)                |

```bash
cd src/ui && node build-all.mjs   # Rebuild après modification TSX
```

## Ajouter un adapter

**PA française avec AFNOR** → `extends AfnorBaseAdapter` (socle AFNOR gratuit,
override le natif) :

```typescript
export class MyPAAdapter extends AfnorBaseAdapter {
  readonly name = "my-pa";
  readonly capabilities = new Set(["emitInvoice", "searchInvoices", ...]);
  private client: MyPAClient;

  constructor(client: MyPAClient, afnor: AfnorClient | null) {
    super(afnor);  // ou super(null) si pas encore d'AFNOR
    this.client = client;
  }

  override async generateCII(req) { return this.client.convert(req); }
  // ... override les extras, hériter le reste
}
```

**PA française sans AFNOR** → `extends BaseAdapter` (override toutes les
méthodes avec l'API native, comme Iopole).

**Plateforme non-française** → `extends BaseAdapter` directement (comme
Storecove).

Guide complet : `src/adapters/README.md`.

## Structure

```
server.ts                    # MCP server (stdio + HTTP)
src/
├── adapter.ts               # EInvoiceAdapter (45 methods + capabilities)
├── client.ts                # Tools registry + capability filtering
├── adapters/
│   ├── base-adapter.ts      # BaseAdapter (abstract, NotSupported stubs)
│   ├── afnor/               # Socle AFNOR XP Z12-013 (shared)
│   │   ├── base-adapter.ts  # AfnorBaseAdapter (extends BaseAdapter)
│   │   └── client.ts        # AfnorClient (3 flow endpoints)
│   ├── shared/oauth2.ts     # OAuth2 token provider (shared)
│   ├── iopole/              # PA française — extends BaseAdapter
│   ├── storecove/           # Peppol AP — extends BaseAdapter
│   └── superpdp/            # PA française — extends AfnorBaseAdapter
├── tools/                   # 39 tools (6 catégories)
└── ui/                      # 6 viewers React (single-file HTML)
```
