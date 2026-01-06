/**
 * Computed Field Resolver - Handles resolution of computed/derived fields
 *
 * @module runtime/resolver/computed
 * @category Runtime
 */

import type { EntitySchema, ComputedFieldDefinition } from '../../schema/types';

/**
 * Context passed to computed field resolvers
 */
export interface ResolverContext {
  /** Current user ID for auth-related computations */
  currentUserId?: string;
  /** Request parameters */
  params?: Record<string, unknown>;
  /** Request headers */
  headers?: Record<string, string>;
  /** Mode: 'seed' uses mock(), 'resolve' uses resolve() */
  mode: 'seed' | 'resolve';
}

/**
 * Database entity operations interface
 */
export interface DatabaseEntity {
  findFirst(query: unknown): unknown;
  findMany(query: unknown): unknown[];
  count(query?: unknown): number;
  create?(data: unknown): unknown;
  update?(query: unknown): unknown;
  delete?(query: unknown): unknown;
}

/**
 * Generic database interface for computed field resolvers
 */
export interface Database {
  [entityName: string]: DatabaseEntity;
}

/**
 * Sorts computed fields by their dependencies using topological sort.
 * Fields with no dependencies come first, fields that depend on others come later.
 *
 * @param fields - Array of [fieldName, definition] tuples to sort
 * @param allComputed - Full record of all computed field definitions
 * @returns Sorted array of [fieldName, definition] tuples
 * @throws Error if circular dependency is detected
 *
 * @example
 * ```typescript
 * const fields = [
 *   ['avgViews', { dependsOn: ['totalViews', 'postCount'] }],
 *   ['postCount', { dependsOn: [] }],
 *   ['totalViews', { dependsOn: ['postCount'] }],
 * ];
 *
 * const sorted = topologicalSort(fields, allComputed);
 * // Returns: [['postCount', ...], ['totalViews', ...], ['avgViews', ...]]
 * ```
 */
export function topologicalSort<T extends ComputedFieldDefinition>(
  fields: Array<[string, T]>,
  allComputed: Record<string, ComputedFieldDefinition>
): Array<[string, T]> {
  const result: Array<[string, T]> = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection

  const fieldNames = new Set(fields.map(([name]) => name));

  function visit(name: string): void {
    // Already processed
    if (visited.has(name)) return;

    // Cycle detected
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected in computed fields: ${name}`);
    }

    visiting.add(name);

    // Visit dependencies first
    const computed = allComputed[name];
    if (computed?.dependsOn) {
      for (const dep of computed.dependsOn) {
        // Only visit if it's a computed field we're sorting
        if (allComputed[dep] && fieldNames.has(dep)) {
          visit(dep);
        }
      }
    }

    visiting.delete(name);
    visited.add(name);

    // Add to result if it's in our fields array
    const field = fields.find(([n]) => n === name);
    if (field) {
      result.push(field);
    }
  }

  // Visit all fields
  for (const [name] of fields) {
    visit(name);
  }

  return result;
}

/**
 * Cache for computed values within a request
 * Prevents re-computation of the same field
 */
const computeCache = new Map<string, unknown>();

/**
 * Clears the compute cache. Should be called at the start of each request.
 */
export function clearComputeCache(): void {
  computeCache.clear();
}

/**
 * Resolves a single computed field for an entity.
 *
 * @param entity - The entity to compute the field for
 * @param fieldName - The name of the computed field
 * @param computed - The computed field definition
 * @param db - Database interface for queries
 * @param context - Resolver context
 * @returns The computed value
 *
 * @example
 * ```typescript
 * const postCount = resolveComputedField(
 *   user,
 *   'postCount',
 *   { resolve: (user, db) => db.post.count({ where: { authorId: user.id } }) },
 *   db,
 *   { mode: 'resolve' }
 * );
 * ```
 */
export function resolveComputedField<T>(
  entity: Record<string, unknown>,
  fieldName: string,
  computed: ComputedFieldDefinition<T>,
  db: Database,
  context: ResolverContext
): T | Promise<T> {
  const entityId = entity.id as string;
  const cacheKey = `${entityId}:${fieldName}`;

  // Return cached value if available
  if (computeCache.has(cacheKey)) {
    return computeCache.get(cacheKey) as T;
  }

  let value: T | Promise<T>;

  if (context.mode === 'seed' && computed.mock) {
    // During seeding, use mock function
    value = computed.mock();
  } else {
    // During resolution, use resolve function
    value = computed.resolve(entity, db, context);
  }

  // Handle promises
  if (value instanceof Promise) {
    return value.then((resolved) => {
      computeCache.set(cacheKey, resolved);
      return resolved;
    });
  }

  computeCache.set(cacheKey, value);
  return value;
}

/**
 * Resolves all computed fields for an entity.
 * Fields are resolved in dependency order.
 *
 * @param entity - The entity to resolve computed fields for
 * @param schema - The entity schema
 * @param db - Database interface for queries
 * @param context - Resolver context
 * @returns The entity with computed fields resolved (mutates and returns the same object)
 *
 * @example
 * ```typescript
 * const user = await resolveComputedFields(rawUser, UserSchema, db, { mode: 'resolve' });
 * console.log(user.postCount); // Now available
 * ```
 */
export async function resolveComputedFields<T extends Record<string, unknown>>(
  entity: T,
  schema: EntitySchema,
  db: Database,
  context: ResolverContext
): Promise<T> {
  if (!schema.computed || Object.keys(schema.computed).length === 0) {
    return entity;
  }

  // Get all computed fields
  const computedFields = Object.entries(schema.computed) as Array<[string, ComputedFieldDefinition]>;

  // Sort by dependencies
  const sorted = topologicalSort(computedFields, schema.computed);

  // Resolve each field in order
  for (const [fieldName, computed] of sorted) {
    const value = await resolveComputedField(entity, fieldName, computed, db, context);
    (entity as Record<string, unknown>)[fieldName] = value;
  }

  return entity;
}

/**
 * Resolves computed fields synchronously (for mock mode where all mocks are sync)
 *
 * @param entity - The entity to resolve computed fields for
 * @param schema - The entity schema
 * @param context - Resolver context (should have mode: 'seed')
 * @returns The entity with computed fields resolved
 */
export function resolveComputedFieldsSync<T extends Record<string, unknown>>(
  entity: T,
  schema: EntitySchema,
  context: ResolverContext
): T {
  if (!schema.computed || Object.keys(schema.computed).length === 0) {
    return entity;
  }

  // Get all computed fields
  const computedFields = Object.entries(schema.computed) as Array<[string, ComputedFieldDefinition]>;

  // Sort by dependencies
  const sorted = topologicalSort(computedFields, schema.computed);

  // Resolve each field in order using mock
  for (const [fieldName, computed] of sorted) {
    if (computed.mock) {
      (entity as Record<string, unknown>)[fieldName] = computed.mock();
    }
  }

  return entity;
}
