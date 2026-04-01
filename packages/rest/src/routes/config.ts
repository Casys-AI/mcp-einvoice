/**
 * Config, Entity, and Identifier routes for the E-Invoice REST API.
 *
 * Registers 18 routes using @hono/zod-openapi.
 * Static entity paths (/legal-unit, /office, /claim-by-identifier, /enroll/*)
 * are registered BEFORE parametric /{id} paths to avoid accidental matches.
 *
 * @module einvoice-rest/src/routes/config
 */

import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EInvoiceAdapter } from "@casys/einvoice-core";

export function registerConfigRoutes(
  app: OpenAPIHono,
  adapter: EInvoiceAdapter,
): void {
  // ─── GET /api/config/customer-id ────────────────────────
  const getCustomerIdRoute = createRoute({
    method: "get",
    path: "/api/config/customer-id",
    tags: ["Config"],
    responses: { 200: { description: "Customer ID" } },
  });

  app.openapi(getCustomerIdRoute, async (c) => {
    const result = await adapter.getCustomerId();
    return c.json(result, 200);
  });

  // ─── GET /api/entities ───────────────────────────────────
  const listEntitiesRoute = createRoute({
    method: "get",
    path: "/api/entities",
    tags: ["Entities"],
    responses: { 200: { description: "List of business entities" } },
  });

  app.openapi(listEntitiesRoute, async (c) => {
    const result = await adapter.listBusinessEntities();
    return c.json(result, 200);
  });

  // ─── POST /api/entities/legal-unit ──────────────────────
  // Static path — must be BEFORE /{id}
  const createLegalUnitRoute = createRoute({
    method: "post",
    path: "/api/entities/legal-unit",
    tags: ["Entities"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Legal unit created" } },
  });

  app.openapi(createLegalUnitRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.createLegalUnit(body);
    return c.json(result, 200);
  });

  // ─── POST /api/entities/office ───────────────────────────
  // Static path — must be BEFORE /{id}
  const createOfficeRoute = createRoute({
    method: "post",
    path: "/api/entities/office",
    tags: ["Entities"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Office created" } },
  });

  app.openapi(createOfficeRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.createOffice(body);
    return c.json(result, 200);
  });

  // ─── POST /api/entities/claim-by-identifier ──────────────
  // Static path — must be BEFORE /{id}
  const claimByIdentifierRoute = createRoute({
    method: "post",
    path: "/api/entities/claim-by-identifier",
    tags: ["Entities"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scheme: z.string(),
              value: z.string(),
              data: z.record(z.unknown()).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Entity claimed by identifier" } },
  });

  app.openapi(claimByIdentifierRoute, async (c) => {
    const { scheme, value, data } = c.req.valid("json");
    const result = await adapter.claimBusinessEntityByIdentifier(
      scheme,
      value,
      data ?? {},
    );
    return c.json(result, 200);
  });

  // ─── POST /api/entities/enroll/french ────────────────────
  // Static path — must be BEFORE /{id}
  const enrollFrenchRoute = createRoute({
    method: "post",
    path: "/api/entities/enroll/french",
    tags: ["Entities"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "French enrollment completed" } },
  });

  app.openapi(enrollFrenchRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.enrollFrench(body);
    return c.json(result, 200);
  });

  // ─── POST /api/entities/enroll/international ─────────────
  // Static path — must be BEFORE /{id}
  const enrollInternationalRoute = createRoute({
    method: "post",
    path: "/api/entities/enroll/international",
    tags: ["Entities"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "International enrollment completed" } },
  });

  app.openapi(enrollInternationalRoute, async (c) => {
    const body = c.req.valid("json");
    const result = await adapter.enrollInternational(body);
    return c.json(result, 200);
  });

  // ─── GET /api/entities/{id} ──────────────────────────────
  const getEntityRoute = createRoute({
    method: "get",
    path: "/api/entities/{id}",
    tags: ["Entities"],
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: { 200: { description: "Business entity detail" } },
  });

  app.openapi(getEntityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.getBusinessEntity(id);
    return c.json(result, 200);
  });

  // ─── DELETE /api/entities/{id} ───────────────────────────
  const deleteEntityRoute = createRoute({
    method: "delete",
    path: "/api/entities/{id}",
    tags: ["Entities"],
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: { 200: { description: "Business entity deleted" } },
  });

  app.openapi(deleteEntityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await adapter.deleteBusinessEntity(id);
    return c.json(result, 200);
  });

  // ─── PUT /api/entities/{id}/configure ────────────────────
  const configureEntityRoute = createRoute({
    method: "put",
    path: "/api/entities/{id}/configure",
    tags: ["Entities"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Business entity configured" } },
  });

  app.openapi(configureEntityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.configureBusinessEntity(id, body);
    return c.json(result, 200);
  });

  // ─── POST /api/entities/{id}/claim ───────────────────────
  const claimEntityRoute = createRoute({
    method: "post",
    path: "/api/entities/{id}/claim",
    tags: ["Entities"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Business entity claimed" } },
  });

  app.openapi(claimEntityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.claimBusinessEntity(id, body);
    return c.json(result, 200);
  });

  // ─── DELETE /api/entities/{entityId}/claim ───────────────
  const deleteClaimRoute = createRoute({
    method: "delete",
    path: "/api/entities/{entityId}/claim",
    tags: ["Entities"],
    request: {
      params: z.object({ entityId: z.string() }),
    },
    responses: { 200: { description: "Claim deleted" } },
  });

  app.openapi(deleteClaimRoute, async (c) => {
    const { entityId } = c.req.valid("param");
    const result = await adapter.deleteClaim(entityId);
    return c.json(result, 200);
  });

  // ─── POST /api/entities/{entityId}/identifiers ───────────
  const createIdentifierRoute = createRoute({
    method: "post",
    path: "/api/entities/{entityId}/identifiers",
    tags: ["Identifiers"],
    request: {
      params: z.object({ entityId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.record(z.unknown()),
          },
        },
      },
    },
    responses: { 200: { description: "Identifier created" } },
  });

  app.openapi(createIdentifierRoute, async (c) => {
    const { entityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await adapter.createIdentifier(entityId, body);
    return c.json(result, 200);
  });

  // ─── POST /api/identifiers/by-scheme ────────────────────
  // Static path — must be BEFORE /{identifierId}
  const createIdentifierBySchemeRoute = createRoute({
    method: "post",
    path: "/api/identifiers/by-scheme",
    tags: ["Identifiers"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scheme: z.string(),
              value: z.string(),
              data: z.record(z.unknown()).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Identifier created by scheme" } },
  });

  app.openapi(createIdentifierBySchemeRoute, async (c) => {
    const { scheme, value, data } = c.req.valid("json");
    const result = await adapter.createIdentifierByScheme(
      scheme,
      value,
      data ?? {},
    );
    return c.json(result, 200);
  });

  // ─── POST /api/identifiers/register-network-by-scheme ────
  // Static path — must be BEFORE /{identifierId}
  const registerNetworkBySchemeRoute = createRoute({
    method: "post",
    path: "/api/identifiers/register-network-by-scheme",
    tags: ["Identifiers"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scheme: z.string(),
              value: z.string(),
              network: z.string(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Network registered by scheme" } },
  });

  app.openapi(registerNetworkBySchemeRoute, async (c) => {
    const { scheme, value, network } = c.req.valid("json");
    const result = await adapter.registerNetworkByScheme(scheme, value, network);
    return c.json(result, 200);
  });

  // ─── POST /api/identifiers/{identifierId}/register-network ─
  const registerNetworkRoute = createRoute({
    method: "post",
    path: "/api/identifiers/{identifierId}/register-network",
    tags: ["Identifiers"],
    request: {
      params: z.object({ identifierId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              network: z.string(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Network registered" } },
  });

  app.openapi(registerNetworkRoute, async (c) => {
    const { identifierId } = c.req.valid("param");
    const { network } = c.req.valid("json");
    const result = await adapter.registerNetwork(identifierId, network);
    return c.json(result, 200);
  });

  // ─── DELETE /api/identifiers/network/{directoryId} ───────
  const unregisterNetworkRoute = createRoute({
    method: "delete",
    path: "/api/identifiers/network/{directoryId}",
    tags: ["Identifiers"],
    request: {
      params: z.object({ directoryId: z.string() }),
    },
    responses: { 200: { description: "Network unregistered" } },
  });

  app.openapi(unregisterNetworkRoute, async (c) => {
    const { directoryId } = c.req.valid("param");
    const result = await adapter.unregisterNetwork(directoryId);
    return c.json(result, 200);
  });

  // ─── DELETE /api/identifiers/{identifierId} ──────────────
  const deleteIdentifierRoute = createRoute({
    method: "delete",
    path: "/api/identifiers/{identifierId}",
    tags: ["Identifiers"],
    request: {
      params: z.object({ identifierId: z.string() }),
    },
    responses: { 200: { description: "Identifier deleted" } },
  });

  app.openapi(deleteIdentifierRoute, async (c) => {
    const { identifierId } = c.req.valid("param");
    const result = await adapter.deleteIdentifier(identifierId);
    return c.json(result, 200);
  });
}
