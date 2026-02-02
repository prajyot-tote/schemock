/**
 * API for defining client-side middleware with before/after/onError hooks.
 * Client middleware runs in the browser and intercepts API calls.
 *
 * @module schema/define-client-middleware
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineClientMiddleware } from 'schemock/schema';
 *
 * // Analytics middleware - track API calls
 * const AnalyticsMiddleware = defineClientMiddleware('analytics', {
 *   before: async ({ request, operation }) => {
 *     console.log(`API call: ${operation.action} ${operation.entity}`);
 *     return { metadata: { startTime: Date.now() } };
 *   },
 *   after: async ({ response, metadata }) => {
 *     const duration = Date.now() - (metadata.startTime as number);
 *     analytics.track('api_call', { duration, status: response.status });
 *   },
 *   onError: async ({ error, operation, retryCount }) => {
 *     analytics.track('api_error', {
 *       error: error.message,
 *       operation: `${operation.action}:${operation.entity}`,
 *       retryCount,
 *     });
 *   },
 * });
 *
 * // Auth middleware - inject tokens
 * const AuthMiddleware = defineClientMiddleware('auth', {
 *   before: async ({ request }) => {
 *     const token = localStorage.getItem('authToken');
 *     if (token) {
 *       return {
 *         request: {
 *           headers: { ...request.headers, Authorization: `Bearer ${token}` },
 *         },
 *       };
 *     }
 *   },
 *   onError: async ({ error }) => {
 *     if (error.status === 401) {
 *       localStorage.removeItem('authToken');
 *       window.location.href = '/login';
 *     }
 *   },
 *   order: 'early',
 * });
 *
 * // Cache middleware - short-circuit with cached data
 * const CacheMiddleware = defineClientMiddleware('cache', {
 *   before: async ({ request, operation }) => {
 *     if (request.method === 'GET') {
 *       const cached = sessionStorage.getItem(`cache:${request.url}`);
 *       if (cached) {
 *         return {
 *           response: { data: JSON.parse(cached), status: 200 },
 *           metadata: { fromCache: true },
 *         };
 *       }
 *     }
 *   },
 *   after: async ({ request, response, metadata }) => {
 *     if (request.method === 'GET' && !metadata.fromCache) {
 *       sessionStorage.setItem(`cache:${request.url}`, JSON.stringify(response.data));
 *     }
 *   },
 * });
 * ```
 */

import type { ClientMiddlewareConfig, ClientMiddlewareSchema } from './types';

/**
 * Defines client-side middleware with before/after/onError hooks.
 * Use this for browser-side interceptors that run during API calls.
 *
 * Unlike server middleware (which uses a handler pattern with `next()`),
 * client middleware uses discrete hooks that run at specific points:
 * - `before`: Runs before the request is sent (can modify request or short-circuit)
 * - `after`: Runs after a successful response (can transform response)
 * - `onError`: Runs when an error occurs (can handle or suppress errors)
 *
 * @param name - Unique middleware name (e.g., 'analytics', 'auth', 'cache')
 * @param options - Middleware configuration with hooks
 * @returns ClientMiddlewareSchema
 *
 * @example Logging middleware
 * ```typescript
 * const LoggerMiddleware = defineClientMiddleware('logger', {
 *   before: async ({ request, operation }) => {
 *     console.log(`[${operation.entity}] ${request.method} ${request.url}`);
 *     return { metadata: { requestedAt: new Date().toISOString() } };
 *   },
 *   after: async ({ response, metadata }) => {
 *     console.log(`Response: ${response.status}`, { requestedAt: metadata.requestedAt });
 *   },
 * });
 * ```
 *
 * @example Auth token injection
 * ```typescript
 * const AuthMiddleware = defineClientMiddleware('auth', {
 *   before: async ({ request }) => {
 *     const token = getAuthToken();
 *     if (token) {
 *       return {
 *         request: {
 *           headers: { ...request.headers, Authorization: `Bearer ${token}` },
 *         },
 *       };
 *     }
 *   },
 *   onError: async ({ error }) => {
 *     if (error.status === 401) {
 *       redirectToLogin();
 *     }
 *   },
 *   order: 'early', // Run before other middleware
 * });
 * ```
 *
 * @example Response transformation
 * ```typescript
 * const TransformMiddleware = defineClientMiddleware('transform', {
 *   after: async ({ response }) => {
 *     // Transform snake_case to camelCase
 *     return {
 *       ...response,
 *       data: toCamelCase(response.data),
 *     };
 *   },
 * });
 * ```
 */
export function defineClientMiddleware(
  name: string,
  options: ClientMiddlewareConfig
): ClientMiddlewareSchema {
  // Validate name
  if (!name || typeof name !== 'string') {
    throw new Error('Client middleware name must be a non-empty string');
  }

  // Validate name format (lowercase, alphanumeric, hyphens)
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Client middleware name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens: ${name}`
    );
  }

  // Validate at least one hook is provided
  if (!options.before && !options.after && !options.onError) {
    throw new Error(
      `Client middleware must have at least one hook (before, after, or onError): ${name}`
    );
  }

  // Validate hooks are functions if provided
  if (options.before && typeof options.before !== 'function') {
    throw new Error(`Client middleware 'before' hook must be a function: ${name}`);
  }
  if (options.after && typeof options.after !== 'function') {
    throw new Error(`Client middleware 'after' hook must be a function: ${name}`);
  }
  if (options.onError && typeof options.onError !== 'function') {
    throw new Error(`Client middleware 'onError' hook must be a function: ${name}`);
  }

  return {
    name,
    before: options.before,
    after: options.after,
    onError: options.onError,
    description: options.description,
    order: options.order ?? 'normal',
    _clientMiddleware: true as const,
  };
}
