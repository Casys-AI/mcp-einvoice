# structuredContent Enrichment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `{ content, structuredContent }` returns to all 27 tools that currently return raw adapter results. This makes every tool usable by both LLMs (text summary) and programmatic consumers (structured JSON via REST API and MCP viewers).

**Architecture:** Three patterns based on tool type: (A) mutation tools → action-result viewer with `{ action, status, title, details }`, (B) list tools → doclist-viewer with `{ data, count, _title }`, (C) detail/simple tools → pass-through structured data. No shared helper needed — each handler wraps its own return.

**Tech Stack:** Deno, TypeScript

---

## Tool Inventory by Pattern

### Pattern A — Action/Mutation → action-result viewer (20 tools)

| Tool | File | Already has `_meta`? |
|------|------|---------------------|
| `einvoice_invoice_submit` | invoice.ts | No |
| `einvoice_status_send` | status.ts | No |
| `einvoice_config_entity_create_legal` | config.ts | No |
| `einvoice_config_entity_create_office` | config.ts | No |
| `einvoice_config_enroll_fr` | config.ts | Yes |
| `einvoice_config_entity_claim` | config.ts | No |
| `einvoice_config_entity_delete` | config.ts | No |
| `einvoice_config_network_register` | config.ts | Yes |
| `einvoice_config_network_register_by_id` | config.ts | Yes |
| `einvoice_config_identifier_create` | config.ts | Yes |
| `einvoice_config_identifier_create_by_scheme` | config.ts | Yes |
| `einvoice_config_identifier_delete` | config.ts | No |
| `einvoice_config_entity_configure` | config.ts | Yes |
| `einvoice_config_claim_delete` | config.ts | No |
| `einvoice_config_network_unregister` | config.ts | No |
| `einvoice_webhook_create` | webhook.ts | No |
| `einvoice_webhook_update` | webhook.ts | No |
| `einvoice_webhook_delete` | webhook.ts | No |
| `einvoice_reporting_invoice_transaction` | reporting.ts | No |
| `einvoice_reporting_transaction` | reporting.ts | No |

### Pattern B — List/Search → doclist-viewer or directory-list (4 tools)

| Tool | File | Viewer |
|------|------|--------|
| `einvoice_directory_int_search` | directory.ts | directory-list (already has `_meta`) |
| `einvoice_directory_peppol_check` | directory.ts | directory-card |
| `einvoice_invoice_files` | invoice.ts | doclist-viewer |
| `einvoice_invoice_attachments` | invoice.ts | doclist-viewer |

### Pattern C — Detail/Get → pass-through or specific viewer (2 tools)

| Tool | File | Viewer |
|------|------|--------|
| `einvoice_config_entity_get` | config.ts | directory-card (already has `_meta`) |
| `einvoice_webhook_get` | webhook.ts | No viewer (JSON only) |

### Pattern D — Simple value → no viewer (1 tool)

| Tool | File | Notes |
|------|------|-------|
| `einvoice_config_customer_id` | config.ts | Returns a string — wrap in `{ content, structuredContent }` |

---

## File Map

| Action | File | Changes |
|--------|------|---------|
| Modify | `packages/mcp/src/tools/config.ts` | 15 tools: add structuredContent + _meta where missing |
| Modify | `packages/mcp/src/tools/webhook.ts` | 4 tools: add structuredContent + _meta where missing |
| Modify | `packages/mcp/src/tools/status.ts` | 1 tool: add structuredContent to status_send |
| Modify | `packages/mcp/src/tools/reporting.ts` | 2 tools: add structuredContent + _meta |
| Modify | `packages/mcp/src/tools/invoice.ts` | 3 tools: add structuredContent + _meta where missing |
| Modify | `packages/mcp/src/tools/directory.ts` | 2 tools: add structuredContent to int_search + peppol_check |
| Modify | `packages/mcp/src/tools/config_test.ts` | Add/update tests for structuredContent |
| Modify | `packages/mcp/src/tools/webhook_test.ts` | Add/update tests for structuredContent |
| Modify | `packages/mcp/src/tools/status_test.ts` | Add/update tests for structuredContent |
| Modify | `packages/mcp/src/tools/reporting_test.ts` | Add/update tests for structuredContent |
| Modify | `packages/mcp/src/tools/invoice_test.ts` | Add/update tests for structuredContent |
| Modify | `packages/mcp/src/tools/directory_test.ts` | Add/update tests for structuredContent |

