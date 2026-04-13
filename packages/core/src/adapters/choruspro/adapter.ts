/**
 * Chorus Pro Adapter
 *
 * Adapter for the French government's Chorus Pro platform (PPF).
 * Chorus Pro is NOT a PDP (Plateforme de Dématérialisation Partenaire) —
 * it is the Portail Public de Facturation, the central government hub
 * for public-sector e-invoicing in France.
 *
 * Specifics:
 * - Dual auth: OAuth2 via PISTE + cpro-account header (base64)
 * - All endpoints are POST (except health-check)
 * - Responses use codeRetour: 0 for success
 * - Invoice submission can be PDF-based (DEPOT_PDF_API) or structured (SAISIE_API)
 * - File upload is a separate step before PDF invoice submission
 *
 * @module adapters/choruspro/adapter
 */

import { BaseAdapter } from "../base-adapter.ts";
import type {
  AdapterMethodName,
  BusinessEntityRow,
  DirectoryFrRow,
  DirectoryFrSearchFilters,
  EmitInvoiceRequest,
  InvoiceDetail,
  InvoiceSearchFilters,
  InvoiceSearchRow,
  ListBusinessEntitiesResult,
  SearchDirectoryFrResult,
  SearchInvoicesResult,
} from "../../adapter.ts";
import { ChorusProClient } from "./client.ts";
import type { ChorusProClientConfig, ChorusProResponse } from "./client.ts";
import { createOAuth2TokenProvider } from "../shared/oauth2.ts";
import { requireEnv } from "../shared/env.ts";
import { env } from "../../runtime.ts";
import { uint8ToBase64 } from "../shared/encoding.ts";

// ─── Chorus Pro Response Types ───────────────────────────

interface CproSearchInvoicesResponse extends ChorusProResponse {
  listeFactures?: CproInvoiceRow[];
}

interface CproInvoiceRow {
  identifiantFactureCPP: number;
  numeroFacture?: string;
  montantTotal?: number;
  statutFacture?: string;
  dateFacture?: string;
  fournisseurRaisonSociale?: string;
  destinataireRaisonSociale?: string;
  deviseFacture?: string;
}

interface CproConsultInvoiceResponse extends ChorusProResponse {
  facture?: CproInvoiceDetail;
}

interface CproInvoiceDetail {
  identifiantFactureCPP: number;
  numeroFacture?: string;
  montantTotal?: number;
  montantHT?: number;
  montantTVA?: number;
  montantTTC?: number;
  dateFacture?: string;
  dateDepot?: string;
  statutFacture?: string;
  fournisseurRaisonSociale?: string;
  fournisseurSiret?: string;
  fournisseurNumeroTva?: string;
  destinataireRaisonSociale?: string;
  destinataireSiret?: string;
  destinataireNumeroTva?: string;
  cadreDeFacturation?: { codeCadreFacturation?: string };
  deviseFacture?: string;
  modeDepot?: string;
  lignePoste?: CproLineItem[];
  commentaire?: string;
}

interface CproLineItem {
  lignePosteDenomination?: string;
  lignePosteNumero?: number;
  lignePosteQuantite?: number;
  lignePosteMontantUnitaireHT?: number;
  lignePosteTauxTvaManuel?: number;
  lignePosteMontantRemiseHT?: number;
}

interface CproSubmitResponse extends ChorusProResponse {
  identifiantFactureCPP?: number;
  numeroFacture?: string;
  statutFacture?: string;
  dateDepot?: string;
}

interface CproUploadFileResponse extends ChorusProResponse {
  pieceJointeId?: number;
}

interface CproSearchStructureResponse extends ChorusProResponse {
  structure?: CproStructure;
  listeStructures?: CproStructure[];
}

interface CproStructure {
  idStructureCPP?: number;
  raisonSociale?: string;
  siret?: string;
  siren?: string;
  adresse?: string;
  typeStructure?: string;
}

interface CproConsultStructureResponse extends ChorusProResponse {
  structure?: CproStructure;
}

interface CproMyStructuresResponse extends ChorusProResponse {
  listeRattachements?: CproRattachement[];
}

interface CproRattachement {
  idStructure?: number;
  nomStructure?: string;
  typeStructure?: string;
  siret?: string;
}

// ─── Adapter ─────────────────────────────────────────────

export class ChorusProAdapter extends BaseAdapter {
  private client: ChorusProClient;

  constructor(config: ChorusProClientConfig) {
    super();
    this.client = new ChorusProClient(config);
  }

  override get name(): string {
    return "choruspro";
  }

