/**
 * MiddlewareChain - Executor for composable middleware
 *
 * Chains middleware in order, executing before hooks, the handler,
 * and after hooks in sequence.
 *
 * @module middleware/chain
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { Middleware, MiddlewareContext, MiddlewareResult } from './types';

/**
 * MiddlewareChain class for executing middleware in sequence.
 *
 * Supports both hook-based middleware (before/after/onError) and
 * function-based middleware (Koa-style handler).
 *
 * @example
 * ```typescript
 * const chain = new MiddlewareChain([
 *   createAuthMiddleware({ getToken: () => 'token' }),
 *   createLoggerMiddleware(),
 *   createCacheMiddleware({ ttl: 60000 }),
 * ]);
 *
 * const result = await chain.execute(ctx, async () => {
 *   return adapter.findMany(ctx);
 * });
 * ```
 */
export class MiddlewareChain {
  /** The middleware stack */
  private middlewares: Middleware[];

  /**
   * Create a new MiddlewareChain.
   *
   * @param middlewares - Array of middleware to execute in order
   */
  constructor(middlewares: Middleware[]) {
    this.middlewares = middlewares.filter((m) => m.enabled !== false);
  }

  /**
   * Execute the middleware chain with the given handler.
   *
   * @param ctx - The middleware context
   * @param handler - The final handler (adapter call)
   * @returns The response after all middleware processing
   *
   * @example
   * ```typescript
   * const result = await chain.execute<User[]>(
   *   { entity: 'user', operation: 'findMany', metadata: {} },
   *   () => adapter.findMany({ entity: 'user' })
   * );
   * ```
   */
  async execute<T>(
    ctx: MiddlewareContext,
    handler: () => Promise<AdapterResponse<T>>
  ): Promise<AdapterResponse<T>> {
    // Set start time for timing middleware
    ctx.startTime = Date.now();
    ctx.metadata = ctx.metadata ?? {};

    // Check if any middleware uses function-style handlers
    const hasFunctionHandlers = this.middlewares.some((m) => m.handler);

    if (hasFunctionHandlers) {
      return this.executeFunctionStyle(ctx, handler);
    }

    return this.executeHookStyle(ctx, handler);
  }

  /**
   * Execute middleware using hook-style (before/after/onError).
   */
  private async executeHookStyle<T>(
    ctx: MiddlewareContext,
    handler: () => Promise<AdapterResponse<T>>
  ): Promise<AdapterResponse<T>> {
    // Execute all 'before' hooks
    for (const middleware of this.middlewares) {
      if (middleware.before) {
        const result = await middleware.before(ctx);
        if (result && !result.continue) {
          // Short-circuit with provided response
          if (result.response) {
            return result.response as AdapterResponse<T>;
          }
          if (result.error) {
            throw result.error;
          }
        }
      }
    }

    // Execute the main handler
    let response: AdapterResponse<T>;
    try {
      response = await handler();
    } catch (error) {
      // Execute onError hooks
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          const result = await middleware.onError(
            ctx,
            error instanceof Error ? error : new Error(String(error))
          );
          if (result && !result.continue) {
            if (result.response) {
              return result.response as AdapterResponse<T>;
            }
            if (result.error) {
              throw result.error;
            }
          }
        }
      }
      // Re-throw if not handled
      throw error;
    }

    // Execute all 'after' hooks in reverse order
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      if (middleware.after) {
        response = await middleware.after(ctx, response);
      }
    }

    return response;
  }

  /**
   * Execute middleware using function-style (Koa-like compose).
   */
  private async executeFunctionStyle<T>(
    ctx: MiddlewareContext,
    handler: () => Promise<AdapterResponse<T>>
  ): Promise<AdapterResponse<T>> {
    // Build the middleware stack from right to left
    let index = -1;

    const dispatch = async (i: number): Promise<AdapterResponse<T>> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i >= this.middlewares.length) {
        // End of middleware chain, execute handler
        return handler();
      }

      const middleware = this.middlewares[i];

      if (middleware.handler) {
        // Function-style middleware
        return middleware.handler(ctx, () => dispatch(i + 1));
      }

      // Hook-style middleware in function chain
      if (middleware.before) {
        const result = await middleware.before(ctx);
        if (result && !result.continue) {
          if (result.response) {
            return result.response as AdapterResponse<T>;
          }
          if (result.error) {
            throw result.error;
          }
        }
      }

      let response: AdapterResponse<T>;
      try {
        response = await dispatch(i + 1);
      } catch (error) {
        if (middleware.onError) {
          const result = await middleware.onError(
            ctx,
            error instanceof Error ? error : new Error(String(error))
          );
          if (result && !result.continue) {
            if (result.response) {
              return result.response as AdapterResponse<T>;
            }
            if (result.error) {
              throw result.error;
            }
          }
        }
        throw error;
      }

      if (middleware.after) {
        response = await middleware.after(ctx, response);
      }

      return response;
    };

    return dispatch(0);
  }

  /**
   * Add middleware to the chain.
   *
   * @param middleware - Middleware to add
   */
  use(middleware: Middleware): this {
    if (middleware.enabled !== false) {
      this.middlewares.push(middleware);
    }
    return this;
  }

  /**
   * Remove middleware by name.
   *
   * @param name - Name of middleware to remove
   */
  remove(name: string): this {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
    return this;
  }

  /**
   * Get middleware by name.
   *
   * @param name - Middleware name
   * @returns The middleware or undefined
   */
  get(name: string): Middleware | undefined {
    return this.middlewares.find((m) => m.name === name);
  }

  /**
   * Get all middleware names.
   *
   * @returns Array of middleware names
   */
  names(): string[] {
    return this.middlewares.map((m) => m.name);
  }

  /**
   * Get the middleware count.
   */
  get length(): number {
    return this.middlewares.length;
  }
}

/**
 * Create a middleware chain from an array of middleware.
 *
 * @param middlewares - Array of middleware
 * @returns A configured MiddlewareChain
 *
 * @example
 * ```typescript
 * const chain = createMiddlewareChain([
 *   createAuthMiddleware({ getToken: () => token }),
 *   createLoggerMiddleware(),
 * ]);
 * ```
 */
export function createMiddlewareChain(middlewares: Middleware[]): MiddlewareChain {
  return new MiddlewareChain(middlewares);
}
