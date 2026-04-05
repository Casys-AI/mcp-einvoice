/**
 * E-Invoice Reporting Tools
 *
 * MCP tools for French e-reporting obligations.
 * PA-agnostic — calls adapter methods.
 *
 * @module lib/einvoice/tools/reporting
 */

import type { EInvoiceTool } from "./types.ts";

export const reportingTools: EInvoiceTool[] = [
  // ── Invoice Transaction Reporting ───────────────────────

  {
    name: "einvoice_reporting_invoice_transaction",
    requires: ["reportInvoiceTransaction"],
    description:
      "Report an invoice transaction to the French tax authority (e-reporting). " +
      "Required for B2C and international invoice transactions. " +
      "Asynchronous — returns a GUID.",
    category: "reporting",
    inputSchema: {
      type: "object",
      properties: {
        identifier_scheme: {
          type: "string",
          description:
            "Identifier scheme (e.g. '0009' for SIRET, '0088' for EAN).",
        },
        identifier_value: {
          type: "string",
          description:
            "Identifier value (e.g. SIRET number '43446637100011').",
        },
        transaction: {
          type: "object",
          description:
            "Invoice transaction data for DGFiP e-reporting. Typical fields: " +
            "invoiceReference (string): the invoice number; " +
            "transactionDate (string, YYYY-MM-DD): date of the transaction; " +
            "transactionType (string): e.g. 'B2C', 'INTERNATIONAL'; " +
            "totalAmount (number): total TTC amount; " +
            "taxDetails (array): [{ vatRate: number, taxableAmount: number, taxAmount: number }]; " +
            "counterparty (object): { name, country, identifier }; " +
            "currency (string, default 'EUR'). " +
            "Exact schema depends on the PA provider.",
        },
      },
      required: ["identifier_scheme", "identifier_value", "transaction"],
    },
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.identifier_scheme || !input.identifier_value || !input.transaction) {
        throw new Error(
          "[einvoice_reporting_invoice_transaction] 'identifier_scheme', 'identifier_value', and 'transaction' are required",
        );
      }
      const result = await ctx.adapter.reportInvoiceTransaction(
        input.identifier_scheme as string,
        input.identifier_value as string,
        input.transaction as Record<string, unknown>,
      );
      return {
        content: "Déclaration e-reporting (facture) envoyée",
        structuredContent: {
          action: "Déclaration e-reporting",
          status: "success",
          title: "Transaction facture déclarée",
          details: result as Record<string, unknown>,
        },
      };
    },
  },

  // ── Non-Invoice Transaction Reporting ───────────────────

  {
    name: "einvoice_reporting_transaction",
    requires: ["reportTransaction"],
    description:
      "Report a non-invoice transaction to the French tax authority (e-reporting). " +
      "Covers payment data, B2C cash transactions, etc. " +
      "Requires the business entity ID. Asynchronous — returns a GUID.",
    category: "reporting",
    inputSchema: {
      type: "object",
      properties: {
        identifier_scheme: {
          type: "string",
          description:
            "Identifier scheme (e.g. '0009' for SIRET, '0088' for EAN).",
        },
        identifier_value: {
          type: "string",
          description:
            "Identifier value (e.g. SIRET number '43446637100011').",
        },
        transaction: {
          type: "object",
          description:
            "Non-invoice transaction data for DGFiP e-reporting. Typical fields: " +
            "transactionDate (string, YYYY-MM-DD); " +
            "transactionType (string): e.g. 'CASH_PAYMENT', 'PAYMENT_DATA'; " +
            "totalAmount (number): total TTC amount; " +
            "taxDetails (array): [{ vatRate: number, taxableAmount: number, taxAmount: number }]; " +
            "periodicity (string): 'MONTHLY' or 'QUARTERLY'; " +
            "currency (string, default 'EUR'). " +
            "Exact schema depends on the PA provider.",
        },
      },
      required: ["identifier_scheme", "identifier_value", "transaction"],
    },
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.identifier_scheme || !input.identifier_value || !input.transaction) {
        throw new Error(
          "[einvoice_reporting_transaction] 'identifier_scheme', 'identifier_value', and 'transaction' are required",
        );
      }
      const result = await ctx.adapter.reportTransaction(
        input.identifier_scheme as string,
        input.identifier_value as string,
        input.transaction as Record<string, unknown>,
      );
      return {
        content: `Déclaration e-reporting (transaction) envoyée pour ${input.identifier_scheme}:${input.identifier_value}`,
        structuredContent: {
          action: "Déclaration e-reporting",
          status: "success",
          title: `Transaction déclarée pour ${input.identifier_scheme}:${input.identifier_value}`,
          details: result as Record<string, unknown>,
        },
      };
    },
  },
];
