/**
 * Main Resolver Engine - Core CRUD operations with relation and computed field resolution
 *
 * @module runtime/resolver
 * @category Runtime
 */

import type { EntitySchema, ViewSchema } from '../../schema/types';
import { SchemaRegistry } from './registry';
import type { Database, ResolverContext } from './computed';
import { resolveComputedFields, clearComputeCache } from './computed';
import { resolveRelations, eagerLoadRelations, type ResolveRelationOptions } from './relation';
import { ViewResolver } from './view';

/**
 * Options for single entity queries
 */
export interface EntityQueryOptions extends ResolveRelationOptions {
  /** Filter conditions */
  where?: Record<string, unknown>;
  /** Specific computed fields to resolve */
  computed?: string[];
}

/**
 * Options for list queries
 */
export interface ListQueryOptions extends EntityQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
  /** Sort order */
  orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * Options for count queries
 */
export interface CountOptions {
  /** Filter conditions */
  where?: Record<string, unknown>;
}

/**
 * Create input type (partial entity without id)
 */
export type CreateInput<T> = Omit<Partial<T>, 'id'>;

/**
 * Update input type (partial entity)
 */
export type UpdateInput<T> = Partial<T>;

/**
 * Main resolver engine for CRUD operations.
 * Orchestrates relation loading, computed field resolution, and database queries.
 *
 * @example
 * ```typescript
 * const resolver = new Resolver(registry, db);
 *
 * // Find one with relations
 * const user = await resolver.findOne('user', '123', {
 *   include: ['profile', 'posts'],
 * });
 *
 * // Find many with pagination
 * const users = await resolver.findMany('user', {
 *   limit: 20,
 *   offset: 0,
 *   orderBy: { createdAt: 'desc' },
 * });
 * ```
 */
export class Resolver {
  private context: ResolverContext;
  private viewResolver: ViewResolver;

  constructor(
    private registry: SchemaRegistry,
    private db: Database,
    context?: Partial<ResolverContext>
  ) {
    this.context = { mode: 'resolve', ...context };
    this.viewResolver = new ViewResolver(registry, db);
  }

  /**
   * Find a single entity by ID
   *
   * @param entityName - The entity type to find
   * @param id - The entity ID
   * @param options - Query options (relations, computed fields)
   * @returns The entity or null if not found
   *
   * @example
   * ```typescript
   * const user = await resolver.findOne('user', '123', {
   *   include: ['profile'],
   *   computed: ['postCount'],
   * });
   * ```
   */
  async findOne<T extends Record<string, unknown>>(
    entityName: string,
    id: string,
    options: EntityQueryOptions = {}
  ): Promise<T | null> {
    clearComputeCache();

    const schema = this.registry.getOrThrow(entityName);
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    const entity = entityDb.findFirst({
      where: { id: { equals: id } },
    }) as T | null;

    if (!entity) return null;

    // Resolve relations
    await resolveRelations(entity, schema, this.db, this.registry, options);

    // Resolve computed fields
    await resolveComputedFields(entity, schema, this.db, this.context);

    return entity;
  }

  /**
   * Find multiple entities with filtering and pagination
   *
   * @param entityName - The entity type to find
   * @param options - Query options (filters, pagination, relations)
   * @returns Array of entities
   *
   * @example
   * ```typescript
   * const users = await resolver.findMany('user', {
   *   where: { role: 'admin' },
   *   limit: 20,
   *   offset: 0,
   *   include: ['profile'],
   * });
   * ```
   */
  async findMany<T extends Record<string, unknown>>(
    entityName: string,
    options: ListQueryOptions = {}
  ): Promise<T[]> {
    clearComputeCache();

    const schema = this.registry.getOrThrow(entityName);
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    // Build query
    const query: Record<string, unknown> = {};

    if (options.where) {
      query.where = this.buildWhereClause(options.where);
    }
    if (options.limit) {
      query.take = options.limit;
    }
    if (options.offset) {
      query.skip = options.offset;
    }
    if (options.orderBy) {
      query.orderBy = options.orderBy;
    }

    const entities = entityDb.findMany(query) as T[];

    // Batch load relations for efficiency
    await eagerLoadRelations(entities, schema, this.db, this.registry, options);

    // Resolve computed fields for each entity
    for (const entity of entities) {
      await resolveComputedFields(entity, schema, this.db, this.context);
    }

    return entities;
  }

