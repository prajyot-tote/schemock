/**
 * Middleware Defaults - Default ordering and configuration
 *
 * Provides sensible defaults for middleware ordering and common
 * middleware chain configurations.
 *
 * @module middleware/defaults
 * @category Middleware
 */

import type { Middleware } from './types';

/**
 * Default middleware execution order.
 *
 * The order is designed for optimal security and performance:
 * 1. auth - Add authentication token to headers (must be first)
 * 2. logger - Log request start (early for timing)
 * 3. context - Extract context from headers (after auth adds token)
 * 4. rls - Apply row-level security (needs context)
 * 5. retry - Handle retries (wraps actual request)
 * 6. cache - Check cache (before hitting storage)
 *
 * After hooks execute in reverse order.
 */
export const DEFAULT_MIDDLEWARE_ORDER = [
  'auth',     // 1. Add token to headers
  'logger',   // 2. Log request start
  'context',  // 3. Extract context from headers
  'rls',      // 4. Apply RLS pre-checks
  'retry',    // 5. Handle retries
  'cache',    // 6. Check cache
  // [adapter call happens here]
  // After hooks in reverse:
  // 6. cache - Store in cache
  // 5. retry - Handle retry logic
  // 4. rls - Post-filter results
  // 3. context - (no after hook)
  // 2. logger - Log response
  // 1. auth - Handle 401
];

/**
 * Sort middleware array according to a specified order.
 * Unknown middleware are placed at the end in their original order.
 *
 * @param middlewares - Array of middleware to sort
 * @param customOrder - Optional custom order array (defaults to DEFAULT_MIDDLEWARE_ORDER)
 * @returns Sorted middleware array
 *
 * @example
 * ```typescript
 * const sorted = orderMiddleware([
 *   createCacheMiddleware(),
 *   createAuthMiddleware(),
 *   createLoggerMiddleware(),
 * ]);
 * // => [auth, logger, cache]
 * ```
 */
export function orderMiddleware(
  middlewares: Middleware[],
  customOrder?: string[]
): Middleware[] {
  const order = customOrder || DEFAULT_MIDDLEWARE_ORDER;

  // Create a map of middleware name to index in order array
  const orderMap = new Map<string, number>();
  order.forEach((name, index) => {
    orderMap.set(name, index);
  });

  // Sort middleware by their position in the order array
  return [...middlewares].sort((a, b) => {
    const aIndex = orderMap.get(a.name);
    const bIndex = orderMap.get(b.name);

    // Both have defined positions
    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex - bIndex;
    }

    // Only a has a defined position - put it first
    if (aIndex !== undefined) {
      return -1;
    }

    // Only b has a defined position - put it first
    if (bIndex !== undefined) {
      return 1;
    }

    // Neither has a defined position - maintain original order
    return 0;
  });
}

/**
 * Filter middleware by enabled/disabled state and names.
 *
 * @param middlewares - Array of middleware to filter
 * @param enabled - Middleware names to enable (if empty, all are enabled)
 * @param disabled - Middleware names to disable
 * @returns Filtered middleware array
 *
 * @example
 * ```typescript
 * const filtered = filterMiddleware(
 *   middlewares,
 *   [], // Enable all
 *   ['cache'] // But disable cache
 * );
 * ```
 */
export function filterMiddleware(
  middlewares: Middleware[],
  enabled: string[] = [],
  disabled: string[] = []
): Middleware[] {
  return middlewares.filter((m) => {
    // Check explicit enabled property
    if (m.enabled === false) {
      return false;
    }

    // Check disabled list
    if (disabled.includes(m.name)) {
      return false;
    }

    // If enabled list is provided and non-empty, only include those
    if (enabled.length > 0 && !enabled.includes(m.name)) {
      return false;
    }

    return true;
  });
}

/**
 * Middleware configuration preset for mock/development mode.
 * Includes auth, context, and logger.
 */
export const MOCK_MIDDLEWARE_PRESET = ['auth', 'context', 'logger'];

/**
 * Middleware configuration preset for production mode.
 * Includes all middleware with caching and retries.
 */
export const PRODUCTION_MIDDLEWARE_PRESET = ['auth', 'context', 'rls', 'cache', 'retry', 'logger'];

/**
 * Middleware configuration preset for testing.
 * Minimal middleware for fast test execution.
 */
export const TEST_MIDDLEWARE_PRESET = ['context', 'rls'];