---

### Task 1: Config — entity_get (Pattern C) + customer_id (Pattern D)

These two are the simplest config tools — one detail, one simple value.

**Files:**
- Modify: `packages/mcp/src/tools/config.ts`
- Test: `packages/mcp/src/tools/config_test.ts`

- [ ] **Step 1: Write failing test for customer_id**

```typescript
Deno.test("einvoice_config_customer_id returns { content, structuredContent }", async () => {
  const { adapter } = createMockAdapter("CUST-12345");
  const tool = configTools.find((t) => t.name === "einvoice_config_customer_id")!;
  const result = await tool.handler({}, { adapter }) as {
    content: string;
    structuredContent: unknown;
  };
  assertEquals(typeof result.content, "string");
  assertStringIncludes(result.content, "CUST-12345");
  assertEquals(result.structuredContent, { customerId: "CUST-12345" });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `deno test packages/mcp/src/tools/config_test.ts --filter "customer_id"`
Expected: FAIL

- [ ] **Step 3: Implement customer_id structuredContent**

In `config.ts`, change `einvoice_config_customer_id` handler:

```typescript
    handler: async (_input, ctx) => {
      const customerId = await ctx.adapter.getCustomerId();
      return {
        content: `Identifiant opérateur : ${customerId}`,
        structuredContent: { customerId },
      };
    },
```

- [ ] **Step 4: Run test — verify it passes**

Run: `deno test packages/mcp/src/tools/config_test.ts --filter "customer_id"`
Expected: PASS

- [ ] **Step 5: Write failing test for entity_get**

```typescript
Deno.test("einvoice_config_entity_get returns { content, structuredContent }", async () => {
  const entityData = {
    entityId: "ent-1", name: "Acme SAS", siret: "12345678901234",
    type: "LEGAL_UNIT", country: "FR",
  };
  const { adapter } = createMockAdapter(entityData);
  const tool = configTools.find((t) => t.name === "einvoice_config_entity_get")!;
  const result = await tool.handler({ id: "ent-1" }, { adapter }) as {
    content: string;
    structuredContent: unknown;
  };
  assertEquals(typeof result.content, "string");
  assertStringIncludes(result.content, "Acme SAS");
  assertEquals(result.structuredContent, entityData);
});
```

- [ ] **Step 6: Implement entity_get structuredContent**

In `config.ts`, change `einvoice_config_entity_get` handler:

```typescript
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_config_entity_get] 'id' is required");
      }
      const entity = await ctx.adapter.getBusinessEntity(input.id as string) as Record<string, unknown>;
      const name = entity?.name ?? entity?.entityId ?? input.id;
      return {
        content: `Entité : ${name}`,
        structuredContent: entity,
      };
    },
