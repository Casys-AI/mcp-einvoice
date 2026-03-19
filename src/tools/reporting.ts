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
            "Exact schema depends on the PA provider — check Iopole docs for the full specification.",
        },
      },
      required: ["transaction"],
    },
    handler: async (input, ctx) => {
      if (!input.transaction) {
        throw new Error(
          "[einvoice_reporting_invoice_transaction] 'transaction' is required",
        );
      }
      return await ctx.adapter.reportInvoiceTransaction(
        input.transaction as Record<string, unknown>,
      );
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
        business_entity_id: {
          type: "string",
          description: "Business entity ID for which to report the transaction",
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
            "Exact schema depends on the PA provider — check Iopole docs for the full specification.",
        },
      },
      required: ["business_entity_id", "transaction"],
    },
    handler: async (input, ctx) => {
      if (!input.business_entity_id || !input.transaction) {
        throw new Error(
          "[einvoice_reporting_transaction] 'business_entity_id' and 'transaction' are required",
        );
      }
      return await ctx.adapter.reportTransaction(
        input.business_entity_id as string,
        input.transaction as Record<string, unknown>,
      );
    },
  },
];
