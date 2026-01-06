/**
 * Storage Driver Types - Abstract storage interface for different backends
 *
 * @module storage/types
 * @category Storage
 */

import type { EntitySchema } from '../schema/types';

/**
 * Query options for findMany operations
 */
export interface QueryOptions {
  /** Filter conditions */
  where?: Record<string, unknown>;
  /** Sorting configuration */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Relations to include */
  include?: string[];
}

/**
 * Result metadata for paginated queries
 */
export interface QueryMeta {
  /** Total count of matching records */
  total: number;
  /** Whether there are more results available */
  hasMore: boolean;
}

/**
 * Storage Driver Interface
 *
 * All storage implementations (MSW, PGlite, Memory, FileSystem)
 * must implement this interface. This abstraction allows the MockAdapter
 * to work with any storage backend while maintaining the same API.
 *
 * @example
 * ```typescript
 * const driver = new MemoryStorageDriver();
 * await driver.initialize(schemas);
 *
 * // CRUD operations
 * const user = await driver.create('user', { name: 'John' });
 * const found = await driver.findOne('user', { id: user.id });
 * const all = await driver.findMany('user', { where: { role: 'admin' } });
 * await driver.update('user', { id: user.id }, { name: 'Jane' });
 * await driver.delete('user', { id: user.id });
 * ```
 */
export interface StorageDriver {
  /** Driver name for identification */
  readonly name: string;

  /**
   * Initialize the driver with entity schemas.
   * This sets up any necessary data structures or tables.
   *
   * @param schemas - Array of entity schemas to initialize
   */
  initialize(schemas: EntitySchema[]): Promise<void>;

  /**
   * Create a new record.
   *
   * @param entity - The entity name
   * @param data - The data to create
   * @returns The created record with generated fields (id, timestamps)
   */
  create<T>(entity: string, data: Record<string, unknown>): Promise<T>;

  /**
   * Find a single record by ID or unique filter.
   *
   * @param entity - The entity name
   * @param where - Filter conditions (usually { id: '...' })
   * @returns The found record or null
   */
  findOne<T>(entity: string, where: Record<string, unknown>): Promise<T | null>;

  /**
   * Find multiple records with filtering, sorting, and pagination.
   *
   * @param entity - The entity name
   * @param options - Query options (where, orderBy, limit, offset)
   * @returns Object containing data array and metadata
   */
  findMany<T>(entity: string, options?: QueryOptions): Promise<{ data: T[]; meta: QueryMeta }>;

  /**
   * Update a record.
   *
   * @param entity - The entity name
   * @param where - Filter to identify the record
   * @param data - The data to update
   * @returns The updated record or null if not found
   */
  update<T>(entity: string, where: Record<string, unknown>, data: Record<string, unknown>): Promise<T | null>;

  /**
   * Delete a record.
   *
   * @param entity - The entity name
   * @param where - Filter to identify the record
   * @returns True if deleted, false if not found
   */
  delete(entity: string, where: Record<string, unknown>): Promise<boolean>;

  /**
   * Count records matching filter.
   *
   * @param entity - The entity name
   * @param where - Optional filter conditions
   * @returns The count of matching records
   */
  count(entity: string, where?: Record<string, unknown>): Promise<number>;

  /**
   * Include related entities (JOIN-like behavior).
   * Each driver implements this according to its capabilities.
   *
   * @param entity - The entity name
   * @param data - Array of records to hydrate with relations
   * @param relations - Array of relation names to include
   * @param schemas - Map of all entity schemas for reference
   * @returns Records with included relations
   */
  includeRelations<T>(
    entity: string,
    data: T[],
    relations: string[],
    schemas: Map<string, EntitySchema>
  ): Promise<T[]>;

  /**
   * Seed the database with fake data.
   *
   * @param counts - Map of entity names to counts
   * @param schemas - Map of all entity schemas
   */
  seed(counts: Record<string, number>, schemas: Map<string, EntitySchema>): Promise<void>;

  /**
   * Reset/clear all data.
   */
  reset(): Promise<void>;

  /**
   * Get all records for an entity (useful for debugging).
   *
   * @param entity - The entity name
   * @returns All records of that type
   */
  getAll<T>(entity: string): Promise<T[]>;
}

/**
 * Configuration for storage driver initialization
 */
export interface StorageDriverConfig {
  /** Optional faker seed for reproducible data generation */
  fakerSeed?: number;
  /** Enable debug logging */
  debug?: boolean;
}
