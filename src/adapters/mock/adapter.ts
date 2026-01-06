/**
 * MockAdapter - Unified mock adapter using StorageDriver abstraction
 *
 * Provides full CRUD operations through a configurable storage backend
 * and middleware pipeline. Supports MSW, Memory, and other storage drivers.
 *
 * @module adapters/mock/adapter
 * @category MockAdapter
 */

import type { EntitySchema } from '../../schema/types';
import type {
  Adapter,
  AdapterContext,
  AdapterResponse,
} from '../types';
import type { StorageDriver } from '../../storage/types';
import type { Middleware, MiddlewareContext } from '../../middleware/types';
import { MiddlewareChain } from '../../middleware/chain';
import { orderMiddleware } from '../../middleware/defaults';

/**
 * Configuration options for MockAdapter.
 */
export interface MockAdapterConfig {
  /** Storage driver to use (MSW, Memory, PGlite, etc.) */
  driver: StorageDriver;

  /** Entity schemas */
  schemas: EntitySchema[];

  /** Middleware to apply to all operations */
  middleware?: Middleware[];

  /** Custom middleware order (defaults to standard order) */
  middlewareOrder?: string[];

  /** Simulated network delay in milliseconds */
  delay?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Unified MockAdapter implementation using StorageDriver abstraction.
 *
 * Features:
 * - Pluggable storage backends (MSW, Memory, PGlite)
 * - Full middleware support (auth, context, RLS, cache, retry, logger)
 * - Configurable network delay simulation
 * - Automatic timestamp management
 * - Relation hydration
 *
 * @example
 * ```typescript
 * import { MockAdapter, MswStorageDriver, createContextMiddleware, createRLSMiddleware } from 'schemock';
 *
 * const driver = new MswStorageDriver();
 * await driver.initialize(schemas);
 *
 * const adapter = new MockAdapter({
 *   driver,
 *   schemas,
 *   middleware: [
 *     createContextMiddleware({ mockMode: true }),
 *     createRLSMiddleware({ schemas: schemaMap, getFilters: () => rlsFilters }),
 *   ],
 *   delay: 100, // Simulate 100ms latency
 * });
 *
 * const users = await adapter.findMany({ entity: 'user' });
 * ```
 */
export class MockAdapter implements Adapter {
  /** Adapter name identifier */
  name = 'mock';

  /** The storage driver instance */
  private driver: StorageDriver;

  /** Entity schemas for reference */
  private schemas: Map<string, EntitySchema>;

  /** Middleware chain for request processing */
  private middlewareChain: MiddlewareChain;

  /** Simulated network delay */
  private delay: number;

  /** Debug mode */
  private debug: boolean;

  /**
   * Create a new MockAdapter instance.
   *
   * @param config - Adapter configuration
   *
   * @example
   * ```typescript
   * const adapter = new MockAdapter({
   *   driver: new MswStorageDriver(),
   *   schemas: [userSchema, postSchema],
   *   middleware: [createContextMiddleware()],
   *   delay: 100,
   * });
   * ```
   */
  constructor(config: MockAdapterConfig) {
    this.driver = config.driver;
    this.schemas = new Map(config.schemas.map((s) => [s.name, s]));
    this.delay = config.delay ?? 0;
    this.debug = config.debug ?? false;

    // Build middleware chain with proper ordering
    const orderedMiddleware = orderMiddleware(
      config.middleware || [],
      config.middlewareOrder
    );
    this.middlewareChain = new MiddlewareChain(orderedMiddleware);

    if (this.debug) {
      console.log(
        `[MockAdapter] Initialized with ${config.schemas.length} schemas, ` +
          `${orderedMiddleware.length} middleware, ${this.delay}ms delay`
      );
    }
  }

  /**
   * Initialize the adapter (initializes the storage driver).
   *
   * @example
   * ```typescript
   * await adapter.initialize();
   * ```
   */
  async initialize(): Promise<void> {
    await this.driver.initialize(Array.from(this.schemas.values()));

    if (this.debug) {
      console.log(`[MockAdapter] Storage driver initialized`);
    }
  }

