/**
 * Retry Middleware - Automatic retry with exponential backoff
 *
 * Automatically retries failed requests with configurable
 * retry count and exponential backoff delay.
 *
 * @module middleware/retry
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Configuration options for retry middleware.
 */
export interface RetryMiddlewareConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatuses?: number[];
  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback when a retry is attempted */
  onRetry?: (attempt: number, error: Error, ctx: MiddlewareContext) => void;
}

/**
 * Default retryable HTTP status codes.
 */
const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

/**
 * Create a retry middleware with exponential backoff.
 *
 * @param config - Retry middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const retryMiddleware = createRetryMiddleware({
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   onRetry: (attempt, error) => {
 *     console.log(`Retry attempt ${attempt}: ${error.message}`);
 *   },
 * });
 * ```
 */
export function createRetryMiddleware(config?: RetryMiddlewareConfig): Middleware {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    maxDelay = 30000,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES,
    isRetryable,
    onRetry,
  } = config ?? {};

  /**
   * Check if an error should trigger a retry.
   */
  function shouldRetry(error: Error): boolean {
    // Custom retry logic
    if (isRetryable) {
      return isRetryable(error);
    }

    // Check for retryable HTTP status codes
    const message = error.message;
    for (const status of retryableStatuses) {
      if (message.includes(String(status))) {
        return true;
      }
    }

    // Network errors
    if (
      message.includes('Network') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('timeout') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for a retry attempt.
   */
  function calculateDelay(attempt: number): number {
    if (!exponentialBackoff) {
      return retryDelay;
    }

    // Exponential backoff: delay * 2^attempt with jitter
    const exponentialDelay = retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Sleep for a specified duration.
   */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return {
    name: 'retry',

    async before(ctx: MiddlewareContext) {
      // Initialize retry count
      ctx.retryCount = ctx.retryCount ?? 0;
    },

    async onError(ctx: MiddlewareContext, error: Error) {
      const attempt = ctx.retryCount ?? 0;

      // Check if we should retry
      if (attempt >= maxRetries || !shouldRetry(error)) {
        // Max retries exceeded or non-retryable error
        return { continue: true };
      }

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, error, ctx);
      }

      // Calculate and wait for backoff delay
      const delay = calculateDelay(attempt);
      await sleep(delay);

      // Increment retry count for next attempt
      ctx.retryCount = attempt + 1;

      // Add retry metadata
      ctx.metadata.lastRetryError = error.message;
      ctx.metadata.retryAttempt = attempt + 1;

      // Signal that we should retry (not continue to error handlers)
      return {
        continue: false,
        response: {
          data: null,
          meta: { shouldRetry: true, retryAttempt: attempt + 1 },
        },
      };
    },

    async after<T>(ctx: MiddlewareContext, response: AdapterResponse<T>) {
      // Add retry info to response metadata
      if (ctx.retryCount && ctx.retryCount > 0) {
        response.meta = {
          ...response.meta,
          retryCount: ctx.retryCount,
        };
      }
      return response;
    },
  };
}
