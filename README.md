# mcp-einvoice

[![@casys/mcp-einvoice](https://img.shields.io/npm/v/@casys/mcp-einvoice?label=mcp-einvoice&color=4f46e5)](https://jsr.io/@casys/mcp-einvoice) [![JSR](https://jsr.io/badges/@casys/mcp-einvoice)](https://jsr.io/@casys/mcp-einvoice)

Serveur MCP pour la facturation électronique en France. Une interface unique
pour toutes les plateformes agréées (PA), utilisable par n'importe quel agent IA.

<p align="center">
  <a href="https://www.iopole.com/contact?utm_medium=affiliate&utm_source=thenocodeguy&utm_campaign=erwan%20lee%20pesle"><img src="docs/logos/iopole.svg" alt="Iopole" height="40"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.storecove.com/"><img src="docs/logos/storecove.png" alt="Storecove" height="40"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.superpdp.tech/"><img src="docs/logos/superpdp.svg" alt="Super PDP" height="40"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://portail.chorus-pro.gouv.fr/"><img src="docs/logos/choruspro.svg" alt="Chorus Pro" height="40"></a>
</p>

## Le problème

La réforme de la facturation électronique en France (sept. 2026) impose le
passage par une Plateforme Agréée. Il en existe 106+, chacune avec sa propre
API. Intégrer une PA, c'est des semaines de travail. En changer, c'est repartir
de zéro.

**mcp-einvoice** résout ça : un serveur MCP avec 39 tools et 6 viewers qui
marchent avec n'importe quelle PA, grâce au pattern adapter.

## Démarrage rapide

```bash
# 1. Cloner et configurer
git clone https://github.com/Casys-AI/mcp-einvoice.git
cd mcp-einvoice
cp .env.example .env
# Remplir les credentials de votre PA (voir "Obtenir un compte sandbox")

# 2. Lancer
deno task mcp:serve     # Mode HTTP sur localhost:3015
```

### Connecter à Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "einvoice": {
      "command": "deno",
      "args": ["run", "--allow-all", "packages/mcp/server.ts"],
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

## Plateformes supportées

|                                                  | Plateforme    | Couverture          | Tools | 
| ------------------------------------------------ | ------------- | ------------------- | ----- |
| <img src="docs/logos/iopole.svg" height="16">    | **[Iopole](https://www.iopole.com/contact?utm_medium=affiliate&utm_source=thenocodeguy&utm_campaign=erwan%20lee%20pesle)**    | PA française, B2B   | 39/39 |
| <img src="docs/logos/storecove.png" height="16"> | **[Storecove](https://www.storecove.com/)** | Peppol, 40+ pays | 19/39 |
| <img src="docs/logos/superpdp.svg" height="16">  | **[Super PDP](https://www.superpdp.tech/)** | PA française, B2B   | 20/39 |
| <img src="docs/logos/choruspro.svg" height="16"> | **[Chorus Pro](https://portail.chorus-pro.gouv.fr/)** | PPF, secteur public | 6/39  |

Seuls les tools supportés par la plateforme active sont exposés à l'agent.
[Ajouter une plateforme →](#ajouter-une-plateforme)

## Obtenir un compte sandbox

- **[Iopole](https://www.iopole.com/contact?utm_medium=affiliate&utm_source=thenocodeguy&utm_campaign=erwan%20lee%20pesle)** —
  couverture complète (39/39 tools), idéal pour démarrer.
  [Demander un accès sandbox →](https://www.iopole.com/contact?utm_medium=affiliate&utm_source=thenocodeguy&utm_campaign=erwan%20lee%20pesle)
- **[Storecove](https://www.storecove.com/)** — réseau Peppol international
- **[Super PDP](https://www.superpdp.tech/)** — PA française, socle AFNOR
- **[Chorus Pro](https://portail.chorus-pro.gouv.fr/)** — PPF gouvernemental,
  secteur public. Nécessite un compte PISTE + un compte technique Chorus Pro

## Ce qu'on peut faire

### 39 tools

| Catégorie | Exemples |
|-----------|----------|
| **Factures** (11) | Rechercher, consulter, soumettre, télécharger, générer (CII/UBL/Factur-X) |
| **Annuaire** (3) | Recherche FR (SIRET/SIREN), recherche internationale, vérification Peppol |
| **Statuts** (2) | Historique de cycle de vie, envoi de statut (accepter, refuser, payer) |
| **Reporting** (2) | Déclaration de transactions e-reporting |
| **Webhooks** (5) | CRUD complet sur les webhooks |
| **Configuration** (16) | Gestion des entités, identifiants, réseaux, enrollment |

### 6 viewers interactifs

| Viewer | Usage |
|--------|-------|
| **invoice-viewer** | Facture détaillée + actions (accepter, rejeter, déposer) |
| **doclist-viewer** | Table avec drill-down, filtres direction/statut |
| **status-timeline** | Timeline verticale des changements de statut |
| **directory-card** | Fiche entreprise (SIREN/SIRET, réseaux) |
| **directory-list** | Résultats annuaire avec recherche client |
| **action-result** | Feedback visuel d'action |

### Workflow facture

1. `generate_*` → prévisualise la facture dans le viewer
2. Vérification visuelle + bouton "Déposer"
3. `submit` → envoi à la plateforme

## REST API

```bash
deno task rest:serve     # Port 3016
```

- Swagger UI sur `http://localhost:3016/docs`
- Auth via `X-API-Key` (env `EINVOICE_REST_API_KEY`, `--no-auth` en dev)
- Même couche adapter que le serveur MCP

## Packages

Monorepo Deno avec 3 packages, publiés sur [JSR](https://jsr.io/@casys) et [npm](https://www.npmjs.com/org/casys) :

| Package | Rôle |
|---------|------|
| [`@casys/einvoice-core`](packages/core/) | Adapters, types, utils partagés |
| [`@casys/mcp-einvoice`](packages/mcp/) | Serveur MCP — tools + viewers |
| [`@casys/einvoice-rest`](packages/rest/) | REST API Hono |

```bash
# Deno / JSR
deno add jsr:@casys/mcp-einvoice

# Node / npm
npm install @casys/mcp-einvoice
```

## Commandes

```bash
deno task mcp:serve      # MCP HTTP (port 3015)
deno task rest:serve     # REST API (port 3016)
deno task test           # Tous les tests
deno task inspect        # MCP Inspector
```

Options serveur : `--http`, `--port=N`, `--adapter=name`, `--categories=csv`

## Ajouter une plateforme

Un template, un contrat de test, et un guide sont fournis pour intégrer une
nouvelle PA :

```bash
cp -r packages/core/src/adapters/template/ packages/core/src/adapters/ma-pa/
# Implémenter client.ts + adapter.ts, puis valider :
deno test  # runAdapterContract() vérifie les shapes automatiquement
```

| Cas | Classe de base | Exemple |
|-----|----------------|---------|
| PA française avec AFNOR | `AfnorBaseAdapter` | SuperPDP |
| PA française sans AFNOR | `BaseAdapter` | Iopole |
| PPF gouvernemental | `BaseAdapter` | Chorus Pro |
| Plateforme non-française | `BaseAdapter` | Storecove |

Guide complet : [`packages/core/src/adapters/GUIDE.md`](packages/core/src/adapters/GUIDE.md)