  /**
   * Find a single entity by ID or unique filter.
   *
   * @param ctx - The adapter context
   * @returns The found entity or null
   *
   * @example
   * ```typescript
   * const result = await adapter.findOne<User>({
   *   entity: 'user',
   *   params: { id: '123' },
   *   headers: { Authorization: 'Bearer token' },
   * });
   * ```
   */
  async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    return this.executeWithMiddleware<T>('findOne', ctx, async () => {
      const where = this.buildWhere(ctx);
      const result = await this.driver.findOne<T>(ctx.entity, where);
      return { data: result as T };
    });
  }

  /**
   * Find multiple entities matching filter criteria.
   *
   * @param ctx - The adapter context
   * @returns Array of matching entities
   *
   * @example
   * ```typescript
   * const result = await adapter.findMany<User>({
   *   entity: 'user',
   *   filter: { role: 'admin' },
   *   limit: 10,
   *   orderBy: { createdAt: 'desc' },
   *   include: ['posts'],
   * });
   * ```
   */
  async findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>> {
    return this.executeWithMiddleware<T[]>('findMany', ctx, async () => {
      const { data, meta } = await this.driver.findMany<T>(ctx.entity, {
        where: ctx.filter,
        orderBy: ctx.orderBy,
        limit: ctx.limit,
        offset: ctx.offset as number | undefined,
        include: ctx.include,
      });

      // Handle includes if specified
      let results = data;
      if (ctx.include?.length) {
        results = await this.driver.includeRelations(
          ctx.entity,
          data,
          ctx.include,
          this.schemas
        );
      }

      return {
        data: results,
        meta: {
          total: meta.total,
          hasMore: meta.hasMore,
        },
      };
    });
  }

