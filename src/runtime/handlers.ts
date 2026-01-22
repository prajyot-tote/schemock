/**
 * MSW Handlers Generator - REST handlers for all CRUD operations
 *
 * Generates MSW (Mock Service Worker) HTTP handlers from entity schemas,
 * enabling automatic request interception for the MockAdapter.
 *
 * @module runtime/handlers
 * @category Runtime
 */

import { http, HttpResponse } from 'msw';
import type { EntitySchema } from '../schema/types';

// Use inferred type for MSW handler to avoid tsup DTS resolution issues
type HttpHandler = ReturnType<typeof http.get>;
import type { Adapter, AdapterContext } from '../adapters/types';

/**
 * Handler options for customizing MSW behavior.
 */
export interface HandlerOptions {
  /** Base URL for API endpoints */
  baseUrl?: string;
  /** Whether to log requests */
  quiet?: boolean;
}

/**
 * Create MSW REST handlers for all CRUD operations on entity schemas.
 *
 * Generates handlers for:
 * - GET /{entity} - List all entities
 * - GET /{entity}/:id - Get single entity
 * - POST /{entity} - Create new entity
 * - PUT /{entity}/:id - Update entity
 * - PATCH /{entity}/:id - Partial update entity
 * - DELETE /{entity}/:id - Delete entity
 *
 * @param schemas - Array of entity schemas to create handlers for
 * @param adapter - The adapter to use for operations
 * @param options - Handler configuration options
 * @returns Array of MSW HTTP handlers
 *
 * @example
 * ```typescript
 * import { createHandlers } from 'schemock/runtime';
 * import { setupWorker } from 'msw/browser';
 *
 * const handlers = createHandlers([userSchema, postSchema], mockAdapter, {
 *   baseUrl: '/api',
 * });
 *
 * const worker = setupWorker(...handlers);
 * await worker.start();
 * ```
 */
export function createHandlers(
  schemas: EntitySchema[],
  adapter: Adapter,
  options?: HandlerOptions
): HttpHandler[] {
  const handlers: HttpHandler[] = [];
  const baseUrl = options?.baseUrl ?? '/api';

  for (const schema of schemas) {
    const entityPath = getEntityPath(schema, baseUrl);

    // List handler - GET /api/{entity}
    handlers.push(createListHandler(schema, entityPath, adapter));

    // Get handler - GET /api/{entity}/:id
    handlers.push(createGetHandler(schema, entityPath, adapter));

    // Create handler - POST /api/{entity}
    handlers.push(createCreateHandler(schema, entityPath, adapter));

    // Update handler - PUT /api/{entity}/:id
    handlers.push(createUpdateHandler(schema, entityPath, adapter, 'PUT'));

    // Partial update handler - PATCH /api/{entity}/:id
    handlers.push(createUpdateHandler(schema, entityPath, adapter, 'PATCH'));

    // Delete handler - DELETE /api/{entity}/:id
    handlers.push(createDeleteHandler(schema, entityPath, adapter));

    // Add custom operation handlers if defined in schema
    if (schema.api?.operations) {
      handlers.push(
        ...createCustomHandlers(schema, entityPath, adapter)
      );
    }
  }

  return handlers;
}

/**
 * Get the API path for an entity.
 */
function getEntityPath(schema: EntitySchema, baseUrl: string): string {
  if (schema.api?.basePath) {
    return schema.api.basePath;
  }
  // Pluralize entity name (simple: add 's')
  const plural = schema.name.endsWith('s')
    ? schema.name
    : `${schema.name}s`;
  return `${baseUrl}/${plural}`;
}

/**
 * Create list handler - GET /api/{entity}
 */
