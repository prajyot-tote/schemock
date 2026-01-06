/**
 * Rate Limiter - Sliding window rate limiting
 *
 * @module security/rate-limit
 * @category Security
 */

import type { RateLimitConfig, RateLimitResult } from './types';

/**
 * Rate limit entry tracking requests in a window.
 */
interface RateLimitEntry {
  /** Request count in current window */
  count: number;
  /** Window start timestamp */
  windowStart: number;
}

/**
 * RateLimiter class implementing sliding window rate limiting.
 *
 * Tracks request counts per key within configurable time windows.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * const result = await limiter.checkRateLimit('user:123', {
 *   max: 100,
 *   windowMs: 60000, // 1 minute
 * });
 *
 * if (!result.allowed) {
 *   throw new Error(`Rate limited. Retry after ${result.retryAfter} seconds`);
 * }
 * ```
 */
export class RateLimiter {
  /** Rate limit entries by key */
  private limits = new Map<string, RateLimitEntry>();

  /** Cleanup interval ID */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** Default cleanup interval (5 minutes) */
  private readonly cleanupIntervalMs = 5 * 60 * 1000;

  constructor() {
    // Start periodic cleanup of expired entries
    this.startCleanup();
  }

  /**
   * Check rate limit for a key.
   *
   * @param key - Unique identifier (e.g., user ID, IP address)
   * @param config - Rate limit configuration
   * @returns Rate limit result
   *
   * @example
   * ```typescript
   * const result = await limiter.checkRateLimit('api:user:123', {
   *   max: 1000,
   *   windowMs: 60 * 60 * 1000, // 1 hour
   * });
   * ```
   */
  async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const { max, windowMs, keyPrefix, skip } = config;

    // Apply key prefix if provided
    const fullKey = keyPrefix ? `${keyPrefix}:${key}` : key;

    // Check skip function
    if (skip && skip(key)) {
      return {
        allowed: true,
        remaining: max,
        limit: max,
        resetTime: now + windowMs,
      };
    }

    // Get or create entry
    let entry = this.limits.get(fullKey);

    // Check if window has expired
    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      entry = {
        count: 1,
        windowStart: now,
      };
      this.limits.set(fullKey, entry);

      return {
        allowed: true,
        remaining: max - 1,
        limit: max,
        resetTime: now + windowMs,
      };
    }

    // Check if limit exceeded
    if (entry.count >= max) {
      const resetTime = entry.windowStart + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        limit: max,
        resetTime,
      };
    }

    // Increment count
    entry.count++;

    return {
      allowed: true,
      remaining: max - entry.count,
      limit: max,
      resetTime: entry.windowStart + windowMs,
    };
  }

  /**
   * Reset rate limit for a key.
   *
   * @param key - Key to reset
   * @param keyPrefix - Optional key prefix
   *
   * @example
   * ```typescript
   * limiter.reset('user:123');
   * ```
   */
  reset(key: string, keyPrefix?: string): void {
    const fullKey = keyPrefix ? `${keyPrefix}:${key}` : key;
    this.limits.delete(fullKey);
  }

  /**
   * Reset all rate limits.
   */
  resetAll(): void {
    this.limits.clear();
  }

  /**
   * Get current status for a key.
   *
   * @param key - Key to check
   * @param config - Rate limit config for remaining calculation
   * @returns Current limit status or undefined if no entry
   */
  getStatus(key: string, config: RateLimitConfig): RateLimitResult | undefined {
    const fullKey = config.keyPrefix ? `${config.keyPrefix}:${key}` : key;
    const entry = this.limits.get(fullKey);

    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    const { max, windowMs } = config;

    // Check if window expired
    if (now - entry.windowStart >= windowMs) {
      return undefined;
    }

    return {
      allowed: entry.count < max,
      remaining: Math.max(0, max - entry.count),
      limit: max,
      resetTime: entry.windowStart + windowMs,
      retryAfter: entry.count >= max ? Math.ceil((entry.windowStart + windowMs - now) / 1000) : undefined,
    };
  }

  /**
   * Start periodic cleanup of expired entries.
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, entry] of this.limits.entries()) {
      if (now - entry.windowStart > maxAge) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.limits.clear();
  }

  /**
   * Get the number of tracked keys.
   */
  get size(): number {
    return this.limits.size;
  }
}

/**
 * Create a rate limiter middleware.
 *
 * @param config - Rate limit configuration
 * @param getKey - Function to extract rate limit key from context
 * @returns Middleware
 *
 * @example
 * ```typescript
 * const rateLimitMiddleware = createRateLimitMiddleware(
 *   { max: 100, windowMs: 60000 },
 *   (ctx) => ctx.userId || ctx.ip
 * );
 * ```
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig,
  getKey: (ctx: Record<string, unknown>) => string
) {
  const limiter = new RateLimiter();

  return {
    name: 'rate-limit',
    before: async (ctx: Record<string, unknown>) => {
      const key = getKey(ctx);
      const result = await limiter.checkRateLimit(key, config);

      if (!result.allowed) {
        return {
          continue: false,
          response: {
            data: null,
            error: new Error(`Rate limit exceeded. Retry after ${result.retryAfter} seconds`),
            meta: {
              rateLimited: true,
              retryAfter: result.retryAfter,
              limit: result.limit,
              remaining: result.remaining,
            },
          },
        };
      }

      // Add rate limit info to metadata
      ctx.metadata = {
        ...(ctx.metadata as Record<string, unknown>),
        rateLimit: {
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime,
        },
      };
    },
  };
}