```

- [ ] **Step 7: Run test — verify it passes**

Run: `deno test packages/mcp/src/tools/config_test.ts --filter "entity_get"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/src/tools/config.ts packages/mcp/src/tools/config_test.ts
git commit -m "feat: add structuredContent to customer_id and entity_get tools"
```

---

### Task 2: Config — mutation tools (Pattern A, 13 tools)

All 13 remaining config mutation tools follow the action-result pattern. For each, the handler wraps the adapter result in `{ action, status, title, details }`.

**Files:**
- Modify: `packages/mcp/src/tools/config.ts`
- Test: `packages/mcp/src/tools/config_test.ts`

- [ ] **Step 1: Write failing test for entity_create_legal (representative)**

```typescript
Deno.test("einvoice_config_entity_create_legal returns action-result structuredContent", async () => {
  const mockResult = { entityId: "ent-1", name: "Acme" };
  const { adapter } = createMockAdapter(mockResult);
  const tool = configTools.find((t) => t.name === "einvoice_config_entity_create_legal")!;
  const result = await tool.handler(
    { siren: "123456789" },
    { adapter },
  ) as { content: string; structuredContent: Record<string, unknown> };
  assertEquals(typeof result.content, "string");
  assertEquals(result.structuredContent.action, "Création entité juridique");
  assertEquals(result.structuredContent.status, "success");
  assertEquals((result.structuredContent.details as Record<string, unknown>).entityId, "ent-1");
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `deno test packages/mcp/src/tools/config_test.ts --filter "entity_create_legal"`
Expected: FAIL

- [ ] **Step 3: Implement all 13 config mutation tools**

For each tool, the pattern is identical. Add `_meta` where missing, wrap return in action-result format.

**entity_create_legal:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    // ... (keep existing inputSchema, requires, etc.)
    handler: async (input, ctx) => {
      if (!input.siren) {
        throw new Error("[einvoice_config_entity_create_legal] 'siren' is required");
      }
      const result = await ctx.adapter.createLegalUnit({
        identifierScheme: "0002",
        identifierValue: input.siren as string,
        name: input.name as string | undefined,
        country: (input.country as string) ?? "FR",
        scope: (input.scope as string) ?? "PRIMARY",
      });
      return {
        content: `Entité juridique créée (SIREN ${input.siren})`,
        structuredContent: {
          action: "Création entité juridique",
          status: "success",
          title: `SIREN ${input.siren} enregistré`,
          details: result,
        },
      };
    },
```

**entity_create_office:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.siret || !input.legalUnitId) {
        throw new Error("[einvoice_config_entity_create_office] 'siret' and 'legalUnitId' are required");
      }
      const result = await ctx.adapter.createOffice({
        identifierScheme: "0009",
        identifierValue: input.siret as string,
        legalBusinessEntityId: input.legalUnitId as string,
        name: input.name as string | undefined,
        scope: (input.scope as string) ?? "PRIMARY",
      });
      return {
        content: `Établissement créé (SIRET ${input.siret})`,
        structuredContent: {
          action: "Création établissement",
          status: "success",
          title: `SIRET ${input.siret} enregistré`,
          details: result,
        },
      };
    },
```

**enroll_fr** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.siret) {
        throw new Error("[einvoice_config_enroll_fr] 'siret' is required");
      }
      const siret = input.siret as string;
      const siren = (input.siren as string) ?? siret.slice(0, 9);
      const result = await ctx.adapter.enrollFrench({ siret, siren });
      return {
        content: `Entité ${siret} enrollée sur le PPF`,
        structuredContent: {
          action: "Enrollment PPF",
          status: "success",
          title: `SIRET ${siret} enrollé`,
          details: result,
          nextAction: {
            label: "Enregistrer sur le réseau",
            toolName: "einvoice_config_network_register_by_id",
            arguments: { scheme: "0009", value: siret, network: "DOMESTIC_FR" },
          },
        },
      };
    },
```

**entity_claim:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value) {
        throw new Error("[einvoice_config_entity_claim] 'scheme' and 'value' are required");
      }
      const result = await ctx.adapter.claimBusinessEntityByIdentifier(
        input.scheme as string, input.value as string, {},
      );
      return {
        content: `Entité revendiquée (${input.scheme}:${input.value})`,
        structuredContent: {
          action: "Revendication entité",
          status: "success",
          title: `${input.scheme}:${input.value} revendiqué`,
          details: result,
        },
      };
    },
```

**entity_delete:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_config_entity_delete] 'id' is required");
      }
      const result = await ctx.adapter.deleteBusinessEntity(input.id as string);
      return {
        content: `Entité ${input.id} supprimée`,
        structuredContent: {
          action: "Suppression entité",
          status: "success",
          title: `Entité supprimée`,
          details: result ?? { entityId: input.id },
        },
      };
    },