  override get capabilities(): Set<AdapterMethodName> {
    return new Set([
      "searchInvoices",
      "getInvoice",
      "emitInvoice",
      "searchDirectoryFr",
      "listBusinessEntities",
      "getBusinessEntity",
    ]);
  }

  // ─── Invoice Operations ──────────────────────────────────

  override async searchInvoices(
    filters: InvoiceSearchFilters,
  ): Promise<SearchInvoicesResult> {
    const body: Record<string, unknown> = {
      typeFacture: "FACTURE",
      rechercheFactureParFournisseur: {
        nbResultatsParPage: filters.limit ?? 100,
      },
    };

    const res = await this.client.postCpro<CproSearchInvoicesResponse>(
      "/factures/v1/rechercher/fournisseur",
      body,
    );
    assertSuccess(res);

    const rows: InvoiceSearchRow[] = (res.listeFactures ?? []).map(
      normInvoiceRow,
    );
    return { rows, count: rows.length };
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    const res = await this.client.postCpro<CproConsultInvoiceResponse>(
      "/factures/v1/consulter/fournisseur",
      { identifiantFactureCPP: Number(id) },
    );
    assertSuccess(res);

    if (!res.facture) {
      throw new Error(`[ChorusPro] Invoice ${id} not found`);
    }
    return normInvoiceDetail(res.facture);
  }

  override async emitInvoice(
    req: EmitInvoiceRequest,
  ): Promise<Record<string, unknown>> {
    // Step 1: Upload the file
    const ext = req.filename.split(".").pop() ?? "pdf";
    const mime = ext === "pdf"
      ? "application/pdf"
      : "application/octet-stream";

    const uploadRes = await this.client.postCpro<CproUploadFileResponse>(
      "/transverses/v1/ajouter/fichier",
      {
        pieceJointeExtension: ext,
        pieceJointeFichier: uint8ToBase64(req.file),
        pieceJointeNom: req.filename,
        pieceJointeTypeMime: mime,
      },
    );
    assertSuccess(uploadRes);

    if (!uploadRes.pieceJointeId) {
      throw new Error("[ChorusPro] File upload succeeded but no pieceJointeId returned");
    }

    // Step 2: Submit the invoice with the uploaded file reference
    // The caller must provide the full invoice body in the file metadata
    // or we submit with minimal required fields. For now, we return the
    // upload result so the caller can use the pieceJointeId in a subsequent call.
    return {
      pieceJointeId: uploadRes.pieceJointeId,
      message:
        "File uploaded successfully. Use the pieceJointeId to submit the invoice via the Chorus Pro soumettre endpoint.",
    };
  }

  // ─── Directory ───────────────────────────────────────────

  override async searchDirectoryFr(
    filters: DirectoryFrSearchFilters,
  ): Promise<SearchDirectoryFrResult> {
    const query = filters.q;
    const identifierType = detectIdentifierType(query);

    const body: Record<string, unknown> = identifierType
      ? {
        structure: {
          typeIdentifiantStructure: identifierType,
          identifiantStructure: query,
        },
      }
      : {
        structure: { typeStructure: "PUBLIQUE" },
        parametres: { nbResultatsParPage: filters.limit ?? 100 },
      };

    const res = await this.client.postCpro<CproSearchStructureResponse>(
      "/structures/v1/rechercher",
      body,
    );
    assertSuccess(res);

    const rows: DirectoryFrRow[] = [];
    if (res.structure) {
      rows.push(normStructureToDirectoryRow(res.structure));
    }
    if (res.listeStructures) {
      rows.push(...res.listeStructures.map(normStructureToDirectoryRow));
    }

    return { rows, count: rows.length };
  }

  // ─── Operator Config ─────────────────────────────────────

  override async listBusinessEntities(): Promise<ListBusinessEntitiesResult> {
    const res = await this.client.postCpro<CproMyStructuresResponse>(
      "/utilisateurs/v1/monCompte/recuperer/rattachements",
      {
        parametresRecherche: {
          nbResultatsParPage: 500,
          pageResultatDemandee: 1,
          triColonne: "IdStructure",
          triSens: "Descendant",
        },
      },
    );
    assertSuccess(res);

    const rows: BusinessEntityRow[] = (res.listeRattachements ?? []).map(
      (r) => ({
        entityId: String(r.idStructure ?? ""),
        name: r.nomStructure,
        type: r.typeStructure,
        siret: r.siret,
      }),
    );
    return { rows, count: rows.length };
  }