  /**
   * Create a new entity
   *
   * @param entityName - The entity type to create
   * @param data - The entity data
   * @param options - Query options for the returned entity
   * @returns The created entity with relations and computed fields
   *
   * @example
   * ```typescript
   * const user = await resolver.create('user', {
   *   name: 'John Doe',
   *   email: 'john@example.com',
   * });
   * ```
   */
  async create<T extends Record<string, unknown>>(
    entityName: string,
    data: CreateInput<T>,
    options: EntityQueryOptions = {}
  ): Promise<T> {
    const schema = this.registry.getOrThrow(entityName);
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    // Create the entity
    if (!entityDb.create) {
      throw new Error(`Entity '${entityName}' does not support create operation`);
    }
    const entity = entityDb.create(data) as T;

    // Resolve relations
    await resolveRelations(entity, schema, this.db, this.registry, options);

    // Resolve computed fields
    await resolveComputedFields(entity, schema, this.db, this.context);

    return entity;
  }

  /**
   * Update an existing entity
   *
   * @param entityName - The entity type to update
   * @param id - The entity ID
   * @param data - The update data
   * @param options - Query options for the returned entity
   * @returns The updated entity or null if not found
   *
   * @example
   * ```typescript
   * const user = await resolver.update('user', '123', {
   *   name: 'Jane Doe',
   * });
   * ```
   */
  async update<T extends Record<string, unknown>>(
    entityName: string,
    id: string,
    data: UpdateInput<T>,
    options: EntityQueryOptions = {}
  ): Promise<T | null> {
    const schema = this.registry.getOrThrow(entityName);
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    // Update the entity
    if (!entityDb.update) {
      throw new Error(`Entity '${entityName}' does not support update operation`);
    }
    const entity = entityDb.update({
      where: { id: { equals: id } },
      data,
    }) as T | null;

    if (!entity) return null;

    // Resolve relations
    await resolveRelations(entity, schema, this.db, this.registry, options);

    // Resolve computed fields
    await resolveComputedFields(entity, schema, this.db, this.context);

    return entity;
  }

  /**
   * Delete an entity by ID
   *
   * @param entityName - The entity type to delete
   * @param id - The entity ID
   * @returns true if deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await resolver.delete('user', '123');
   * ```
   */
  delete(entityName: string, id: string): boolean {
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    if (!entityDb.delete) {
      throw new Error(`Entity '${entityName}' does not support delete operation`);
    }
    const deleted = entityDb.delete({
      where: { id: { equals: id } },
    });

    return deleted !== null;
  }

  /**
   * Count entities matching a filter
   *
   * @param entityName - The entity type to count
   * @param options - Count options (filters)
   * @returns The count
   *
   * @example
   * ```typescript
   * const adminCount = await resolver.count('user', {
   *   where: { role: 'admin' },
   * });
   * ```
   */
  count(entityName: string, options: CountOptions = {}): number {
    const entityDb = this.db[entityName];

    if (!entityDb) {
      throw new Error(`Entity '${entityName}' not found in database`);
    }

    const query = options.where ? { where: this.buildWhereClause(options.where) } : {};
    return entityDb.count(query);
  }

  /**
   * Resolve a view with parameters
   *
   * @param viewName - The view name
   * @param params - View parameters
   * @returns The resolved view data
   *
   * @example
   * ```typescript
   * const userFull = await resolver.view('user-full', { id: '123' });
   * ```
   */
  async view<T>(viewName: string, params: Record<string, string>): Promise<T | null> {
    clearComputeCache();

    const viewSchema = this.registry.getViewOrThrow(viewName);
    return this.viewResolver.resolve<T>(viewSchema, params, this.context);
  }

  /**
   * Build a where clause from simple object to database format
   */
  private buildWhereClause(where: Record<string, unknown>): Record<string, unknown> {
    const clause: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Already in query format (e.g., { equals: 'foo' })
        clause[key] = value;
      } else if (Array.isArray(value)) {
        // Array becomes 'in' clause
        clause[key] = { in: value };
      } else {
        // Simple value becomes 'equals'
        clause[key] = { equals: value };
      }
    }

    return clause;
  }

  /**
   * Get the current resolver context
   */
  getContext(): ResolverContext {
    return { ...this.context };
  }

  /**
   * Create a new resolver with updated context
   */
  withContext(context: Partial<ResolverContext>): Resolver {
    return new Resolver(this.registry, this.db, { ...this.context, ...context });
  }
}

/**
 * Creates a new Resolver instance
 *
 * @param registry - Schema registry
 * @param db - Database interface
 * @param context - Optional resolver context
 * @returns Resolver instance
 *
 * @example
 * ```typescript
 * const resolver = createResolver(registry, db, {
 *   currentUserId: 'user-123',
 * });
 * ```
 */
export function createResolver(
  registry: SchemaRegistry,
  db: Database,
  context?: Partial<ResolverContext>
): Resolver {
  return new Resolver(registry, db, context);
}
