/**
 * API for defining custom endpoints with mock resolvers.
 * Enables mocking of arbitrary REST APIs beyond standard CRUD operations.
 *
 * @module schema/define-endpoint
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineEndpoint, field } from 'schemock/schema';
 *
 * // GET endpoint with query parameters
 * const SearchEndpoint = defineEndpoint('/api/search', {
 *   method: 'GET',
 *   params: {
 *     q: field.string(),
 *     type: field.enum(['user', 'post', 'all']).default('all'),
 *     limit: field.number.int().default(20),
 *   },
 *   response: {
 *     results: field.array(field.object({
 *       id: field.string(),
 *       title: field.string(),
 *     })),
 *     total: field.number.int(),
 *   },
 *   mockResolver: async ({ params, db }) => {
 *     const users = db.user.findMany({
 *       where: { name: { contains: params.q } }
 *     });
 *     return { results: users, total: users.length };
 *   },
 * });
 *
 * // POST endpoint with body
 * const CreateOrderEndpoint = defineEndpoint('/api/orders', {
 *   method: 'POST',
 *   body: {
 *     items: field.array(field.object({
 *       productId: field.string(),
 *       quantity: field.number.int(),
 *     })),
 *   },
 *   response: {
 *     orderId: field.string(),
 *     total: field.number.float(),
 *   },
 *   mockResolver: async ({ body }) => ({
 *     orderId: crypto.randomUUID(),
 *     total: body.items.reduce((sum, item) => sum + item.quantity * 10, 0),
 *   }),
 * });
 * ```
 */

import type {
  EndpointSchema,
  EndpointConfig,
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

  // Handle nested items (for arrays)
  if (builder.items) {
    definition.items = builder.items;
  }

  // Handle nested shape (for objects)
  if (builder.shape) {
    definition.shape = builder.shape;
  }

  return definition;
}

/**
 * Normalize a record of fields (params, body, or response)
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
 * Defines a custom API endpoint with mock resolver.
 * Use this to mock arbitrary REST endpoints beyond standard CRUD operations.
 *
 * @param path - URL path (e.g., '/api/search', '/api/orders/:id')
 * @param config - Endpoint configuration including method, params, body, response, and mockResolver
 * @returns EndpointSchema
 *
 * @example Simple GET endpoint
 * ```typescript
 * const HealthCheck = defineEndpoint('/api/health', {
 *   method: 'GET',
 *   response: {
 *     status: field.enum(['ok', 'degraded', 'down']),
 *     timestamp: field.date(),
 *   },
 *   mockResolver: () => ({
 *     status: 'ok',
 *     timestamp: new Date(),
 *   }),
 * });
 * ```
 *
 * @example GET with path parameters
 * ```typescript
 * const UserStats = defineEndpoint('/api/users/:userId/stats', {
 *   method: 'GET',
 *   params: {
 *     userId: field.string(),
 *   },
 *   response: {
 *     totalPosts: field.number.int(),
 *     totalViews: field.number.int(),
 *   },
 *   mockResolver: async ({ params, db }) => {
 *     const posts = db.post.findMany({
 *       where: { authorId: { equals: params.userId } }
 *     });
 *     return {
 *       totalPosts: posts.length,
 *       totalViews: posts.reduce((sum, p) => sum + p.views, 0),
 *     };
 *   },
 * });
 * ```
 *
 * @example POST with body
 * ```typescript
 * const BulkDelete = defineEndpoint('/api/posts/bulk-delete', {
 *   method: 'POST',
 *   body: {
 *     ids: field.array(field.string()),
 *   },
 *   response: {
 *     deleted: field.number.int(),
 *   },
 *   mockResolver: async ({ body, db }) => {
 *     let deleted = 0;
 *     for (const id of body.ids) {
 *       const result = db.post.delete({ where: { id: { equals: id } } });
 *       if (result) deleted++;
 *     }
 *     return { deleted };
 *   },
 * });
 * ```
 */
export function defineEndpoint<
  TParams = Record<string, unknown>,
  TBody = Record<string, unknown>,
  TResponse = unknown,
>(
  path: string,
  config: EndpointConfig<TParams, TBody, TResponse>
): EndpointSchema<TParams, TBody, TResponse> {
  // Validate path
  if (!path.startsWith('/')) {
    throw new Error(`Endpoint path must start with '/': ${path}`);
  }

  // Normalize all field definitions
  const params = normalizeFields(config.params);
  const body = normalizeFields(config.body);
  const response = normalizeFields(config.response);

  // Validate body is only used with methods that support it
  if (Object.keys(body).length > 0 && config.method === 'GET') {
    console.warn(`Warning: GET endpoints typically don't have a body. Consider using params instead for ${path}`);
  }

  return {
    path,
    method: config.method,
    params,
    body,
    response,
    mockResolver: config.mockResolver,
    description: config.description,
    _endpoint: true as const,
  };
}
