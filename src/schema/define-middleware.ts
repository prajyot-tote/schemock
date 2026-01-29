/**
 * API for defining custom middleware with handlers.
 * Enables creation of reusable middleware that works across all backend frameworks.
 *
 * @module schema/define-middleware
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineMiddleware, field } from 'schemock/schema';
 *
 * // Simple middleware without config
 * const RequestIdMiddleware = defineMiddleware('request-id', {
 *   handler: async ({ ctx, next }) => {
 *     const requestId = ctx.headers['x-request-id'] || crypto.randomUUID();
 *     ctx.metadata.requestId = requestId;
 *     const result = await next();
 *     return {
 *       ...result,
 *       response: result?.response ? {
 *         ...result.response,
 *         headers: { ...result.response.headers, 'x-request-id': requestId },
 *       } : undefined,
 *     };
 *   },
 * });
 *
 * // Middleware with configuration
 * const TenantMiddleware = defineMiddleware('tenant', {
 *   config: {
 *     headerName: field.string().default('X-Tenant-ID'),
 *     required: field.boolean().default(true),
 *   },
 *   handler: async ({ ctx, config, next }) => {
 *     const tenantId = ctx.headers[config.headerName.toLowerCase()];
 *     if (!tenantId && config.required) {
 *       return {
 *         response: {
 *           status: 400,
 *           body: { error: 'Tenant ID required' },
 *         },
 *       };
 *     }
 *     ctx.context.tenantId = tenantId;
 *     return next();
 *   },
 *   description: 'Extracts tenant ID from request headers',
 *   order: 'early',
 * });
 *
 * // Auth middleware example
 * const ApiKeyMiddleware = defineMiddleware('api-key', {
 *   config: {
 *     headerName: field.string().default('X-API-Key'),
 *     envVar: field.string().default('API_KEY'),
 *   },
 *   handler: async ({ ctx, config, next }) => {
 *     const apiKey = ctx.headers[config.headerName.toLowerCase()];
 *     const expectedKey = process.env[config.envVar];
 *
 *     if (!apiKey || apiKey !== expectedKey) {
 *       return {
 *         response: {
 *           status: 401,
 *           body: { error: 'Invalid API key' },
 *         },
 *       };
 *     }
 *     return next();
 *   },
 *   order: 'early',
 * });
 * ```
 */

import type {
  MiddlewareSchema,
  MiddlewareConfig,
  MiddlewareHandler,
  FieldDefinition,
  FieldBuilder,
} from './types';

/**
 * Convert a FieldBuilder or FieldDefinition to a normalized FieldDefinition.
 * This handles the property name differences between the two types.
 */
function normalizeField(field: FieldBuilder<unknown> | FieldDefinition): FieldDefinition {
  // Check if it's already a FieldDefinition (has 'nullable' property pattern)
  // or if it's a FieldBuilder (has 'isNullable' property pattern)
  const isBuilder =
    'isNullable' in field || 'isUnique' in field || 'isReadOnly' in field || 'defaultValue' in field;

  if (!isBuilder) {
    // Already a FieldDefinition, just return it
    return field as FieldDefinition;
  }

  // Convert FieldBuilder to FieldDefinition
  const builder = field as FieldBuilder<unknown>;
  const definition: FieldDefinition = {
    type: builder.type,
    hint: builder.hint,
    nullable: builder.isNullable,
    unique: builder.isUnique,
    readOnly: builder.isReadOnly,
    default: builder.defaultValue,
    constraints: builder.constraints,
    target: builder.target,
    values: builder.values,
  };

  // Handle nested items (for arrays) - recursively normalize
  if (builder.items) {
    definition.items = normalizeField(builder.items);
  }

  // Handle nested shape (for objects) - recursively normalize each field
  if (builder.shape) {
    const normalizedShape: Record<string, FieldDefinition> = {};
    for (const [key, value] of Object.entries(builder.shape)) {
      normalizedShape[key] = normalizeField(value as FieldBuilder<unknown> | FieldDefinition);
    }
    definition.shape = normalizedShape;
  }

  return definition;
}

/**
 * Normalize a record of fields (config schema)
 */
function normalizeFields(
  fields: Record<string, FieldBuilder<unknown> | FieldDefinition> | undefined
): Record<string, FieldDefinition> {
  const result: Record<string, FieldDefinition> = {};

  if (!fields) return result;

  for (const [key, value] of Object.entries(fields)) {
    result[key] = normalizeField(value);
  }

  return result;
}

