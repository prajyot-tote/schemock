/**
 * FetchAdapter - REST/Fetch adapter for production backends
 *
 * Default adapter for connecting to REST APIs using the Fetch API.
 * Maps entity operations to standard REST endpoints.
 *
 * @module adapters/fetch
 * @category Adapters
 */

import type {
  Adapter,
  AdapterContext,
  AdapterResponse,
  FetchAdapterOptions,
} from './types';

/**
 * FetchAdapter class implementing the Adapter interface.
 *
 * Provides a clean mapping from Schemock operations to REST API calls.
 *
 * @example
 * ```typescript
 * const adapter = new FetchAdapter({ baseUrl: '/api' });
 *
 * // GET /api/users/123
 * const user = await adapter.findOne({ entity: 'user', params: { id: '123' } });
 *
 * // POST /api/users
 * const newUser = await adapter.create({ entity: 'user', data: { name: 'John' } });
 * ```
 */
export class FetchAdapter implements Adapter {
  /** Adapter name identifier */
  name = 'fetch';

  /** Configuration options */
  private options: Required<FetchAdapterOptions>;

  /**
   * Create a new FetchAdapter instance.
   *
   * @param options - Configuration options
   */
  constructor(options?: FetchAdapterOptions) {
    this.options = {
      baseUrl: options?.baseUrl ?? '',
      headers: options?.headers ?? {},
      timeout: options?.timeout ?? 30000,
      fetch: options?.fetch ?? globalThis.fetch.bind(globalThis),
    };
  }

  /**
   * Find a single entity by ID.
   *
   * @param ctx - The adapter context
   * @returns The found entity
   */
  async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const url = this.buildUrl(ctx, true);
    return this.request<T>('GET', url);
  }

  /**
   * Find multiple entities.
   *
   * @param ctx - The adapter context
   * @returns Array of entities
   */
  async findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>> {
    const url = this.buildUrl(ctx, false);
    return this.request<T[]>('GET', url);
  }

  /**
   * Create a new entity.
   *
   * @param ctx - The adapter context with data
   * @returns The created entity
   */
  async create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const url = this.buildUrl(ctx, false);
    return this.request<T>('POST', url, ctx.data);
  }

  /**
   * Update an existing entity.
   *
   * @param ctx - The adapter context with params and data
   * @returns The updated entity
   */
  async update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const url = this.buildUrl(ctx, true);
    return this.request<T>('PATCH', url, ctx.data);
  }

  /**
   * Delete an entity.
   *
   * @param ctx - The adapter context with params
   * @returns Void on success
   */
  async delete(ctx: AdapterContext): Promise<AdapterResponse<void>> {
    const url = this.buildUrl(ctx, true);
    return this.request<void>('DELETE', url);
  }

  /**
   * Execute a custom operation.
   *
   * @param ctx - The adapter context with operation details
   * @returns Custom response data
   */
  async custom<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    const url = ctx.endpoint
      ? `${this.options.baseUrl}${ctx.endpoint}`
      : this.buildUrl(ctx, false);

    const method = ctx.method ?? 'GET';
    return this.request<T>(method, url, ctx.data);
  }

  /**
   * Build URL for the request.
   */
  private buildUrl(ctx: AdapterContext, includeId: boolean): string {
    const basePath = ctx.endpoint ?? `/${ctx.entity}s`;
    let url = `${this.options.baseUrl}${basePath}`;

    // Add ID if needed
    if (includeId && ctx.params?.id) {
      url += `/${ctx.params.id}`;
    }

    // Add query parameters
    const queryParams = new URLSearchParams();

    // Add filter parameters
    if (ctx.filter) {
      for (const [key, value] of Object.entries(ctx.filter)) {
        queryParams.set(key, String(value));
      }
    }

    // Add pagination
    if (ctx.limit !== undefined) {
      queryParams.set('limit', String(ctx.limit));
    }
    if (ctx.offset !== undefined) {
      queryParams.set('offset', String(ctx.offset));
    }

    // Add ordering
    if (ctx.orderBy) {
      const orderParts = Object.entries(ctx.orderBy).map(
        ([field, dir]) => `${field}:${dir}`
      );
      queryParams.set('orderBy', orderParts.join(','));
    }

    // Add select fields
    if (ctx.select?.length) {
      queryParams.set('select', ctx.select.join(','));
    }

    // Add include relations
    if (ctx.include?.length) {
      queryParams.set('include', ctx.include.join(','));
    }

    const queryString = queryParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Execute HTTP request.
   */
  private async request<T>(
    method: string,
    url: string,
    data?: unknown
  ): Promise<AdapterResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeout
    );

    try {
      const response = await this.options.fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          data: null as unknown as T,
          error: new Error(`HTTP ${response.status}: ${errorBody}`),
        };
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { data: undefined as unknown as T };
      }

      const json = await response.json();

      // Handle wrapped response { data: ..., meta: ... }
      if (json && typeof json === 'object' && 'data' in json) {
        return {
          data: json.data as T,
          meta: json.meta,
        };
      }

      return { data: json as T };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          data: null as unknown as T,
          error: new Error('Request timeout'),
        };
      }

      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

/**
 * Create a FetchAdapter for production REST APIs.
 *
 * @param config - Configuration options
 * @returns A configured Adapter instance
 *
 * @example
 * ```typescript
 * import { createFetchAdapter } from 'schemock/adapters';
 *
 * // Basic usage
 * const adapter = createFetchAdapter({ baseUrl: '/api' });
 *
 * // With custom headers
 * const adapter = createFetchAdapter({
 *   baseUrl: 'https://api.example.com',
 *   headers: {
 *     'Authorization': 'Bearer token',
 *   },
 *   timeout: 10000,
 * });
 * ```
 */
export function createFetchAdapter(config?: FetchAdapterOptions): Adapter {
  return new FetchAdapter(config);
}
