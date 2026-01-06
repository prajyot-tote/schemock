/**
 * Cache Middleware - Response caching with TTL
 *
 * Caches successful responses to reduce API calls
 * and improve performance.
 *
 * @module middleware/cache
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Configuration options for cache middleware.
 */
export interface CacheMiddlewareConfig {
  /** Time-to-live for cache entries in ms (default: 60000 = 1 minute) */
  ttl?: number;
  /** Operations to cache (default: ['findOne', 'findMany']) */
  cacheOperations?: string[];
  /** Maximum number of cached entries (default: 1000) */
  maxSize?: number;
  /** Custom cache key generator */
  getCacheKey?: (ctx: MiddlewareContext) => string;
  /** Whether to cache errors (default: false) */
  cacheErrors?: boolean;
  /** Storage backend (default: in-memory Map) */
  storage?: CacheStorage;
}

/**
 * Cache storage interface.
 */
export interface CacheStorage {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

/**
 * Cache entry structure.
 */
export interface CacheEntry<T> {
  /** Cached response data */
  data: AdapterResponse<T>;
  /** Timestamp when cached */
  timestamp: number;
  /** TTL for this entry */
  ttl: number;
}

/**
 * Default in-memory cache storage.
 */
class MemoryCacheStorage implements CacheStorage {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    return this.cache.get(key) as CacheEntry<T> | undefined;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }
}

/**
 * Default operations to cache.
 */
const DEFAULT_CACHE_OPERATIONS = ['findOne', 'findMany'];

/**
 * Create a cache middleware with TTL.
 *
 * @param config - Cache middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const cacheMiddleware = createCacheMiddleware({
 *   ttl: 60000, // 1 minute
 *   cacheOperations: ['findOne', 'findMany'],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom cache key
 * const cacheMiddleware = createCacheMiddleware({
 *   ttl: 300000, // 5 minutes
 *   getCacheKey: (ctx) => `${ctx.entity}:${ctx.params?.id}:${ctx.filter?.status}`,
 * });
 * ```
 */
export function createCacheMiddleware(config?: CacheMiddlewareConfig): Middleware {
  const {
    ttl = 60000,
    cacheOperations = DEFAULT_CACHE_OPERATIONS,
    maxSize = 1000,
    getCacheKey,
    cacheErrors = false,
    storage,
  } = config ?? {};

  // Use provided storage or create in-memory storage
  const cacheStorage = storage ?? new MemoryCacheStorage(maxSize);

  /**
   * Generate a cache key from context.
   */
  function generateCacheKey(ctx: MiddlewareContext): string {
    if (getCacheKey) {
      return getCacheKey(ctx);
    }

    // Default key: operation:entity:params:filter
    const parts = [ctx.operation, ctx.entity];

    if (ctx.params) {
      parts.push(JSON.stringify(ctx.params));
    }

    if (ctx.filter) {
      parts.push(JSON.stringify(ctx.filter));
    }

    if (ctx.orderBy) {
      parts.push(JSON.stringify(ctx.orderBy));
    }

    if (ctx.limit !== undefined) {
      parts.push(`limit:${ctx.limit}`);
    }

    if (ctx.offset !== undefined) {
      parts.push(`offset:${ctx.offset}`);
    }

    return parts.join(':');
  }

  /**
   * Check if an entry is still valid.
   */
  function isValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  return {
    name: 'cache',

    async before(ctx: MiddlewareContext) {
      // Skip caching if explicitly disabled
      if (ctx.skipCache) {
        return;
      }

      // Only cache specified operations
      if (!cacheOperations.includes(ctx.operation)) {
        return;
      }

      const key = generateCacheKey(ctx);
      const entry = await cacheStorage.get(key);

      if (entry && isValid(entry)) {
        // Cache hit - return cached response
        ctx.metadata.cacheHit = true;
        ctx.metadata.cacheKey = key;

        return {
          continue: false,
          response: {
            ...entry.data,
            meta: {
              ...entry.data.meta,
              cached: true,
              cachedAt: entry.timestamp,
            },
          },
        };
      }

      // Cache miss - continue with request
      ctx.metadata.cacheHit = false;
      ctx.metadata.cacheKey = key;
    },

    async after<T>(ctx: MiddlewareContext, response: AdapterResponse<T>) {
      // Skip caching if explicitly disabled
      if (ctx.skipCache) {
        return response;
      }

      // Only cache specified operations
      if (!cacheOperations.includes(ctx.operation)) {
        return response;
      }

      // Don't cache errors (unless configured to)
      if (response.error && !cacheErrors) {
        return response;
      }

      // Cache the response
      const key = ctx.metadata.cacheKey as string;
      if (key) {
        await cacheStorage.set(key, {
          data: response,
          timestamp: Date.now(),
          ttl,
        });
      }

      return response;
    },
  };
}

/**
 * Create a utility to invalidate cache entries.
 *
 * @param storage - The cache storage to invalidate
 * @returns Invalidation functions
 *
 * @example
 * ```typescript
 * const storage = new MemoryCacheStorage();
 * const cache = createCacheInvalidator(storage);
 *
 * // Clear all cache
 * await cache.clear();
 *
 * // Invalidate specific entry
 * await cache.invalidate('findMany:user');
 * ```
 */
export function createCacheInvalidator(storage: CacheStorage) {
  return {
    invalidate: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    size: () => storage.size(),
  };
}

// Export the storage class for custom implementations
export { MemoryCacheStorage };
