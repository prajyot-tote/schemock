/**
 * Auth Middleware - Authentication token management
 *
 * Automatically attaches authentication tokens to requests
 * and handles token refresh on 401 responses.
 *
 * @module middleware/auth
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Configuration options for auth middleware.
 */
export interface AuthMiddlewareConfig {
  /** Function to get the current auth token */
  getToken: () => string | null | Promise<string | null>;
  /** Function to refresh the token (optional) */
  refreshToken?: () => Promise<string>;
  /** Callback when user is unauthorized (optional) */
  onUnauthorized?: () => void;
  /** Header name for the token (default: 'Authorization') */
  headerName?: string;
  /** Token prefix (default: 'Bearer ') */
  tokenPrefix?: string;
  /** Whether to skip auth for certain operations */
  skipOperations?: string[];
}

/**
 * Create an authentication middleware.
 *
 * Attaches auth tokens to requests and handles 401 responses
 * with optional token refresh.
 *
 * @param config - Auth middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const authMiddleware = createAuthMiddleware({
 *   getToken: () => localStorage.getItem('token'),
 *   refreshToken: async () => {
 *     const response = await fetch('/auth/refresh');
 *     const { token } = await response.json();
 *     localStorage.setItem('token', token);
 *     return token;
 *   },
 *   onUnauthorized: () => {
 *     window.location.href = '/login';
 *   },
 * });
 * ```
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig): Middleware {
  const {
    getToken,
    refreshToken,
    onUnauthorized,
    headerName = 'Authorization',
    tokenPrefix = 'Bearer ',
    skipOperations = [],
  } = config;

  // Track if we're currently refreshing to prevent multiple refreshes
  let isRefreshing = false;
  let refreshPromise: Promise<string> | null = null;

  return {
    name: 'auth',

    async before(ctx: MiddlewareContext) {
      // Skip auth for certain operations
      if (skipOperations.includes(ctx.operation)) {
        return;
      }

      // Get the current token
      const token = await getToken();

      if (token) {
        // Initialize headers if not present
        ctx.headers = ctx.headers ?? {};
        ctx.headers[headerName] = `${tokenPrefix}${token}`;
      }

      // Add auth metadata
      ctx.metadata.authenticated = !!token;
    },

    async after<T>(ctx: MiddlewareContext, response: AdapterResponse<T>) {
      // Check for 401 Unauthorized
      const isUnauthorized =
        response.error?.message?.includes('401') ||
        response.error?.message?.includes('Unauthorized');

      if (!isUnauthorized) {
        return response;
      }

      // Attempt token refresh if available
      if (refreshToken && !ctx.metadata.tokenRefreshAttempted) {
        ctx.metadata.tokenRefreshAttempted = true;

        try {
          // Handle concurrent refresh requests
          if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = refreshToken();
          }

          const newToken = await refreshPromise;
          isRefreshing = false;
          refreshPromise = null;

          // Update context with new token
          ctx.headers = ctx.headers ?? {};
          ctx.headers[headerName] = `${tokenPrefix}${newToken}`;

          // Mark for retry
          return {
            ...response,
            meta: {
              ...response.meta,
              shouldRetry: true,
              newToken,
            },
          };
        } catch (refreshError) {
          isRefreshing = false;
          refreshPromise = null;

          // Token refresh failed, user is unauthorized
          if (onUnauthorized) {
            onUnauthorized();
          }
        }
      } else if (onUnauthorized) {
        // No refresh function or already attempted, notify unauthorized
        onUnauthorized();
      }

      return response;
    },

    async onError(ctx: MiddlewareContext, error: Error) {
      // Check if error is a 401
      const isUnauthorized =
        error.message.includes('401') ||
        error.message.includes('Unauthorized');

      if (isUnauthorized && onUnauthorized) {
        onUnauthorized();
      }

      // Let the error propagate
      return { continue: true };
    },
  };
}
