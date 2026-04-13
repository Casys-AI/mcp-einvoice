# Chorus Pro API Reference

Source: https://cpro-docs.choruspay.fr/en

## Authentication

**Dual authentication required on ALL endpoints:**

1. **OAuth2 Bearer Token** (via PISTE platform)
   - Grant type: `client_credentials`
   - Scope: `openid resource.READ`
   - Token expires after 3600 seconds
   - Header: `Authorization: Bearer <token>`

2. **cpro-account Header**
   - Chorus Pro technical account credentials in base64
   - Format: `cpro-account: base64(TECH_1_xxxxx@cpro.fr:password)`
   - Separate from PISTE credentials

## Base URLs

| Environment | API Base URL                                  | OAuth Token URL                                      |
| ----------- | --------------------------------------------- | ---------------------------------------------------- |
| Production  | `https://api.piste.gouv.fr/cpro`              | `https://oauth.piste.gouv.fr/api/oauth/token`        |
| Sandbox     | `https://sandbox-api.piste.gouv.fr/cpro`      | `https://sandbox-oauth.piste.gouv.fr/api/oauth/token` |

## Response Pattern

All responses include `codeRetour` (0 = success) and `libelle` (message).
Check `codeRetour` even on HTTP 200 — it may indicate a logical error.

## Endpoints

### INVOICES

#### POST /factures/v1/rechercher/fournisseur — List invoices
```json
// Request
{ "typeFacture": "FACTURE", "rechercheFactureParFournisseur": { "nbResultatsParPage": 100 } }
// Response
{ "codeRetour": 0, "libelle": "Succes", "listeFactures": [
  { "identifiantFactureCPP": 8316845, "numeroFacture": "F001", "montantTotal": 100.00, "statutFacture": "DEPOSEE" }
]}
```

#### POST /factures/v1/consulter/fournisseur — Consult invoice
```json
// Request
{ "identifiantFactureCPP": 8316845 }
// Response
{ "codeRetour": 0, "facture": {
  "identifiantFactureCPP": 8316845, "numeroFacture": "F001",
  "montantTotal": 100.00, "dateFacture": "2025-11-05"
}}
```

#### POST /factures/v1/soumettre — Submit invoice
Two modes:
- `DEPOT_PDF_API`: submit with PDF attachment (requires prior file upload)
- `SAISIE_API`: create invoice from structured data (no PDF)

```json
// Request (DEPOT_PDF_API mode)
{
  "numeroFactureSaisi": "F333",
  "dateFacture": "2025-11-05",
  "cadreDeFacturation": { "codeCadreFacturation": "A1_FACTURE_FOURNISSEUR" },
  "destinataire": { "codeDestinataire": "19672337516762" },
  "fournisseur": { "codeCoordonneesBancairesFournisseur": 144050, "idFournisseur": 26262962 },
  "idUtilisateurCourant": 65336344681929,
  "lignePoste": [{ "lignePosteDenomination": "Licence", "lignePosteMontantUnitaireHT": 16.6667, "lignePosteNumero": 1, "lignePosteQuantite": 1, "lignePosteTauxTvaManuel": 20 }],
  "ligneTva": [{ "ligneTvaMontantBaseHtParTaux": 16.6667, "ligneTvaMontantTvaParTaux": 3.3333, "ligneTvaTauxManuel": 20 }],
  "modeDepot": "DEPOT_PDF_API",
  "montantTotal": { "montantAPayer": 20, "montantHtTotal": 16.6667, "montantTVA": 3.3333, "montantTtcTotal": 20 },
  "pieceJointePrincipale": [{ "pieceJointePrincipaleDesignation": "Facture", "pieceJointePrincipaleId": 10321512 }],
  "references": { "deviseFacture": "EUR", "modePaiement": "VIREMENT", "typeFacture": "FACTURE", "typeTva": "TVA_SUR_ENCAISSEMENT" }
}
// Response
{
  "codeRetour": 0, "libelle": "GCU_MSG_01_000",
  "identifiantFactureCPP": 8316848, "numeroFacture": "20250000000000000014",
  "statutFacture": "DEPOSEE", "dateDepot": "2025-04-09"
}
```

