/**
 * Middleware Types - Interfaces for the middleware chain
 *
 * @module middleware/types
 * @category Middleware
 */

import type { AdapterContext, AdapterResponse } from '../adapters/types';

/**
 * Result returned by middleware hooks.
 */
export interface MiddlewareResult {
  /** Whether to continue to the next middleware */
  continue: boolean;
  /** Modified response (for short-circuiting) */
  response?: AdapterResponse<unknown>;
  /** Error to throw */
  error?: Error;
}

/**
 * Middleware function type (alternative style).
 *
 * Middleware can intercept requests before they reach the adapter
 * and responses before they return to the caller.
 */
export type MiddlewareFunction = <T>(
  ctx: MiddlewareContext,
  next: () => Promise<AdapterResponse<T>>
) => Promise<AdapterResponse<T>>;

/**
 * Middleware interface with before/after/onError hooks.
 *
 * All middleware must implement this interface.
 *
 * @example
 * ```typescript
 * const loggerMiddleware: Middleware = {
 *   name: 'logger',
 *   before: async (ctx) => {
 *     console.log(`Request: ${ctx.operation} ${ctx.entity}`);
 *   },
 *   after: async (ctx, response) => {
 *     console.log(`Response: ${ctx.operation} completed`);
 *     return response;
 *   },
 * };
 * ```
 */
export interface Middleware {
  /** Unique name for this middleware */
  name: string;

  /**
   * Called before the request is executed.
   * Can modify context or short-circuit the request.
   */
  before?: (ctx: MiddlewareContext) => Promise<MiddlewareResult | void>;

  /**
   * Called after the response is received.
   * Can modify the response before returning.
   */
  after?: <T>(ctx: MiddlewareContext, response: AdapterResponse<T>) => Promise<AdapterResponse<T>>;

  /**
   * Called when an error occurs.
   * Can handle the error or re-throw.
   */
  onError?: (ctx: MiddlewareContext, error: Error) => Promise<MiddlewareResult | void>;

  /**
   * Alternative: single handler function (Koa-style).
   * If provided, before/after/onError are ignored.
   */
  handler?: MiddlewareFunction;

  /** Whether this middleware is enabled */
  enabled?: boolean;
}

/**
 * Middleware context passed through the chain.
 */
export interface MiddlewareContext extends AdapterContext {
  /** The operation being performed (findOne, findMany, create, update, delete) */
  operation: string;
  /** Start time of the request (milliseconds) */
  startTime?: number;
  /** Request metadata added by middleware */
  metadata: Record<string, unknown>;
  /** Whether to skip cache */
  skipCache?: boolean;
  /** Current retry count */
  retryCount?: number;
  /** Headers to include in request (for fetch-based adapters) */
  headers?: Record<string, string>;
  /**
   * Execution context extracted from headers (user info, tenant, etc.)
   * Populated by context middleware from Authorization header and other custom headers.
   */
  context?: Record<string, unknown>;
}
