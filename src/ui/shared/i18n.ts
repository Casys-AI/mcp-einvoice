/**
 * i18n — Centralized FR/EN translations for E-Invoice viewers.
 *
 * Detects browser locale via navigator.language and defaults to French.
 * Single entry point: `t("key")` returns the localized string.
 * `dateLocale()` returns the locale string for Intl formatters.
 */

type Locale = "fr" | "en";

const translations: Record<Locale, Record<string, string>> = {
  fr: {
    // ── Common UI ────────────────────────────────
    "refresh": "Rafraîchir",
    "refreshing": "Rafraîchissement…",
    "refresh_auto": "Rafraîchissement auto au focus",
    "search": "Rechercher...",
    "no_results": "Aucun résultat",
    "no_documents": "Aucun document",
    "no_data": "Aucune donnée",
    "search_prompt": "Lancez une recherche pour afficher les résultats",
    "no_invoice": "Aucune facture à afficher",
    "no_company": "Aucune entreprise à afficher",
    "no_history": "Aucun historique de statut",
    "details": "Détails",
    "full_details": "Détails complets →",
    "results": "résultats",
    "of": "sur",
    "page": "Page",
    "error_parsing": "Erreur de parsing",
    "error_loading": "Erreur lors du chargement",
    "error_loading_details": "Erreur lors du chargement des détails",
    "error_refresh": "Échec du rafraîchissement",
    "action_failed": "Action échouée",
    "network_error": "Erreur réseau",
    "yes": "Oui",
    "no": "Non",
    "confirm": "Confirmer ?",
    "all": "Tous",
    // ── Pagination ───────────────────────────────
    "first": "Début",
    "prev": "Préc",
    "next": "Suiv",
    "last": "Fin",
    // ── Direction ────────────────────────────────
    "received": "Entrante",
    "sent": "Sortante",
    // ── Invoice ─────────────────────────────────
    "sender": "Émetteur",
    "recipient": "Destinataire",
    "issue_date": "Émission",
    "issue_date_long": "Date d'émission",
    "due_date": "Échéance",
    "receipt_date": "Réception",
    "total_ht": "Total HT",
    "total_tax": "TVA",
    "total_ttc": "Total TTC",
    "description": "Description",
    "qty": "Qté",
    "unit_price": "P.U.",
    "vat_pct": "TVA %",
    "amount": "Montant",
    "submit_invoice": "Soumettre la facture",
    "invoice_submitted": "Facture soumise",
    "accept": "Accepter",
    "reject": "Rejeter",
    "dispute": "Contester",
    "invoice_accepted": "Facture acceptée",
    "invoice_refused": "Facture refusée",
    "dispute_filed": "Litige signalé",
    "payment_sent": "Paiement envoyé",
    "payment_received": "Paiement reçu",
    "status_history": "Historique statuts",
    "view_sender": "Voir émetteur",
    "notes": "Notes",
    "download_pdf": "PDF",
    "download_xml": "XML source",
    "pdf_unavailable": "PDF non disponible — téléchargement du source",
    "downloaded": "Téléchargé",
    "download_cancelled": "Téléchargement annulé",
    "download_error": "Erreur de téléchargement",
    // ── Status timeline ─────────────────────────
    "status_history_title": "Historique des statuts",
    "platform": "Plateforme",
    "operator": "Opérateur",
    "buyer": "Acheteur",
    "seller_label": "Vendeur",
    "tax_authority": "Administration fiscale",
    // ── Navigation prompts (sendMessage) ────────
    "nav_status_history": "Montre-moi l'historique des statuts de la facture",
    "nav_directory_sender": "Recherche l'entité avec le SIRET {siret} dans l'annuaire français",
    "nav_invoice_detail": "Montre-moi les détails de la facture",
    // ── Directory card ──────────────────────────
    "vat_intra": "TVA intracommunautaire",
    "address": "Adresse",
    "country": "Pays",
    "networks": "Réseaux",
    // ── Action result ───────────────────────────
    "success": "Succès",
    "error": "Erreur",
    "operation_ok": "Opération réussie",
    // ── Display mode ─────────────────────────────
    "fullscreen": "Plein écran",
    "exit_fullscreen": "Quitter le plein écran",
    "back": "← Retour",
    // ── Brand ───────────────────────────────────
    "tagline": "facturation électronique",
    // ── Counts ──────────────────────────────────
    "item": "élément",
    "items": "éléments",
  },
  en: {
    "refresh": "Refresh",
    "refreshing": "Refreshing…",
    "refresh_auto": "Auto-refresh on focus",
    "search": "Search...",
    "no_results": "No results",
    "no_documents": "No documents",
    "no_data": "No data",
    "search_prompt": "Run a search to display results",
    "no_invoice": "No invoice to display",
    "no_company": "No company to display",
    "no_history": "No status history",
    "details": "Details",
    "full_details": "Full details →",
    "results": "results",
    "of": "of",
    "page": "Page",
    "error_parsing": "Parsing error",
    "error_loading": "Error loading",
    "error_loading_details": "Error loading details",
    "error_refresh": "Refresh failed",
    "action_failed": "Action failed",
    "network_error": "Network error",
    "yes": "Yes",
    "no": "No",
    "confirm": "Confirm?",
    "all": "All",
    "first": "First",
    "prev": "Prev",
    "next": "Next",
    "last": "Last",
    "received": "Received",
    "sent": "Sent",
    "sender": "Sender",
    "recipient": "Recipient",
    "issue_date": "Issue date",
    "issue_date_long": "Issue date",
    "due_date": "Due date",
    "receipt_date": "Receipt date",
    "total_ht": "Net total",
    "total_tax": "VAT",
    "total_ttc": "Gross total",
    "description": "Description",
    "qty": "Qty",
    "unit_price": "Unit price",
    "vat_pct": "VAT %",
    "amount": "Amount",
    "submit_invoice": "Submit invoice",
    "invoice_submitted": "Invoice submitted",
    "accept": "Accept",
    "reject": "Reject",
    "dispute": "Dispute",
    "invoice_accepted": "Invoice accepted",
    "invoice_refused": "Invoice refused",
    "dispute_filed": "Dispute filed",
    "payment_sent": "Payment sent",
    "payment_received": "Payment received",
    "status_history": "Status history",
    "view_sender": "View sender",
    "notes": "Notes",
    "download_pdf": "PDF",
    "download_xml": "XML source",
    "pdf_unavailable": "PDF unavailable — downloading source",
    "downloaded": "Downloaded",
    "download_cancelled": "Download cancelled",
    "download_error": "Download error",
    "status_history_title": "Status history",
    "nav_status_history": "Show me the status history of invoice",
    "nav_directory_sender": "Search for the entity with SIRET {siret} in the French directory",
    "nav_invoice_detail": "Show me the details of invoice",
    "platform": "Platform",
    "operator": "Operator",
    "buyer": "Buyer",
    "seller_label": "Seller",
    "tax_authority": "Tax authority",
    "vat_intra": "EU VAT number",
    "address": "Address",
    "country": "Country",
    "networks": "Networks",
    "success": "Success",
    "error": "Error",
    "operation_ok": "Operation successful",
    "fullscreen": "Full screen",
    "exit_fullscreen": "Exit full screen",
    "back": "← Back",
    "tagline": "e-invoicing",
    "item": "item",
    "items": "items",
  },
};

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "fr";
  const lang = navigator.language?.slice(0, 2) ?? "fr";
  return lang === "en" ? "en" : "fr";
}

const currentLocale: Locale = detectLocale();

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string): string {
  return translations[currentLocale][key] ?? key;
}

export function dateLocale(): string {
  return currentLocale === "en" ? "en-GB" : "fr-FR";
}
