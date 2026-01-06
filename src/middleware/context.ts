/**
 * Context Middleware - Extract execution context from headers
 *
 * Extracts user information, tenant IDs, and other context from
 * request headers (Authorization, custom headers) and populates
 * ctx.context for use by RLS and other middleware.
 *
 * @module middleware/context
 * @category Middleware
 */

import type { Middleware, MiddlewareContext } from './types';

/**
 * Configuration options for context middleware.
 */
export interface ContextMiddlewareConfig {
  /**
   * Function to decode/validate token and extract user info.
   * In production, this would validate the JWT signature.
   *
   * @param token - The JWT token (without 'Bearer ' prefix)
   * @returns Decoded token payload or null if invalid
   */
  decodeToken?: (token: string) => Record<string, unknown> | null;

  /**
   * Additional headers to extract as context.
   * Headers will be converted to camelCase context keys.
   *
   * @example ['X-Tenant-ID', 'X-Request-ID']
   */
  extractHeaders?: string[];

  /**
   * Mock mode: decode JWT without validation.
   * In mock mode, the JWT payload is decoded without signature validation.
   * This is useful for development/testing where tokens may be self-signed.
   *
   * @default true
   */
  mockMode?: boolean;

  /**
   * Header name for the Authorization token.
   *
   * @default 'Authorization'
   */
  authHeaderName?: string;

  /**
   * Token prefix to strip (e.g., 'Bearer ').
   *
   * @default 'Bearer '
   */
  tokenPrefix?: string;
}

/**
 * Decode a JWT payload without validation.
 * Extracts the payload from the second segment of the token.
 *
 * @param token - The JWT token
 * @returns Decoded payload or empty object if invalid
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {};
    }

    // Decode base64url to base64, then to string
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Handle browser and Node.js environments
    let decoded: string;
    if (typeof atob === 'function') {
      decoded = atob(payload);
    } else {
      decoded = Buffer.from(payload, 'base64').toString('utf-8');
    }

    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

/**
 * Convert a header name to a camelCase context key.
 *
 * @example
 * headerToContextKey('X-Tenant-ID') // => 'tenantId'
 * headerToContextKey('X-Request-ID') // => 'requestId'
 * headerToContextKey('Content-Type') // => 'contentType'
 */
function headerToContextKey(header: string): string {
  return header
    .replace(/^X-/i, '') // Remove X- prefix
    .split('-')
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Create a context middleware that extracts execution context from headers.
 *
 * This middleware:
 * 1. Extracts JWT payload from Authorization header
 * 2. Extracts additional values from custom headers
 * 3. Populates ctx.context for use by RLS middleware
 *
 * @param config - Context middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const contextMiddleware = createContextMiddleware({
 *   mockMode: true, // Decode JWT without validation
 *   extractHeaders: ['X-Tenant-ID', 'X-Request-ID'],
 * });
 *
 * // With custom decoder
 * const contextMiddleware = createContextMiddleware({
 *   decodeToken: (token) => {
 *     // Validate and decode the token
 *     return jwt.verify(token, secret);
 *   },
 * });
 * ```
 */
export function createContextMiddleware(config?: ContextMiddlewareConfig): Middleware {
  const {
    decodeToken,
    extractHeaders = [],
    mockMode = true,
    authHeaderName = 'Authorization',
    tokenPrefix = 'Bearer ',
  } = config || {};

  return {
    name: 'context',

    async before(ctx: MiddlewareContext) {
      // Initialize context
      ctx.context = ctx.context || {};

      // Extract from Authorization header
      const authHeader =
        ctx.headers?.[authHeaderName] ||
        ctx.headers?.[authHeaderName.toLowerCase()];

      if (authHeader) {
        // Strip token prefix (e.g., 'Bearer ')
        let token = authHeader;
        if (tokenPrefix && authHeader.toLowerCase().startsWith(tokenPrefix.toLowerCase())) {
          token = authHeader.slice(tokenPrefix.length);
        }

        if (token) {
          if (decodeToken) {
            // Use custom decoder (production mode)
            const decoded = decodeToken(token);
            if (decoded) {
              ctx.context = { ...ctx.context, ...decoded };
            }
          } else if (mockMode) {
            // In mock mode, decode without validation
            const decoded = decodeJwtPayload(token);
            ctx.context = { ...ctx.context, ...decoded };
          }
        }
      }

      // Extract additional headers
      for (const header of extractHeaders) {
        const value =
          ctx.headers?.[header] ||
          ctx.headers?.[header.toLowerCase()];

        if (value) {
          const key = headerToContextKey(header);
          ctx.context[key] = value;
        }
      }

      // Store extracted context in metadata for debugging
      ctx.metadata.contextExtracted = Object.keys(ctx.context).length > 0;
    },
  };
}

/**
 * Create a mock JWT token for testing.
 * Encodes the payload as a JWT without signing.
 *
 * @param payload - The token payload
 * @returns A mock JWT token string
 *
 * @example
 * ```typescript
 * const token = createMockJwt({
 *   sub: 'user-123',
 *   userId: 'user-123',
 *   role: 'admin',
 *   tenantId: 'tenant-456',
 * });
 *
 * // Use in headers
 * api._setHeaders({ Authorization: `Bearer ${token}` });
 * ```
 */
export function createMockJwt(payload: Record<string, unknown>): string {
  // Create a minimal JWT header
  const header = { alg: 'none', typ: 'JWT' };

  // Add standard claims if not present
  const fullPayload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    ...payload,
  };

  // Encode parts
  const encodeBase64Url = (obj: object): string => {
    const json = JSON.stringify(obj);
    // Handle browser and Node.js environments
    let base64: string;
    if (typeof btoa === 'function') {
      base64 = btoa(json);
    } else {
      base64 = Buffer.from(json).toString('base64');
    }
    // Convert to base64url
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerPart = encodeBase64Url(header);
  const payloadPart = encodeBase64Url(fullPayload);

  // No signature in mock mode
  return `${headerPart}.${payloadPart}.`;
}
