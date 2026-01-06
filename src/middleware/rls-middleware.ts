/**
 * RLS Middleware - Row-Level Security enforcement in middleware chain
 *
 * Applies row-level security policies before and after storage operations.
 * Works with ctx.context populated by the context middleware.
 *
 * @module middleware/rls-middleware
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { EntitySchema } from '../schema/types';
import type { Middleware, MiddlewareContext } from './types';

/**
 * RLS filter function type.
 * Returns true if the row passes the security check.
 */
export type RLSFilter = (
  row: Record<string, unknown>,
  ctx: Record<string, unknown> | null
) => boolean;

/**
 * RLS filters for a single entity.
 */
export interface RLSFilters {
  /** Filter for SELECT/read operations */
  select?: RLSFilter;
  /** Filter for INSERT operations */
  insert?: RLSFilter;
  /** Filter for UPDATE operations */
  update?: RLSFilter;
  /** Filter for DELETE operations */
  delete?: RLSFilter;
}

/**
 * Configuration options for RLS middleware.
 */
export interface RLSMiddlewareConfig {
  /**
   * Entity schemas with RLS configuration.
   * Used for schema lookup during operations.
   */
  schemas: Map<string, EntitySchema>;

  /**
   * Function to get RLS filters for all entities.
   * Typically returns generated RLS filter functions.
   *
   * @returns Map of entity names to RLS filters
   */
  getFilters: () => Record<string, RLSFilters>;

  /**
   * Enable debug logging.
   *
   * @default false
   */
  debug?: boolean;
}

/**
 * RLS Error thrown when a security check fails.
 */
export class RLSError extends Error {
  /** Error code for programmatic handling */
  readonly code = 'RLS_DENIED';

  /** The entity that was accessed */
  readonly entity: string;

  /** The operation that was attempted */
  readonly operation: string;

  constructor(operation: string, entity: string) {
    super(`Access denied: ${operation} on ${entity}`);
    this.name = 'RLSError';
    this.entity = entity;
    this.operation = operation;
  }
}

/**
 * Map operation names to RLS filter keys.
 */
function operationToRLSKey(operation: string): keyof RLSFilters | null {
  switch (operation) {
    case 'findOne':
    case 'findMany':
    case 'list':
    case 'get':
      return 'select';
    case 'create':
      return 'insert';
    case 'update':
    case 'patch':
      return 'update';
    case 'delete':
      return 'delete';
    default:
      return null;
  }
}

/**
 * Create an RLS middleware that enforces row-level security.
 *
 * This middleware:
 * 1. Pre-checks write operations (insert, update, delete) before execution
 * 2. Post-filters read operations (select) after execution
 * 3. Uses ctx.context populated by context middleware
 *
 * @param config - RLS middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const rlsMiddleware = createRLSMiddleware({
 *   schemas: schemaMap,
 *   getFilters: () => ({
 *     post: {
 *       select: (row, ctx) => row.published || row.authorId === ctx?.userId,
 *       insert: (row, ctx) => row.authorId === ctx?.userId,
 *       update: (row, ctx) => row.authorId === ctx?.userId,
 *       delete: (row, ctx) => row.authorId === ctx?.userId,
 *     },
 *   }),
 * });
 * ```
 */
export function createRLSMiddleware(config: RLSMiddlewareConfig): Middleware {
  const { getFilters, debug = false } = config;

  return {
    name: 'rls',

    async before(ctx: MiddlewareContext) {
      const { entity, operation, data } = ctx;
      const filters = getFilters()[entity];

      // No RLS configured for this entity
      if (!filters) {
        return;
      }

      const context = ctx.context || null;
      const rlsKey = operationToRLSKey(operation);

      if (!rlsKey) {
        return;
      }

      // Pre-check for INSERT operations
      if (rlsKey === 'insert' && filters.insert && data) {
        const allowed = filters.insert(data as Record<string, unknown>, context);

        if (debug) {
          console.log(`[RLS] Pre-check ${operation} on ${entity}:`, allowed);
        }

        if (!allowed) {
          throw new RLSError('insert', entity);
        }
      }

      // Mark for post-check on UPDATE and DELETE
      // We need to check the target row after fetching it
      if (rlsKey === 'update' && filters.update) {
        ctx.metadata.rlsUpdateCheck = true;
      }

      if (rlsKey === 'delete' && filters.delete) {
        ctx.metadata.rlsDeleteCheck = true;
      }
    },

    async after<T>(ctx: MiddlewareContext, response: AdapterResponse<T>): Promise<AdapterResponse<T>> {
      const { entity, operation } = ctx;
      const filters = getFilters()[entity];

      // No RLS configured for this entity
      if (!filters) {
        return response;
      }

      const context = ctx.context || null;
      const rlsKey = operationToRLSKey(operation);

      if (!rlsKey) {
        return response;
      }

      // Post-filter for SELECT operations
      if (rlsKey === 'select' && filters.select) {
        if (Array.isArray(response.data)) {
          // Filter array results
          const original = response.data as unknown[];
          const filtered = original.filter((row) =>
            filters.select!(row as Record<string, unknown>, context)
          );

          if (debug) {
            console.log(`[RLS] Post-filter ${operation} on ${entity}: ${original.length} -> ${filtered.length}`);
          }

          return {
            ...response,
            data: filtered as T,
            meta: {
              ...response.meta,
              total: filtered.length,
            },
          };
        } else if (response.data) {
          // Check single result
          const allowed = filters.select(response.data as Record<string, unknown>, context);

          if (debug) {
            console.log(`[RLS] Post-check ${operation} on ${entity}:`, allowed);
          }

          if (!allowed) {
            return {
              ...response,
              data: null as T,
            };
          }
        }
      }

      // Post-check for UPDATE operations
      if (ctx.metadata.rlsUpdateCheck && response.data && filters.update) {
        const allowed = filters.update(response.data as Record<string, unknown>, context);

        if (debug) {
          console.log(`[RLS] Post-check update on ${entity}:`, allowed);
        }

        if (!allowed) {
          throw new RLSError('update', entity);
        }
      }

      // Post-check for DELETE operations
      if (ctx.metadata.rlsDeleteCheck && ctx.metadata.deletedRow && filters.delete) {
        const allowed = filters.delete(ctx.metadata.deletedRow as Record<string, unknown>, context);

        if (debug) {
          console.log(`[RLS] Post-check delete on ${entity}:`, allowed);
        }

        if (!allowed) {
          throw new RLSError('delete', entity);
        }
      }

      return response;
    },
  };
}

/**
 * Create a bypass check function from bypass conditions.
 * Returns a function that checks if the context matches any bypass condition.
 *
 * @param bypassConditions - Array of { contextKey, values } conditions
 * @returns A function that returns true if bypass should occur
 *
 * @example
 * ```typescript
 * const checkBypass = createBypassCheck([
 *   { contextKey: 'role', values: ['admin', 'superuser'] },
 * ]);
 *
 * checkBypass({ role: 'admin' }); // true
 * checkBypass({ role: 'user' }); // false
 * ```
 */
export function createBypassCheck(
  bypassConditions: Array<{ contextKey: string; values: string[] }>
): (ctx: Record<string, unknown> | null) => boolean {
  if (bypassConditions.length === 0) {
    return () => false;
  }

  return (ctx) => {
    if (!ctx) return false;

    for (const condition of bypassConditions) {
      const value = ctx[condition.contextKey];
      if (typeof value === 'string' && condition.values.includes(value)) {
        return true;
      }
    }

    return false;
  };
}
