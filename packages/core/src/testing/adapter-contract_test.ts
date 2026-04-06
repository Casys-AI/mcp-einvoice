import { runAdapterContract } from "./adapter-contract.ts";
import { createMockAdapter } from "./helpers.ts";
import { BaseAdapter } from "../adapters/base-adapter.ts";
import type {
  AdapterMethodName,
  DownloadResult,
  FileEntry,
  InvoiceDetail,
  SearchDirectoryFrResult,
  SearchInvoicesResult,
  StatusHistoryResult,
  WebhookDetail,
} from "../adapter.ts";

// Full-capabilities mock: validates all shape tests pass
Deno.test("adapter contract passes for full-capability mock", async (t) => {
  const { adapter } = createMockAdapter();
  await runAdapterContract(t, adapter);
});

// Limited-capability adapter: validates NotSupportedError path
class LimitedAdapter extends BaseAdapter {
  override get name(): string {
    return "limited-mock";
  }

  override get capabilities(): Set<AdapterMethodName> {
    return new Set([
      "searchInvoices",
      "getInvoice",
      "getStatusHistory",
      "listBusinessEntities",
      "getCustomerId",
    ]);
  }

  override async searchInvoices(): Promise<SearchInvoicesResult> {
    return {
      rows: [
        {
          id: "LIM-001",
          invoiceNumber: "FA-2025-0001",
          direction: "sent" as const,
          status: "delivered",
          amount: 100,
        },
      ],
      count: 1,
    };
  }

  override async getInvoice(id: string): Promise<InvoiceDetail> {
    return {
      id,
      invoiceNumber: "FA-2025-0001",
      direction: "sent" as const,
      status: "delivered",
      totalHt: 100,
      totalTtc: 120,
      lines: [{ description: "Test", quantity: 1, unitPrice: 100, amount: 100 }],
    };
  }

  override async getStatusHistory(): Promise<StatusHistoryResult> {
    return {
      entries: [{ date: "2025-01-01T00:00:00Z", code: "200" }],
    };
  }

  override async listBusinessEntities() {
    return {
      rows: [{ entityId: "BE-LIM-001", name: "Limited Corp" }],
      count: 1,
    };
  }

  override async getCustomerId(): Promise<string> {
    return "LIM-CUST-001";
  }
}

Deno.test("adapter contract validates NotSupportedError for limited adapter", async (t) => {
  const adapter = new LimitedAdapter();
  await runAdapterContract(t, adapter);
});