  override async getBusinessEntity(
    id: string,
  ): Promise<Record<string, unknown>> {
    const res = await this.client.postCpro<CproConsultStructureResponse>(
      "/structures/v1/consulter",
      { idStructureCPP: Number(id) },
    );
    assertSuccess(res);

    return (res.structure as unknown as Record<string, unknown>) ?? {};
  }
}

// ─── Normalization Helpers ─────────────────────────────────

function assertSuccess(res: ChorusProResponse): void {
  if (res.codeRetour !== 0) {
    throw new Error(
      `[ChorusPro] API error (code ${res.codeRetour}): ${res.libelle ?? "Unknown error"}`,
    );
  }
}

function normInvoiceRow(raw: CproInvoiceRow): InvoiceSearchRow {
  return {
    id: String(raw.identifiantFactureCPP),
    invoiceNumber: raw.numeroFacture,
    amount: raw.montantTotal,
    status: raw.statutFacture,
    date: raw.dateFacture,
    senderName: raw.fournisseurRaisonSociale,
    receiverName: raw.destinataireRaisonSociale,
    currency: raw.deviseFacture,
    direction: "sent",
  };
}

function normInvoiceDetail(raw: CproInvoiceDetail): InvoiceDetail {
  return {
    id: String(raw.identifiantFactureCPP),
    invoiceNumber: raw.numeroFacture,
    status: raw.statutFacture,
    direction: "sent",
    format: raw.modeDepot,
    invoiceType: raw.cadreDeFacturation?.codeCadreFacturation,
    senderName: raw.fournisseurRaisonSociale,
    senderId: raw.fournisseurSiret,
    senderVat: raw.fournisseurNumeroTva,
    receiverName: raw.destinataireRaisonSociale,
    receiverId: raw.destinataireSiret,
    receiverVat: raw.destinataireNumeroTva,
    issueDate: raw.dateFacture,
    receiptDate: raw.dateDepot,
    currency: raw.deviseFacture,
    totalHt: raw.montantHT,
    totalTax: raw.montantTVA,
    totalTtc: raw.montantTTC ?? raw.montantTotal,
    lines: raw.lignePoste?.map((l) => ({
      description: l.lignePosteDenomination,
      quantity: l.lignePosteQuantite,
      unitPrice: l.lignePosteMontantUnitaireHT,
      taxRate: l.lignePosteTauxTvaManuel,
    })),
    notes: raw.commentaire ? [raw.commentaire] : undefined,
  };
}

function normStructureToDirectoryRow(raw: CproStructure): DirectoryFrRow {
  return {
    entityId: String(raw.idStructureCPP ?? ""),
    name: raw.raisonSociale,
    type: raw.typeStructure,
    siren: raw.siren,
    siret: raw.siret,
    country: "FR",
    directory: "chorus-pro",
  };
}

/** Auto-detect SIRET (14 digits) or SIREN (9 digits) from query string. */
function detectIdentifierType(q: string): string | null {
  const cleaned = q.replace(/\s/g, "");
  if (/^\d{14}$/.test(cleaned)) return "SIRET";
  if (/^\d{9}$/.test(cleaned)) return "SIREN";
  return null;
}

// ─── Factory ─────────────────────────────────────────────

const DEFAULT_SANDBOX_AUTH_URL =
  "https://sandbox-oauth.piste.gouv.fr/api/oauth/token";

export function createChorusProAdapter(): ChorusProAdapter {
  const baseUrl = requireEnv(
    "ChorusPro",
    "CHORUSPRO_API_URL",
    "e.g. https://sandbox-api.piste.gouv.fr/cpro",
  );
  const clientId = requireEnv(
    "ChorusPro",
    "CHORUSPRO_CLIENT_ID",
    "PISTE OAuth2 client ID",
  );
  const clientSecret = requireEnv(
    "ChorusPro",
    "CHORUSPRO_CLIENT_SECRET",
    "PISTE OAuth2 client secret",
  );
  const cproLogin = requireEnv(
    "ChorusPro",
    "CHORUSPRO_LOGIN",
    "Technical account login (TECH_1_xxxxx@cpro.fr)",
  );
  const cproPassword = requireEnv(
    "ChorusPro",
    "CHORUSPRO_PASSWORD",
    "Technical account password",
  );
  const authUrl = env("CHORUSPRO_AUTH_URL") ?? DEFAULT_SANDBOX_AUTH_URL;

  const getToken = createOAuth2TokenProvider({
    authUrl,
    clientId,
    clientSecret,
    scope: "openid resource.READ",
  });

  return new ChorusProAdapter({
    baseUrl,
    getToken,
    cproLogin,
    cproPassword,
  });
}
