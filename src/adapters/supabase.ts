/**
 * SupabaseAdapter - Adapter for Supabase backends
 *
 * Maps Schemock operations to Supabase PostgREST API calls.
 *
 * @module adapters/supabase
 * @category Adapters
 */

import type {
  Adapter,
  AdapterContext,
  AdapterResponse,
} from './types';

/**
 * Supabase client type (from @supabase/supabase-js).
 * Using a minimal interface to avoid requiring the full Supabase package.
 */
export interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
}

/**
 * Supabase query builder interface.
 */
interface SupabaseQueryBuilder {
  select(columns?: string): SupabaseFilterBuilder;
  insert(data: unknown): SupabaseFilterBuilder;
  update(data: unknown): SupabaseFilterBuilder;
  delete(): SupabaseFilterBuilder;
}

/**
 * Supabase filter builder interface.
 */
interface SupabaseFilterBuilder {
  eq(column: string, value: unknown): SupabaseFilterBuilder;
  neq(column: string, value: unknown): SupabaseFilterBuilder;
  gt(column: string, value: unknown): SupabaseFilterBuilder;
  gte(column: string, value: unknown): SupabaseFilterBuilder;
  lt(column: string, value: unknown): SupabaseFilterBuilder;
  lte(column: string, value: unknown): SupabaseFilterBuilder;
  like(column: string, value: string): SupabaseFilterBuilder;
  ilike(column: string, value: string): SupabaseFilterBuilder;
  is(column: string, value: unknown): SupabaseFilterBuilder;
  in(column: string, values: unknown[]): SupabaseFilterBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseFilterBuilder;
  limit(count: number): SupabaseFilterBuilder;
  range(from: number, to: number): SupabaseFilterBuilder;
  select(columns?: string): SupabaseFilterBuilder;
  single(): SupabaseFilterBuilder;
  maybeSingle(): SupabaseFilterBuilder;
  then<T>(
    resolve: (result: { data: T | null; error: Error | null; count?: number }) => void
  ): Promise<void>;
}

/**
 * Supabase adapter options.
 */
export interface SupabaseAdapterOptions {
  /** Supabase client instance */
  client: SupabaseClient;
  /** Table name mapping (entity name -> table name) */
  tableMap?: Record<string, string>;
}

/**
 * SupabaseAdapter class implementing the Adapter interface.
 *
 * @example
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(url, key);
 * const adapter = new SupabaseAdapter({ client: supabase });
 *
 * const users = await adapter.findMany({ entity: 'user' });
 * ```
 */
export class SupabaseAdapter implements Adapter {
  /** Adapter name identifier */
  name = 'supabase';

  /** Supabase client */
  private client: SupabaseClient;

  /** Table name mapping */
  private tableMap: Record<string, string>;

  constructor(options: SupabaseAdapterOptions) {
    this.client = options.client;
    this.tableMap = options.tableMap ?? {};
  }

  /**
   * Get table name for entity.
   */
  private getTable(entity: string): string {
    return this.tableMap[entity] ?? entity;
  }

  /**
   * Find a single entity by ID.
   */
  async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const table = this.getTable(ctx.entity);
    let query = this.client.from(table).select(ctx.select?.join(',') ?? '*');

    // Apply ID filter
    if (ctx.params?.id) {
      query = query.eq('id', ctx.params.id);
    }

    // Apply additional filters
    query = this.applyFilters(query, ctx.filter);

    return new Promise((resolve) => {
      (query.single() as unknown as SupabaseFilterBuilder).then((result) => {
        if (result.error) {
          resolve({
            data: null as unknown as T,
            error: result.error,
          });
        } else {
          resolve({ data: result.data as T });
        }
      });
    });
  }

  /**
   * Find multiple entities.
   */
  async findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>> {
    const table = this.getTable(ctx.entity);
    let query = this.client.from(table).select(ctx.select?.join(',') ?? '*');

    // Apply filters
    query = this.applyFilters(query, ctx.filter);

    // Apply ordering
    if (ctx.orderBy) {
      for (const [column, direction] of Object.entries(ctx.orderBy)) {
        query = query.order(column, { ascending: direction === 'asc' });
      }
    }

    // Apply pagination
    if (ctx.limit !== undefined) {
      query = query.limit(ctx.limit);
    }
    if (ctx.offset !== undefined && typeof ctx.offset === 'number') {
      const from = ctx.offset;
      const to = ctx.limit ? from + ctx.limit - 1 : from + 999;
      query = query.range(from, to);
    }

    return new Promise((resolve) => {
      (query as unknown as SupabaseFilterBuilder).then((result) => {
        if (result.error) {
          resolve({
            data: [],
            error: result.error,
          });
        } else {
          resolve({
            data: (result.data ?? []) as T[],
            meta: result.count !== undefined ? { total: result.count } : undefined,
          });
        }
      });
    });
  }

  /**
   * Create a new entity.
   */
  async create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const table = this.getTable(ctx.entity);
    const query = this.client.from(table).insert(ctx.data).select().single();

    return new Promise((resolve) => {
      (query as unknown as SupabaseFilterBuilder).then((result) => {
        if (result.error) {
          resolve({
            data: null as unknown as T,
            error: result.error,
          });
        } else {
          resolve({ data: result.data as T });
        }
      });
    });
  }

  /**
   * Update an existing entity.
   */
  async update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const table = this.getTable(ctx.entity);
    let query = this.client.from(table).update(ctx.data);

    // Apply ID filter
    if (ctx.params?.id) {
      query = query.eq('id', ctx.params.id);
    }

    // Apply additional filters
    query = this.applyFilters(query, ctx.filter);

    return new Promise((resolve) => {
      (query.select().single() as unknown as SupabaseFilterBuilder).then((result) => {
        if (result.error) {
          resolve({
            data: null as unknown as T,
            error: result.error,
          });
        } else {
          resolve({ data: result.data as T });
        }
      });
    });
  }

  /**
   * Delete an entity.
   */
  async delete(ctx: AdapterContext): Promise<AdapterResponse<void>> {
    const table = this.getTable(ctx.entity);
    let query = this.client.from(table).delete();

    // Apply ID filter
    if (ctx.params?.id) {
      query = query.eq('id', ctx.params.id);
    }

    // Apply additional filters
    query = this.applyFilters(query, ctx.filter);

    return new Promise((resolve) => {
      (query as unknown as SupabaseFilterBuilder).then((result) => {
        if (result.error) {
          resolve({
            data: undefined,
            error: result.error,
          });
        } else {
          resolve({ data: undefined });
        }
      });
    });
  }

  /**
   * Apply filter conditions to query.
   */
  private applyFilters(
    query: SupabaseFilterBuilder,
    filter?: Record<string, unknown>
  ): SupabaseFilterBuilder {
    if (!filter) return query;

    for (const [key, value] of Object.entries(filter)) {
      if (value === null) {
        query = query.is(key, null);
      } else if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    }

    return query;
  }
}

/**
 * Create a SupabaseAdapter for Supabase backends.
 *
 * @param config - Configuration with Supabase client
 * @returns A configured Adapter instance
 *
 * @example
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 * import { createSupabaseAdapter } from 'schemock/adapters';
 *
 * const supabase = createClient(
 *   process.env.SUPABASE_URL!,
 *   process.env.SUPABASE_KEY!
 * );
 *
 * const adapter = createSupabaseAdapter({ client: supabase });
 * ```
 */
export function createSupabaseAdapter(config: SupabaseAdapterOptions): Adapter {
  return new SupabaseAdapter(config);
}