  /**
   * Create a new entity.
   *
   * @param ctx - The adapter context with data
   * @returns The created entity
   *
   * @example
   * ```typescript
   * const result = await adapter.create<User>({
   *   entity: 'user',
   *   data: { name: 'John', email: 'john@example.com' },
   * });
   * ```
   */
  async create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    return this.executeWithMiddleware<T>('create', ctx, async () => {
      const data = this.prepareCreateData(ctx.entity, ctx.data as Record<string, unknown>);
      const result = await this.driver.create<T>(ctx.entity, data);
      return { data: result };
    });
  }

  /**
   * Update an existing entity.
   *
   * @param ctx - The adapter context with params and data
   * @returns The updated entity
   *
   * @example
   * ```typescript
   * const result = await adapter.update<User>({
   *   entity: 'user',
   *   params: { id: '123' },
   *   data: { name: 'Jane' },
   * });
   * ```
   */
  async update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    return this.executeWithMiddleware<T>('update', ctx, async () => {
      const where = this.buildWhere(ctx);
      const data = this.prepareUpdateData(ctx.entity, ctx.data as Record<string, unknown>);
      const result = await this.driver.update<T>(ctx.entity, where, data);
      return { data: result as T };
    });
  }

  /**
   * Delete an entity.
   *
   * @param ctx - The adapter context with params
   * @returns Void on success
   *
   * @example
   * ```typescript
   * await adapter.delete({
   *   entity: 'user',
   *   params: { id: '123' },
   * });
   * ```
   */
  async delete(ctx: AdapterContext): Promise<AdapterResponse<void>> {
    return this.executeWithMiddleware<void>('delete', ctx, async (middlewareCtx) => {
      const where = this.buildWhere(ctx);

      // Store the record being deleted for RLS post-check
      const existing = await this.driver.findOne(ctx.entity, where);
      if (existing) {
        middlewareCtx.metadata.deletedRow = existing;
      }

      await this.driver.delete(ctx.entity, where);
      return { data: undefined };
    });
  }

  /**
   * Seed the database with fake data.
   *
   * @param counts - Map of entity names to counts
   *
   * @example
   * ```typescript
   * await adapter.seed({ user: 10, post: 50 });
   * ```
   */
  async seed(counts: Record<string, number>): Promise<void> {
    await this.driver.seed(counts, this.schemas);

    if (this.debug) {
      console.log(`[MockAdapter] Seeded:`, counts);
    }
  }

  /**
   * Reset the database to empty state.
   *
   * @example
   * ```typescript
   * await adapter.reset();
   * ```
   */
  async reset(): Promise<void> {
    await this.driver.reset();

    if (this.debug) {
      console.log(`[MockAdapter] Reset`);
    }
  }

  /**
   * Get all entities of a type (useful for debugging).
   *
   * @param entityName - The entity type name
   * @returns All entities of that type
   */
  async getAll<T>(entityName: string): Promise<T[]> {
    return this.driver.getAll<T>(entityName);
  }

  /**
   * Get the count of entities.
   *
   * @param entityName - The entity type name
   * @param filter - Optional filter
   * @returns The count
   */
  async count(entityName: string, filter?: Record<string, unknown>): Promise<number> {
    return this.driver.count(entityName, filter);
  }

  /**
   * Get the underlying storage driver.
   * Useful for advanced operations or MSW handler setup.
   */
  getDriver(): StorageDriver {
    return this.driver;
  }

  /**
   * Get the schema map.
   */
  getSchemas(): Map<string, EntitySchema> {
    return this.schemas;
  }

  /**
   * Execute an operation through the middleware chain.
   */
  private async executeWithMiddleware<T>(
    operation: string,
    ctx: AdapterContext,
    handler: (middlewareCtx: MiddlewareContext) => Promise<AdapterResponse<T>>
  ): Promise<AdapterResponse<T>> {
    // Simulate network delay
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    // Build middleware context
    const middlewareCtx: MiddlewareContext = {
      ...ctx,
      operation,
      metadata: {},
      headers: ctx.headers || {},
      context: {}, // Will be populated by context middleware
    };

    // Execute through middleware chain
    return this.middlewareChain.execute(middlewareCtx, () => handler(middlewareCtx));
  }

  /**
   * Build a where clause from context params and filter.
   */
  private buildWhere(ctx: AdapterContext): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    // Add params (usually id)
    if (ctx.params) {
      Object.assign(where, ctx.params);
    }

    // Add filter conditions
    if (ctx.filter) {
      Object.assign(where, ctx.filter);
    }

    return where;
  }

  /**
   * Prepare data for create operation.
   * Adds ID and timestamps if needed.
   */
  private prepareCreateData(
    entity: string,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const schema = this.schemas.get(entity);

    return {
      ...data,
      // ID will be generated by driver if not provided
      ...(schema?.timestamps
        ? {
            createdAt: data.createdAt ?? new Date(),
            updatedAt: new Date(),
          }
        : {}),
    };
  }

  /**
   * Prepare data for update operation.
   * Adds updatedAt timestamp if schema has timestamps.
   */
  private prepareUpdateData(
    entity: string,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const schema = this.schemas.get(entity);

    return {
      ...data,
      ...(schema?.timestamps ? { updatedAt: new Date() } : {}),
    };
  }
}

// Re-export legacy types for backwards compatibility
export type { MockAdapterOptions } from '../types';

/**
 * Create a MockAdapter with the default MSW storage driver.
 * This is a convenience function for quick setup.
 *
 * @param schemas - Entity schemas
 * @param options - Additional options
 * @returns A configured MockAdapter
 *
 * @example
 * ```typescript
 * const adapter = await createMockAdapter(schemas, {
 *   delay: 100,
 *   seed: { user: 10, post: 50 },
 * });
 * ```
 */
export async function createMockAdapter(
  schemas: EntitySchema[],
  options?: {
    delay?: number;
    seed?: Record<string, number>;
    fakerSeed?: number;
    middleware?: Middleware[];
  }
): Promise<MockAdapter> {
  // Dynamically import to avoid circular dependencies
  const { MswStorageDriver } = await import('../../storage/drivers/msw');

  const driver = new MswStorageDriver({ fakerSeed: options?.fakerSeed });
  await driver.initialize(schemas);

  const adapter = new MockAdapter({
    driver,
    schemas,
    middleware: options?.middleware,
    delay: options?.delay,
  });

  // Seed if requested
  if (options?.seed) {
    await adapter.seed(options.seed);
  }

  return adapter;
}
