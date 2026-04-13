# Chorus Pro Adapter

Adapter pour le **Portail Public de Facturation** (PPF) du gouvernement français.

Chorus Pro n'est pas un PDP — c'est la plateforme centrale de l'État pour la
facturation électronique du secteur public.

## Configuration

| Variable | Requis | Description |
|----------|--------|-------------|
| `CHORUSPRO_API_URL` | Oui | Base URL de l'API (`https://sandbox-api.piste.gouv.fr/cpro` ou `https://api.piste.gouv.fr/cpro`) |
| `CHORUSPRO_CLIENT_ID` | Oui | Client ID OAuth2 (plateforme PISTE) |
| `CHORUSPRO_CLIENT_SECRET` | Oui | Client secret OAuth2 (plateforme PISTE) |
| `CHORUSPRO_LOGIN` | Oui | Login du compte technique Chorus Pro (`TECH_1_xxxxx@cpro.fr`) |
| `CHORUSPRO_PASSWORD` | Oui | Mot de passe du compte technique |
| `CHORUSPRO_AUTH_URL` | Non | Token endpoint (défaut: sandbox PISTE) |

### Environnements

| Env | API | OAuth |
|-----|-----|-------|
| Sandbox | `https://sandbox-api.piste.gouv.fr/cpro` | `https://sandbox-oauth.piste.gouv.fr/api/oauth/token` |
| Production | `https://api.piste.gouv.fr/cpro` | `https://oauth.piste.gouv.fr/api/oauth/token` |

## Capabilities (6/39 tools)

| Tool MCP | Méthode adapter | Endpoint Chorus Pro |
|----------|----------------|---------------------|
| `einvoice_invoice_search` | `searchInvoices` | `POST /factures/v1/rechercher/fournisseur` |
| `einvoice_invoice_get` | `getInvoice` | `POST /factures/v1/consulter/fournisseur` |
| `einvoice_invoice_submit` | `emitInvoice` | `POST /transverses/v1/ajouter/fichier` + `POST /factures/v1/soumettre` |
| `einvoice_directory_fr_search` | `searchDirectoryFr` | `POST /structures/v1/rechercher` |
| `einvoice_config_entities_list` | `listBusinessEntities` | `POST /utilisateurs/v1/monCompte/recuperer/rattachements` |
| `einvoice_config_entity_get` | `getBusinessEntity` | `POST /structures/v1/consulter` |

## Authentification

Chorus Pro requiert une **double authentification** sur chaque requête :

1. **OAuth2 Bearer** via la plateforme PISTE (`client_credentials`)
2. **Header `cpro-account`** avec les credentials du compte technique en base64

## Particularités

- Tous les endpoints sont en **POST** (sauf health-check)
- Les réponses utilisent `codeRetour: 0` pour le succès
- La soumission de facture PDF nécessite 2 appels : upload fichier, puis soumission
- Le mode `SAISIE_API` permet de créer une facture sans PDF
- La recherche d'annuaire détecte automatiquement SIRET (14 chiffres) ou SIREN (9 chiffres)

## Documentation

- [API Reference locale](./api-reference.md)
- [Documentation officielle (Chorus Pay)](https://cpro-docs.choruspay.fr/en)