```

**network_register** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.identifier_id || !input.network) {
        throw new Error("[einvoice_config_network_register] 'identifier_id' and 'network' are required");
      }
      const result = await ctx.adapter.registerNetwork(
        input.identifier_id as string, input.network as string,
      );
      return {
        content: `Identifiant enregistré sur ${input.network}`,
        structuredContent: {
          action: "Enregistrement réseau",
          status: "success",
          title: `Enregistré sur ${input.network}`,
          details: result,
        },
      };
    },
```

**network_register_by_id** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value || !input.network) {
        throw new Error("[einvoice_config_network_register_by_id] 'scheme', 'value', and 'network' are required");
      }
      const result = await ctx.adapter.registerNetworkByScheme(
        input.scheme as string, input.value as string, input.network as string,
      );
      return {
        content: `${input.scheme}:${input.value} enregistré sur ${input.network}`,
        structuredContent: {
          action: "Enregistrement réseau",
          status: "success",
          title: `${input.scheme}:${input.value} → ${input.network}`,
          details: result,
        },
      };
    },
```

**identifier_create** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.entity_id || !input.scheme || !input.value || !input.type) {
        throw new Error("[einvoice_config_identifier_create] 'entity_id', 'scheme', 'value', and 'type' are required");
      }
      const result = await ctx.adapter.createIdentifier(input.entity_id as string, {
        scheme: input.scheme as string,
        value: input.value as string,
        type: input.type as string,
      });
      return {
        content: `Identifiant ${input.scheme}:${input.value} ajouté`,
        structuredContent: {
          action: "Création identifiant",
          status: "success",
          title: `${input.scheme}:${input.value} ajouté`,
          details: result,
          nextAction: {
            label: "Enregistrer sur le réseau",
            toolName: "einvoice_config_network_register",
          },
        },
      };
    },
```

**identifier_create_by_scheme** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.lookup_scheme || !input.lookup_value || !input.new_scheme || !input.new_value) {
        throw new Error("[einvoice_config_identifier_create_by_scheme] all fields are required");
      }
      const result = await ctx.adapter.createIdentifierByScheme(
        input.lookup_scheme as string, input.lookup_value as string,
        { scheme: input.new_scheme as string, value: input.new_value as string },
      );
      return {
        content: `Identifiant ${input.new_scheme}:${input.new_value} ajouté`,
        structuredContent: {
          action: "Création identifiant",
          status: "success",
          title: `${input.new_scheme}:${input.new_value} ajouté`,
          details: result,
        },
      };
    },
```

**identifier_delete:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.identifier_id) {
        throw new Error("[einvoice_config_identifier_delete] 'identifier_id' is required");
      }
      const result = await ctx.adapter.deleteIdentifier(input.identifier_id as string);
      return {
        content: `Identifiant ${input.identifier_id} supprimé`,
        structuredContent: {
          action: "Suppression identifiant",
          status: "success",
          title: "Identifiant supprimé",
          details: result ?? { identifierId: input.identifier_id },
        },
      };
    },
```

**entity_configure** (already has `_meta`):
```typescript
    handler: async (input, ctx) => {
      if (!input.entity_id) {
        throw new Error("[einvoice_config_entity_configure] 'entity_id' is required");
      }
      const config: Record<string, unknown> = {};
      if (input.vat_regime) config.vatRegime = input.vat_regime;
      const result = await ctx.adapter.configureBusinessEntity(
        input.entity_id as string, config,
      );
      return {
        content: `Entité ${input.entity_id} configurée`,
        structuredContent: {
          action: "Configuration entité",
          status: "success",
          title: "Configuration mise à jour",
          details: result,
        },
      };
    },
```

**claim_delete:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.entity_id) {
        throw new Error("[einvoice_config_claim_delete] 'entity_id' is required");
      }
      const result = await ctx.adapter.deleteClaim(input.entity_id as string);
      return {
        content: `Revendication supprimée pour ${input.entity_id}`,
        structuredContent: {
          action: "Suppression revendication",
          status: "success",
          title: "Revendication retirée",
          details: result ?? { entityId: input.entity_id },
        },
      };
    },