/**
 * Defines a custom middleware with a handler function.
 * Use this to create reusable middleware that works across all backend frameworks.
 *
 * The handler function is framework-agnostic and will be adapted during code generation
 * to work with Express, Next.js, Supabase Edge Functions, or other backends.
 *
 * @param name - Unique middleware name (e.g., 'tenant', 'api-key', 'request-id')
 * @param options - Middleware configuration including handler, config schema, and metadata
 * @returns MiddlewareSchema
 *
 * @example Simple middleware without config
 * ```typescript
 * const LoggerMiddleware = defineMiddleware('logger', {
 *   handler: async ({ ctx, next }) => {
 *     console.log(`${ctx.method} ${ctx.path}`);
 *     const start = Date.now();
 *     const result = await next();
 *     console.log(`Completed in ${Date.now() - start}ms`);
 *     return result;
 *   },
 * });
 * ```
 *
 * @example Middleware with config and early ordering
 * ```typescript
 * const CorsMiddleware = defineMiddleware('cors', {
 *   config: {
 *     allowOrigins: field.array(field.string()).default(['*']),
 *     allowMethods: field.array(field.string()).default(['GET', 'POST', 'PUT', 'DELETE']),
 *     allowHeaders: field.array(field.string()).default(['Content-Type', 'Authorization']),
 *   },
 *   handler: async ({ ctx, config, next }) => {
 *     const origin = ctx.headers['origin'] || '*';
 *     const isAllowed = config.allowOrigins.includes('*') ||
 *                       config.allowOrigins.includes(origin);
 *
 *     if (!isAllowed) {
 *       return {
 *         response: { status: 403, body: { error: 'Origin not allowed' } },
 *       };
 *     }
 *
 *     const result = await next();
 *     return {
 *       ...result,
 *       response: result?.response ? {
 *         ...result.response,
 *         headers: {
 *           ...result.response.headers,
 *           'Access-Control-Allow-Origin': origin,
 *           'Access-Control-Allow-Methods': config.allowMethods.join(', '),
 *           'Access-Control-Allow-Headers': config.allowHeaders.join(', '),
 *         },
 *       } : undefined,
 *     };
 *   },
 *   order: 'early',
 *   description: 'Handles CORS headers for cross-origin requests',
 * });
 * ```
 *
 * @example Auth middleware that populates context
 * ```typescript
 * const JwtMiddleware = defineMiddleware('jwt-auth', {
 *   config: {
 *     secretEnvVar: field.string().default('JWT_SECRET'),
 *     headerName: field.string().default('Authorization'),
 *   },
 *   handler: async ({ ctx, config, next }) => {
 *     const header = ctx.headers[config.headerName.toLowerCase()];
 *     if (!header?.startsWith('Bearer ')) {
 *       return {
 *         response: { status: 401, body: { error: 'Missing token' } },
 *       };
 *     }
 *
 *     const token = header.slice(7);
 *     try {
 *       // In real implementation, verify JWT here
 *       const payload = JSON.parse(atob(token.split('.')[1]));
 *       ctx.context.userId = payload.sub;
 *       ctx.context.role = payload.role;
 *       return next();
 *     } catch {
 *       return {
 *         response: { status: 401, body: { error: 'Invalid token' } },
 *       };
 *     }
 *   },
 *   order: 'early',
 * });
 * ```
 */
export function defineMiddleware<TConfig = Record<string, unknown>>(
  name: string,
  options: MiddlewareConfig<TConfig>
): MiddlewareSchema<TConfig> {
  // Validate name
  if (!name || typeof name !== 'string') {
    throw new Error('Middleware name must be a non-empty string');
  }

  // Validate name format (lowercase, alphanumeric, hyphens)
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Middleware name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens: ${name}`
    );
  }

  // Validate handler
  if (typeof options.handler !== 'function') {
    throw new Error(`Middleware handler must be a function: ${name}`);
  }

  // Normalize config fields
  const config = normalizeFields(options.config);

  return {
    name,
    config,
    handler: options.handler as MiddlewareHandler<TConfig>,
    description: options.description,
    order: options.order ?? 'normal',
    _middleware: true as const,
  };
}