### STRUCTURES

#### POST /structures/v1/rechercher — Search structure
```json
// Request (by SIRET)
{ "structure": { "typeIdentifiantStructure": "SIRET", "identifiantStructure": "97395107368257" } }
// Request (list public)
{ "structure": { "typeStructure": "PUBLIQUE" }, "parametres": { "nbResultatsParPage": 100 } }
// Response
{ "codeRetour": 0, "structure": { "idStructureCPP": 26346724, "raisonSociale": "Example Organization", "siret": "97395107368257" } }
```

#### POST /structures/v1/consulter — Consult structure
```json
// Request
{ "idStructureCPP": 26346724 }
// Response
{ "codeRetour": 0, "structure": { "idStructureCPP": 26346724, "raisonSociale": "Example Organization", "adresse": "123 Rue Example" } }
```

#### POST /structures/v1/rechercher/services — List structure services
```json
// Request
{ "idStructure": 26346724, "parametresRechercherServicesStructure": { "nbResultatsParPage": 1000 } }
// Response
{ "codeRetour": 0, "listeServices": [{ "idService": 123456, "codeService": "SVC001", "nomService": "Service Comptabilite" }] }
```

#### POST /utilisateurs/v1/monCompte/recuperer/rattachements — My structures
```json
// Request
{ "parametresRecherche": { "nbResultatsParPage": 100, "pageResultatDemandee": 1, "triColonne": "IdStructure", "triSens": "Descendant" } }
// Response
{ "codeRetour": 0, "listeRattachements": [{ "idStructure": 26346724, "nomStructure": "My Organization" }] }
```

### FILES

#### POST /transverses/v1/ajouter/fichier — Upload file
```json
// Request
{ "pieceJointeExtension": "pdf", "pieceJointeFichier": "<base64>", "pieceJointeNom": "facture.pdf", "pieceJointeTypeMime": "application/pdf" }
// Response
{ "codeRetour": 0, "pieceJointeId": 10321512 }
```

### DIRECTORY

#### POST /transverses/v1/telecharger/annuaire/destinataire — Download directory
```json
// Request: {} (empty body)
// Response
{ "codeRetour": 0, "fichier": "<base64 zip>" }
```

### REFERENCE DATA

#### POST /transverses/v1/recuperer/motifs/exonerationtva — VAT exemption reasons
```json
// Request
{ "codeLangue": "fr" }
// Response
{ "codeRetour": 0, "listeMotifs": [{ "code": "EXPT", "libelle": "Exportation" }] }
```

#### POST /transverses/v1/recuperer/tauxtva — VAT rates
```json
// Request
{ "codeLangue": "fr" }
// Response
{ "codeRetour": 0, "listeTaux": [{ "code": "20,00", "libelle": "20%" }] }
```

#### POST /transverses/v1/recuperer/coordbanc/valides — Bank details
```json
// Request
{ "idStructure": 26262962 }
// Response
{ "codeRetour": 0, "listeCoordonneesBancaires": [{ "codeCoordonneesBancaires": 144050, "iban": "FR76...", "bic": "BNPAFRPPXXX" }] }
```

### HEALTH

#### GET /transverses/v1/health-check — Health check
```json
// Response
{ "status": "ok" }
```

## Invoice Statuses

- `DEPOSEE` — Submitted/deposited
- Other statuses from the Chorus Pro lifecycle (not documented in the API reference)

## Invoice Framework Codes (cadreDeFacturation)

- `A1_FACTURE_FOURNISSEUR` — Standard supplier invoice
- Other codes exist for credit notes, subcontracting, etc.

## Identifier Types

- `SIRET` — 14-digit establishment identifier
- `SIREN` — 9-digit company identifier

## Deposit Modes (modeDepot)

- `DEPOT_PDF_API` — PDF attachment mode (requires prior file upload)
- `SAISIE_API` — Structured data mode (no PDF needed)