```

**network_unregister:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.directory_id) {
        throw new Error("[einvoice_config_network_unregister] 'directory_id' is required");
      }
      const result = await ctx.adapter.unregisterNetwork(input.directory_id as string);
      return {
        content: `Désinscription réseau effectuée`,
        structuredContent: {
          action: "Désinscription réseau",
          status: "success",
          title: "Identifiant désinscrit du réseau",
          details: result ?? { directoryId: input.directory_id },
        },
      };
    },
```

- [ ] **Step 4: Run config tests**

Run: `deno test packages/mcp/src/tools/config_test.ts`

Expected: ALL PASS (existing tests may need updating if they assert on raw return shapes)

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools/config.ts packages/mcp/src/tools/config_test.ts
git commit -m "feat: add structuredContent to all config mutation tools

13 config tools now return { content, structuredContent } with
action-result viewer data. _meta added where missing."
```

---

### Task 3: Webhook tools (3 mutation + 1 detail)

**Files:**
- Modify: `packages/mcp/src/tools/webhook.ts`
- Test: `packages/mcp/src/tools/webhook_test.ts`

- [ ] **Step 1: Write failing test for webhook_create**

```typescript
Deno.test("einvoice_webhook_create returns action-result structuredContent", async () => {
  const mockResult = { id: "wh-1", url: "https://example.com/hook", active: true };
  const { adapter } = createMockAdapter(mockResult);
  const tool = webhookTools.find((t) => t.name === "einvoice_webhook_create")!;
  const result = await tool.handler(
    { url: "https://example.com/hook", events: ["invoice.received"] },
    { adapter },
  ) as { content: string; structuredContent: Record<string, unknown> };
  assertEquals(result.structuredContent.action, "Création webhook");
  assertEquals(result.structuredContent.status, "success");
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `deno test packages/mcp/src/tools/webhook_test.ts --filter "webhook_create"`
Expected: FAIL

- [ ] **Step 3: Implement all 4 webhook tools**

**webhook_get:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_get] 'id' is required");
      }
      const webhook = await ctx.adapter.getWebhook(input.id as string) as Record<string, unknown>;
      const name = webhook?.name ?? webhook?.url ?? input.id;
      return {
        content: `Webhook : ${name}`,
        structuredContent: webhook,
      };
    },
```

**webhook_create:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.url || !input.events) {
        throw new Error("[einvoice_webhook_create] 'url' and 'events' are required");
      }
      const result = await ctx.adapter.createWebhook({
        url: input.url as string,
        events: input.events as string[],
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
      return {
        content: `Webhook créé → ${input.url}`,
        structuredContent: {
          action: "Création webhook",
          status: "success",
          title: `Webhook configuré pour ${(input.events as string[]).length} événement(s)`,
          details: result,
        },
      };
    },
```

**webhook_update:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_update] 'id' is required");
      }
      const result = await ctx.adapter.updateWebhook(input.id as string, {
        url: input.url as string | undefined,
        events: input.events as string[] | undefined,
        name: input.name as string | undefined,
        active: input.active as boolean | undefined,
      });
      return {
        content: `Webhook ${input.id} mis à jour`,
        structuredContent: {
          action: "Mise à jour webhook",
          status: "success",
          title: "Webhook mis à jour",
          details: result,
        },
      };
    },
```

**webhook_delete:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_webhook_delete] 'id' is required");
      }
      const result = await ctx.adapter.deleteWebhook(input.id as string);
      return {
        content: `Webhook ${input.id} supprimé`,
        structuredContent: {
          action: "Suppression webhook",
          status: "success",
          title: "Webhook supprimé",
          details: result ?? { webhookId: input.id },
        },
      };
    },
```

- [ ] **Step 4: Run webhook tests**

