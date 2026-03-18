/**
 * E-Invoice Tools Registry
 *
 * Central registry for all E-Invoice MCP tools.
 * Exports tools by category and provides lookup utilities.
 *
 * @module lib/einvoice/tools/mod
 */

import { invoiceTools } from "./invoice.ts";
import { directoryTools } from "./directory.ts";
import { statusTools } from "./status.ts";
import { reportingTools } from "./reporting.ts";
import { webhookTools } from "./webhook.ts";
import { configTools } from "./config.ts";
import type { EInvoiceTool, EInvoiceToolCategory } from "./types.ts";

export {
  invoiceTools,
  directoryTools,
  statusTools,
  reportingTools,
  webhookTools,
  configTools,
};
export type { EInvoiceTool, EInvoiceToolCategory };

/** All tools grouped by category */
export const toolsByCategory: Record<string, EInvoiceTool[]> = {
  invoice: invoiceTools,
  directory: directoryTools,
  status: statusTools,
  reporting: reportingTools,
  webhook: webhookTools,
  config: configTools,
};

/** Flat array of all tools */
export const allTools: EInvoiceTool[] = [
  ...invoiceTools,
  ...directoryTools,
  ...statusTools,
  ...reportingTools,
  ...webhookTools,
  ...configTools,
];

/** Get tools for a specific category */
export function getToolsByCategory(category: string): EInvoiceTool[] {
  return toolsByCategory[category as EInvoiceToolCategory] ?? [];
}

/** Find a tool by its unique name */
export function getToolByName(name: string): EInvoiceTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get list of available categories */
export function getCategories(): EInvoiceToolCategory[] {
  return Object.keys(toolsByCategory) as EInvoiceToolCategory[];
}