function createListHandler(
  schema: EntitySchema,
  path: string,
  adapter: Adapter
): HttpHandler {
  return http.get(path, async ({ request }) => {
    const url = new URL(request.url);
    const ctx: AdapterContext = {
      entity: schema.name,
      endpoint: path,
      params: {},
      filter: parseQueryFilter(url.searchParams),
      limit: parseNumber(url.searchParams.get('limit')),
      offset: parseNumber(url.searchParams.get('offset')),
      orderBy: parseOrderBy(url.searchParams.get('orderBy')),
    };

    const result = await adapter.findMany(ctx);

    if (result.error) {
      return HttpResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    return HttpResponse.json({
      data: result.data,
      meta: result.meta,
    });
  });
}

/**
 * Create get handler - GET /api/{entity}/:id
 */
function createGetHandler(
  schema: EntitySchema,
  path: string,
  adapter: Adapter
): HttpHandler {
  return http.get(`${path}/:id`, async ({ params }) => {
    const ctx: AdapterContext = {
      entity: schema.name,
      endpoint: path,
      params: { id: params.id as string },
    };

    const result = await adapter.findOne(ctx);

    if (result.error) {
      return HttpResponse.json(
        { error: result.error.message },
        { status: 404 }
      );
    }

    if (!result.data) {
      return HttpResponse.json(
        { error: `${schema.name} not found` },
        { status: 404 }
      );
    }

    return HttpResponse.json({ data: result.data });
  });
}

/**
 * Create create handler - POST /api/{entity}
 */
function createCreateHandler(
  schema: EntitySchema,
  path: string,
  adapter: Adapter
): HttpHandler {
  return http.post(path, async ({ request }) => {
    const body = await request.json();

    const ctx: AdapterContext = {
      entity: schema.name,
      endpoint: path,
      data: body,
    };

    const result = await adapter.create(ctx);

    if (result.error) {
      return HttpResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    return HttpResponse.json({ data: result.data }, { status: 201 });
  });
}

/**
 * Create update handler - PUT/PATCH /api/{entity}/:id
 */
function createUpdateHandler(
  schema: EntitySchema,
  path: string,
  adapter: Adapter,
  method: 'PUT' | 'PATCH'
): HttpHandler {
  const handler = method === 'PUT' ? http.put : http.patch;

  return handler(`${path}/:id`, async ({ params, request }) => {
    const body = await request.json();

    const ctx: AdapterContext = {
      entity: schema.name,
      endpoint: path,
      params: { id: params.id as string },
      data: body,
    };

    const result = await adapter.update(ctx);

    if (result.error) {
      return HttpResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    if (!result.data) {
      return HttpResponse.json(
        { error: `${schema.name} not found` },
        { status: 404 }
      );
    }

    return HttpResponse.json({ data: result.data });
  });
}

/**
 * Create delete handler - DELETE /api/{entity}/:id
 */
function createDeleteHandler(
  schema: EntitySchema,
  path: string,
  adapter: Adapter
): HttpHandler {
  return http.delete(`${path}/:id`, async ({ params }) => {
    const ctx: AdapterContext = {
      entity: schema.name,
      endpoint: path,
      params: { id: params.id as string },
    };

    const result = await adapter.delete(ctx);

    if (result.error) {
      return HttpResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    return new HttpResponse(null, { status: 204 });
  });
}

/**
 * Create custom operation handlers from schema API config.
 */
function createCustomHandlers(
  schema: EntitySchema,
  basePath: string,
  adapter: Adapter
): HttpHandler[] {
  const handlers: HttpHandler[] = [];
  const operations = schema.api?.operations || {};

  for (const [name, config] of Object.entries(operations)) {
    // Skip boolean config values (enable/disable flags)
    if (typeof config === 'boolean') continue;
    if (!config || typeof config !== 'object') continue;

    const customConfig = config as { method: string; path: string; params?: string[] };
    const method = customConfig.method?.toLowerCase() || 'get';
    const path = `${basePath}${customConfig.path || `/${name}`}`;

    const httpMethod = http[method as keyof typeof http];
    if (typeof httpMethod !== 'function') continue;

    handlers.push(
      (httpMethod as typeof http.get)(path, async ({ request, params }) => {
        const ctx: AdapterContext = {
          entity: schema.name,
          endpoint: path,
          operation: name,
          params: params as Record<string, unknown>,
        };

        if (method === 'post' || method === 'put' || method === 'patch') {
          ctx.data = await request.json();
        }

        if (adapter.custom) {
          const result = await adapter.custom(ctx);
          if (result.error) {
            return HttpResponse.json(
              { error: result.error.message },
              { status: 400 }
            );
          }
          return HttpResponse.json({ data: result.data });
        }

        return HttpResponse.json(
          { error: 'Custom operations not supported by adapter' },
          { status: 501 }
        );
      })
    );
  }

  return handlers;
}

/**
 * Parse query string filter parameters.
 */
function parseQueryFilter(
  params: URLSearchParams
): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};
  let hasFilter = false;

  for (const [key, value] of params.entries()) {
    // Skip pagination and ordering params
    if (['limit', 'offset', 'orderBy', 'select'].includes(key)) continue;

    // Handle filter[field] syntax
    if (key.startsWith('filter[') && key.endsWith(']')) {
      const field = key.slice(7, -1);
      filter[field] = parseValue(value);
      hasFilter = true;
    }
    // Handle simple field=value syntax
    else if (!key.includes('[')) {
      filter[key] = parseValue(value);
      hasFilter = true;
    }
  }

  return hasFilter ? filter : undefined;
}

/**
 * Parse orderBy query parameter.
 */
function parseOrderBy(
  value: string | null
): Record<string, 'asc' | 'desc'> | undefined {
  if (!value) return undefined;

  const orderBy: Record<string, 'asc' | 'desc'> = {};

  for (const part of value.split(',')) {
    const [field, direction] = part.split(':');
    if (field) {
      orderBy[field] = direction === 'desc' ? 'desc' : 'asc';
    }
  }

  return Object.keys(orderBy).length > 0 ? orderBy : undefined;
}

/**
 * Parse a number from string.
 */
function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse a query parameter value to appropriate type.
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  const num = Number(value);
  if (!isNaN(num)) return num;

  // String
  return value;
}