Run: `deno test packages/mcp/src/tools/webhook_test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools/webhook.ts packages/mcp/src/tools/webhook_test.ts
git commit -m "feat: add structuredContent to all webhook tools"
```

---

### Task 4: Status + Reporting tools (3 mutation tools)

**Files:**
- Modify: `packages/mcp/src/tools/status.ts`
- Modify: `packages/mcp/src/tools/reporting.ts`
- Test: `packages/mcp/src/tools/status_test.ts`
- Test: `packages/mcp/src/tools/reporting_test.ts`

- [ ] **Step 1: Write failing test for status_send**

```typescript
Deno.test("einvoice_status_send returns action-result structuredContent", async () => {
  const mockResult = { ok: true, invoiceId: "inv-1" };
  const { adapter } = createMockAdapter(mockResult);
  const tool = statusTools.find((t) => t.name === "einvoice_status_send")!;
  const result = await tool.handler(
    { invoice_id: "inv-1", code: "APPROVED" },
    { adapter },
  ) as { content: string; structuredContent: Record<string, unknown> };
  assertEquals(result.structuredContent.action, "Envoi statut");
  assertStringIncludes(result.content, "APPROVED");
});
```

- [ ] **Step 2: Implement status_send**

```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.invoice_id || !input.code) {
        throw new Error("[einvoice_status_send] 'invoice_id' and 'code' are required");
      }
      const result = await ctx.adapter.sendStatus({
        invoiceId: input.invoice_id as string,
        code: input.code as string,
        message: input.message as string | undefined,
        payment: input.payment as Record<string, unknown> | undefined,
      });
      return {
        content: `Statut ${input.code} envoyé pour facture ${input.invoice_id}`,
        structuredContent: {
          action: "Envoi statut",
          status: "success",
          title: `${input.code} → facture ${input.invoice_id}`,
          details: result,
          nextAction: {
            label: "Voir l'historique des statuts",
            toolName: "einvoice_status_history",
            arguments: { invoice_id: input.invoice_id },
          },
        },
      };
    },
```

- [ ] **Step 3: Implement both reporting tools**

**reporting_invoice_transaction:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.transaction) {
        throw new Error("[einvoice_reporting_invoice_transaction] 'transaction' is required");
      }
      const result = await ctx.adapter.reportInvoiceTransaction(
        input.transaction as Record<string, unknown>,
      );
      return {
        content: "Transaction facture déclarée (e-reporting)",
        structuredContent: {
          action: "Déclaration e-reporting",
          status: "success",
          title: "Transaction facture déclarée à la DGFiP",
          details: result,
        },
      };
    },
```

**reporting_transaction:**
```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      if (!input.business_entity_id || !input.transaction) {
        throw new Error("[einvoice_reporting_transaction] 'business_entity_id' and 'transaction' are required");
      }
      const result = await ctx.adapter.reportTransaction(
        input.business_entity_id as string,
        input.transaction as Record<string, unknown>,
      );
      return {
        content: `Transaction déclarée pour entité ${input.business_entity_id}`,
        structuredContent: {
          action: "Déclaration e-reporting",
          status: "success",
          title: "Transaction déclarée à la DGFiP",
          details: result,
        },
      };
    },
