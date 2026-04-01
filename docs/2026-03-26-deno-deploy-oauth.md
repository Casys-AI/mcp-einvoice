# 2026-03-26 — Deno Deploy + OAuth2 pour MCP

## Resultat

**OAuth2 avec Claude.ai : IMPLEMENTE ET FONCTIONNE** (desktop + mobile)
- Static client registration (pas DCR)
- CIMD (Client ID Metadata Documents) a venir dans la spec MCP — remplacera DCR

## Ce qui a ete fait

### 1. Deno Deploy support (v0.1.6 — pushed)
- Auto-detection runtime via `DENO_DEPLOYMENT_ID`
- Port via `PORT` env var, hostname `0.0.0.0`
- Zero impact sur stdio/HTTP local/npm
- App : `https://mcp-einvoice.casys.deno.net`
- Console : `https://console.deno.com/casys/mcp-einvoice`
- Deploy CLI : `deno deploy --app=mcp-einvoice --prod` (pas `deployctl`)

### 2. Auth0 OAuth2 (COMPLET)

#### Config tenant
- Tenant : `casys.eu.auth0.com`
- Resource Parameter Compatibility Profile : ACTIVE
- Connections promues en domain-level : `Username-Password-Authentication` + `google-oauth2`

#### API
- Identifier : `https://mcp-einvoice.casys.deno.net/` (AVEC trailing slash)
- Signing : RS256
- Token dialect : `rfc9068_profile_authz` (set via CLI, dashboard met `rfc9068_profile`)
- ID : `69c4aef07304a4399cd5c21e`

#### Client Claude.ai
- Name : Claude.ai
- Type : regular_web, is_first_party: false
- client_id : `dQS2fwaTGZBCnnz7aDKZH3ILWoC8ltVo`
- callback : `https://claude.ai/api/mcp/auth_callback`
- grant_types : authorization_code
- token_endpoint_auth_method : client_secret_post

#### Env vars Deno Deploy
- `MCP_AUTH_PROVIDER=auth0`
- `MCP_AUTH_DOMAIN=casys.eu.auth0.com`
- `MCP_AUTH_AUDIENCE=https://mcp-einvoice.casys.deno.net/`
- `MCP_AUTH_RESOURCE=https://mcp-einvoice.casys.deno.net/`

#### Pas implemente
- **DCR** (Dynamic Client Registration) : pas necessaire, static registration suffit
- **CIMD** (Client ID Metadata Documents) : futur standard MCP, Auth0 le supportera
- **Scopes per-tool** : pas de RBAC pour le moment, tous les outils accessibles

### 3. Claude.ai integration — FONCTIONNE
- URL dans Claude.ai : `https://mcp-einvoice.casys.deno.net` (sans /mcp, sans trailing slash)
- client_id/secret dans Advanced settings
- Flow OAuth complet : Claude.ai > Auth0 login > token > 39 tools loaded
- Fonctionne desktop + mobile

### 4. Skill cree
- `~/.claude/skills/auth0-mcp/` — guide Auth0 pour MCP, reutilisable

## Pieges rencontres

| Piege | Solution |
|---|---|
| `deployctl` = Deploy Classic (deprecated) | Utiliser `deno deploy` (built-in Deno CLI) |
| Token perso vs org Deno Deploy | `ddp_` = personal (CLI), `ddo_` = org (CLI ne marche pas) |
| Auth0 dashboard "RFC 9068" = `rfc9068_profile` | CLI : `auth0 api patch` avec `rfc9068_profile_authz` |
| Claude.ai callback URL | `https://claude.ai/api/mcp/auth_callback` |
| Trailing slash dans resource/audience | Claude.ai ajoute `/` — API Auth0 doit matcher |
| CORS WWW-Authenticate | Pas bloquant — Claude.ai fetch metadata proactivement |
| Connections Auth0 | Doivent etre domain-level pour clients tiers |

## Issue ouverte — Scroll horizontal mobile

### Probleme
Le scroll horizontal des tableaux dans les viewers MCP Apps est au "compte-goutte" dans l'app Claude.ai mobile (Android). Fonctionne normalement dans le navigateur mobile (Chrome).

### Cause
Le WebView de l'app Claude.ai Android gere differemment le scroll overflow des iframes par rapport a Chrome natif. C'est une limitation cote app, pas cote CSS.

### Ce qu'on a teste (rien ne fonctionne)
- CSS : overflowX auto/scroll, touch-action, overscroll-behavior, overflow clip, scroll-snap
- JS : touch handler avec translateX, amplificateur de delta
- Combinaisons multiples de toutes ces approches

### Ce qu'on a appris
- Les exemples officiels MCP Apps evitent TOUS le scroll horizontal
- Excalidraw/Canva utilisent le mode fullscreen pour les interactions tactiles
- Claude.ai utilise `scroll-snap-type: x mandatory` pour ses sliders internes
- Le scroll-snap ne fonctionne pas avec `<table>`, il faut un layout div/flex
- Le WebView de l'app Claude.ai en production n'expose pas le debug (pas de chrome://inspect)

### Pistes pour la suite
1. **Refactor div/flex + scroll-snap** : remplacer `<table>` par un layout flex avec `scroll-snap-type: x mandatory` sur mobile
2. **Layout responsive** : cartes empilees sur mobile, pas de scroll horizontal
3. **hostContext** : utiliser `platform: "mobile"` et `containerDimensions` pour adapter le layout
4. **Issue ext-apps** : signaler le comportement WebView scroll sur le repo MCP Apps

## Etat de la prod

- **Auth** : ACTIVE (OAuth2 via Auth0)
- **Version** : 0.1.6 (pushed)
- **Mobile scroll fixes** : en cours, pas pushes
- **Viewers modifies non commites** : DoclistViewer.tsx, InvoiceViewer.tsx, theme.ts, global.css
