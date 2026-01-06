/**
 * Adapter Types - Universal interface for all backend adapters
 *
 * Defines the core Adapter interface that all backend implementations
 * (Mock, Fetch, Supabase, Firebase, GraphQL) must implement.
 *
 * @module adapters/types
 * @category Adapters
 */

import type { EntitySchema } from '../schema/types';

/**
 * Context passed to adapter methods for each operation.
 * Contains all information needed to execute a database operation.
 *
 * @example
 * ```typescript
 * const ctx: AdapterContext = {
 *   entity: 'user',
 *   endpoint: '/api/users',
 *   params: { id: '123' },
 *   data: { name: 'John' },
 * };
 * ```
 */
export interface AdapterContext {
  /** The entity name being operated on */
  entity: string;
  /** The API endpoint for this operation (optional, derived from entity if not provided) */
  endpoint?: string;
  /** URL/query parameters for the operation */
  params?: Record<string, unknown>;
  /** Request body data for create/update operations */
  data?: unknown;
  /** Filter conditions for queries */
  filter?: Record<string, unknown>;
  /** Sorting configuration */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Pagination: number of items to return */
  limit?: number;
  /** Pagination: offset for cursor-based or offset pagination */
  offset?: number | string;
  /** Fields to select/include in the response */
  select?: string[];
  /** Relations to include in the response */
  include?: string[];
  /** Custom operation name for non-CRUD operations */
  operation?: string;
  /** HTTP method override for custom operations */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Headers to include in the request (for middleware context extraction) */
  headers?: Record<string, string>;
}

/**
 * Response wrapper returned by all adapter methods.
 * Provides consistent structure for data, errors, and metadata.
 *
 * @example
 * ```typescript
 * // Success response
 * const response: AdapterResponse<User> = {
 *   data: { id: '123', name: 'John' },
 *   meta: { duration: 50 },
 * };
 *
 * // Error response
 * const errorResponse: AdapterResponse<User> = {
 *   data: null as unknown as User,
 *   error: new Error('Not found'),
 * };
 * ```
 */
export interface AdapterResponse<T> {
  /** The response data */
  data: T;
  /** Error object if the operation failed */
  error?: Error;
  /** Additional metadata about the response */
  meta?: AdapterResponseMeta;
}

/**
 * Metadata included in adapter responses.
 */
export interface AdapterResponseMeta {
  /** Total count of items (for paginated queries) */
  total?: number;
  /** Cursor for next page (cursor-based pagination) */
  nextCursor?: string;
  /** Whether there are more items available */
  hasMore?: boolean;
  /** Duration of the operation in milliseconds */
  duration?: number;
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Universal adapter interface for all backend implementations.
 *
 * All adapters (Mock, Fetch, Supabase, Firebase, GraphQL) implement this
 * interface to provide a consistent API for data operations.
 *
 * @example
 * ```typescript
 * class MyAdapter implements Adapter {
 *   name = 'my-adapter';
 *
 *   async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
 *     // Implementation
 *   }
 *   // ... other methods
 * }
 * ```
 */
export interface Adapter {
  /** Unique name identifying this adapter */
  name: string;

  /**
   * Find a single entity by ID or unique filter.
   *
   * @param ctx - The adapter context with entity name and params
   * @returns The found entity or error
   *
   * @example
   * ```typescript
   * const result = await adapter.findOne<User>({
   *   entity: 'user',
   *   params: { id: '123' },
   * });
   * ```
   */
  findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;

  /**
   * Find multiple entities matching filter criteria.
   *
   * @param ctx - The adapter context with entity name, filter, and pagination
   * @returns Array of matching entities
   *
   * @example
   * ```typescript
   * const result = await adapter.findMany<User>({
   *   entity: 'user',
   *   filter: { role: 'admin' },
   *   limit: 10,
   *   orderBy: { createdAt: 'desc' },
   * });
   * ```
   */
  findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>>;

  /**
   * Create a new entity.
   *
   * @param ctx - The adapter context with entity name and data
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
  create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;

  /**
   * Update an existing entity.
   *
   * @param ctx - The adapter context with entity name, params (id), and data
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
  update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;

  /**
   * Delete an entity.
   *
   * @param ctx - The adapter context with entity name and params (id)
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
  delete(ctx: AdapterContext): Promise<AdapterResponse<void>>;

  /**
   * Execute a custom operation (optional).
   *
   * @param ctx - The adapter context with operation details
   * @returns Custom response data
   *
   * @example
   * ```typescript
   * const result = await adapter.custom<{ count: number }>({
   *   entity: 'user',
   *   operation: 'count',
   *   filter: { role: 'admin' },
   * });
   * ```
   */
  custom?<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;
}

/**
 * Options for MockAdapter configuration.
 */
export interface MockAdapterOptions {
  /** Delay in milliseconds to simulate network latency */
  delay?: number;
  /** Whether to throw on not found (default: return null) */
  throwOnNotFound?: boolean;
  /** Seed data counts per entity */
  seed?: Record<string, number>;
  /** Custom faker seed for reproducible data */
  fakerSeed?: number;
}

/**
 * Options for FetchAdapter configuration.
 */
export interface FetchAdapterOptions {
  /** Base URL for API requests */
  baseUrl?: string;
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * Type for database instance used by MockAdapter.
 */
export type Database = {
  [entityName: string]: {
    create: (data: Record<string, unknown>) => unknown;
    findFirst: (query: { where: Record<string, unknown> }) => unknown | null;
    findMany: (query: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'>; take?: number; skip?: number }) => unknown[];
    update: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => unknown;
    delete: (query: { where: Record<string, unknown> }) => unknown;
    deleteMany: (query: { where: Record<string, unknown> }) => { count: number };
    count: (query?: { where?: Record<string, unknown> }) => number;
    getAll: () => unknown[];
  };
};

/**
 * Factory function type for creating @mswjs/data factories.
 * Uses unknown to accommodate @mswjs/data special types (primaryKey, nullable, oneOf, etc.)
 */
export type MswjsDataFactory = Record<string, unknown>;

/**
 * Schema registry for adapter initialization.
 */
export interface SchemaRegistry {
  /** All registered entity schemas */
  schemas: EntitySchema[];
  /** Get schema by entity name */
  get(name: string): EntitySchema | undefined;
  /** Check if entity exists */
  has(name: string): boolean;
}