```

- [ ] **Step 4: Run tests**

Run: `deno test packages/mcp/src/tools/status_test.ts && deno test packages/mcp/src/tools/reporting_test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools/status.ts packages/mcp/src/tools/reporting.ts packages/mcp/src/tools/status_test.ts packages/mcp/src/tools/reporting_test.ts
git commit -m "feat: add structuredContent to status_send and reporting tools"
```

---

### Task 5: Invoice tools (submit, files, attachments)

**Files:**
- Modify: `packages/mcp/src/tools/invoice.ts`
- Test: `packages/mcp/src/tools/invoice_test.ts`

- [ ] **Step 1: Write failing test for invoice_submit**

```typescript
Deno.test("einvoice_invoice_submit returns action-result structuredContent", async () => {
  const mockResult = { invoiceId: "inv-new", trackingId: "trk-1" };
  const { adapter } = createMockAdapter(mockResult);
  const tool = invoiceTools.find((t) => t.name === "einvoice_invoice_submit")!;
  const result = await tool.handler(
    { file_base64: btoa("test"), filename: "test.xml" },
    { adapter },
  ) as { content: string; structuredContent: Record<string, unknown> };
  assertEquals(result.structuredContent.action, "Émission facture");
  assertEquals(result.structuredContent.status, "success");
});
```

- [ ] **Step 2: Implement invoice_submit**

Both paths (generated_id and file_base64) should wrap the result:

```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/action-result" } },
    handler: async (input, ctx) => {
      let emitResult: unknown;

      // Path 1: retrieve from temp store
      if (input.generated_id) {
        const stored = getGenerated(input.generated_id as string);
        if (!stored) {
          throw new Error(
            "[einvoice_invoice_submit] Generated file expired or not found. Regenerate the invoice first.",
          );
        }
        emitResult = await ctx.adapter.emitInvoice(stored);
      } else {
        // Path 2: direct base64 upload
        if (!input.file_base64 || !input.filename) {
          throw new Error(
            "[einvoice_invoice_submit] Provide either 'generated_id' or both 'file_base64' and 'filename'",
          );
        }
        const filename = input.filename as string;
        const lower = filename.toLowerCase();
        if (!lower.endsWith(".pdf") && !lower.endsWith(".xml")) {
          throw new Error("[einvoice_invoice_submit] filename must end in .pdf or .xml");
        }
        let binaryString: string;
        try {
          binaryString = atob(input.file_base64 as string);
        } catch {
          throw new Error("[einvoice_invoice_submit] 'file_base64' is not valid base64");
        }
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        emitResult = await ctx.adapter.emitInvoice({ file: bytes, filename });
      }

      return {
        content: "Facture émise avec succès",
        structuredContent: {
          action: "Émission facture",
          status: "success",
          title: "Facture déposée sur la plateforme",
          details: emitResult,
        },
      };
    },
```

- [ ] **Step 3: Implement invoice_files (Pattern B — doclist)**

```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_files] 'id' is required");
      }
      const raw = await ctx.adapter.getInvoiceFiles(input.id as string) as unknown;
      const files = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.files ?? [raw]);
      // deno-lint-ignore no-explicit-any
      const data = (files as any[]).map((f) => ({
        _id: f.fileId ?? f.id,
        "Nom": f.filename ?? f.name ?? "—",
        "Type": f.contentType ?? f.type ?? "—",
        "Taille": f.size ? `${Math.round(f.size / 1024)} Ko` : "—",
      }));
      return {
        content: `${data.length} fichier(s) pour la facture ${input.id}`,
        structuredContent: {
          data,
          count: data.length,
          _title: `Fichiers — Facture ${input.id}`,
          _rowAction: {
            toolName: "einvoice_invoice_download_file",
            idField: "_id",
            argName: "file_id",
          },
        },
      };
    },
```

- [ ] **Step 4: Implement invoice_attachments (Pattern B — doclist)**

```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/doclist-viewer" } },
    handler: async (input, ctx) => {
      if (!input.id) {
        throw new Error("[einvoice_invoice_attachments] 'id' is required");
      }
      const raw = await ctx.adapter.getAttachments(input.id as string) as unknown;
      const attachments = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.attachments ?? [raw]);
      // deno-lint-ignore no-explicit-any
      const data = (attachments as any[]).map((a) => ({
        _id: a.fileId ?? a.id,
        "Nom": a.filename ?? a.name ?? "—",
        "Type": a.contentType ?? a.type ?? "—",
        "Taille": a.size ? `${Math.round(a.size / 1024)} Ko` : "—",
      }));
      return {
        content: `${data.length} pièce(s) jointe(s) pour la facture ${input.id}`,
        structuredContent: {
          data,
          count: data.length,
          _title: `Pièces jointes — Facture ${input.id}`,
          _rowAction: {
            toolName: "einvoice_invoice_download_file",
            idField: "_id",
            argName: "file_id",
          },
        },
      };
    },
```

- [ ] **Step 5: Run invoice tests**

Run: `deno test packages/mcp/src/tools/invoice_test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/invoice.ts packages/mcp/src/tools/invoice_test.ts
git commit -m "feat: add structuredContent to invoice submit/files/attachments tools"
```

---

### Task 6: Directory tools (int_search + peppol_check)

**Files:**
- Modify: `packages/mcp/src/tools/directory.ts`
- Test: `packages/mcp/src/tools/directory_test.ts`

- [ ] **Step 1: Implement directory_int_search (already has _meta)**

Follow the exact same pattern as `directory_fr_search`:

```typescript
    handler: async (input, ctx) => {
      if (!input.value) {
        throw new Error("[einvoice_directory_int_search] 'value' is required");
      }
      const result = await ctx.adapter.searchDirectoryInt({
        value: input.value as string,
        offset: input.offset as number | undefined,
        limit: input.limit as number | undefined,
      }) as { rows?: unknown[]; count?: number; [key: string]: unknown };

      // Normalize: adapter may return { rows, count } or raw array
      const rows = result.rows ?? (Array.isArray(result) ? result : []);
      const count = result.count ?? (rows as unknown[]).length;

      // deno-lint-ignore no-explicit-any
      const data = (rows as any[]).map((r) => ({
        _id: r.participantId ?? r.id ?? r.identifier,
        _detail: r,
        "Identifiant": r.identifier ?? r.value ?? "—",
        "Schéma": r.scheme ?? "—",
        "Pays": r.country ?? "—",
        "Nom": r.name ?? "—",
      }));
      return {
        content: `${(rows as unknown[]).length} participant(s) trouvé(s) pour "${input.value}"`,
        structuredContent: {
          data,
          count,
          _title: "Annuaire international (Peppol)",
        },
      };
    },
```

- [ ] **Step 2: Implement directory_peppol_check**

```typescript
    _meta: { ui: { resourceUri: "ui://mcp-einvoice/directory-card" } },
    handler: async (input, ctx) => {
      if (!input.scheme || !input.value) {
        throw new Error("[einvoice_directory_peppol_check] 'scheme' and 'value' are required");
      }
      const result = await ctx.adapter.checkPeppolParticipant(
        input.scheme as string, input.value as string,
      ) as Record<string, unknown>;
      const exists = result?.exists ?? result?.found ?? !!result;
      return {
        content: exists
          ? `Participant ${input.value} trouvé sur Peppol`
          : `Participant ${input.value} non trouvé sur Peppol`,
        structuredContent: result,
      };
    },
```

- [ ] **Step 3: Run directory tests**

Run: `deno test packages/mcp/src/tools/directory_test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/src/tools/directory.ts packages/mcp/src/tools/directory_test.ts
git commit -m "feat: add structuredContent to directory int_search and peppol_check"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
deno task test
```

Expected: ALL PASS across all packages.

- [ ] **Step 2: Verify tool count**

Quick sanity check — grep for structuredContent in all tool files:

```bash
grep -c "structuredContent" packages/mcp/src/tools/config.ts packages/mcp/src/tools/webhook.ts packages/mcp/src/tools/status.ts packages/mcp/src/tools/reporting.ts packages/mcp/src/tools/invoice.ts packages/mcp/src/tools/directory.ts
```

Expected: total should be 39 (one per tool).

- [ ] **Step 3: Verify _meta coverage**

```bash
grep -c "resourceUri" packages/mcp/src/tools/config.ts packages/mcp/src/tools/webhook.ts packages/mcp/src/tools/status.ts packages/mcp/src/tools/reporting.ts packages/mcp/src/tools/invoice.ts packages/mcp/src/tools/directory.ts
```

Expected: at least 35+ (some tools like customer_id and download tools may not need a viewer).
