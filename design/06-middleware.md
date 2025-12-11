# Middleware System

## Overview

The middleware system provides a composable way to add cross-cutting concerns to data operations:

- Authentication (token injection, refresh)
- Retry logic (exponential backoff)
- Caching (response caching, invalidation)
- Logging (request/response logging)
- Error handling (transformation, reporting)

## Middleware Interface

```typescript
// src/middleware/types.ts

import { AdapterContext, AdapterResponse } from '../adapters/types';

export interface MiddlewareContext extends AdapterContext {
  state: Record<string, any>;  // Mutable state that flows through middleware
}

export interface MiddlewareResult<T = any> {
  context?: Partial<MiddlewareContext>;  // Modified context for retry
  response?: AdapterResponse<T>;          // Short-circuit with response
  error?: Error;                          // Error to throw
}

export interface Middleware {
  name: string;
  before?: (ctx: MiddlewareContext) => Promise<MiddlewareResult | void>;
  after?: (ctx: MiddlewareContext, response: AdapterResponse) => Promise<AdapterResponse>;
  onError?: (ctx: MiddlewareContext, error: Error) => Promise<MiddlewareResult | void>;
}
```

## Middleware Chain Executor

```typescript
// src/middleware/chain.ts

import { Middleware, MiddlewareContext } from './types';
import { Adapter, AdapterContext, AdapterResponse } from '../adapters/types';

export class MiddlewareChain {
  private middlewares: Middleware[] = [];
  private adapter: Adapter;

  constructor(adapter: Adapter) {
    this.adapter = adapter;
  }

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute<T>(
    operation: 'findOne' | 'findMany' | 'create' | 'update' | 'delete' | 'custom',
    baseContext: AdapterContext
  ): Promise<AdapterResponse<T>> {
    const ctx: MiddlewareContext = {
      ...baseContext,
      operation,
      state: {},
    };

    return this.executeWithRetry(ctx, operation);
  }

  private async executeWithRetry<T>(
    ctx: MiddlewareContext,
    operation: string,
    maxRetries: number = 3
  ): Promise<AdapterResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Run 'before' middlewares
        for (const mw of this.middlewares) {
          if (mw.before) {
            const result = await mw.before(ctx);

            if (result?.response) {
              // Short-circuit with cached/mocked response
              return result.response as AdapterResponse<T>;
            }

            if (result?.error) {
              throw result.error;
            }

            if (result?.context) {
              Object.assign(ctx, result.context);
            }
          }
        }

        // Call adapter
        const adapterMethod = this.adapter[operation as keyof Adapter] as Function;
        let response = await adapterMethod.call(this.adapter, ctx);

        // Run 'after' middlewares (reverse order)
        for (const mw of [...this.middlewares].reverse()) {
          if (mw.after) {
            response = await mw.after(ctx, response);
          }
        }

        return response as AdapterResponse<T>;

      } catch (error) {
        lastError = error as Error;

        // Run 'onError' middlewares
        let shouldRetry = false;

        for (const mw of this.middlewares) {
          if (mw.onError) {
            const result = await mw.onError(ctx, lastError);

            if (result?.context) {
              Object.assign(ctx, result.context);
              shouldRetry = true;
              break;
            }

            if (result?.response) {
              return result.response as AdapterResponse<T>;
            }

            if (result?.error) {
              lastError = result.error;
            }
          }
        }

        if (!shouldRetry) {
          throw lastError;
        }
      }
    }

    throw lastError;
  }
}
```

## Built-in Middleware

### Auth Middleware

```typescript
// src/middleware/auth.ts

import { Middleware, MiddlewareContext } from './types';
import { AdapterError } from '../adapters/types';

export interface AuthMiddlewareConfig {
  getToken: () => Promise<string | null>;
  headerName?: string;
  headerFormat?: (token: string) => string;
  onUnauthorized?: (ctx: MiddlewareContext) => Promise<void>;
  refreshToken?: () => Promise<string | null>;
}

export function createAuthMiddleware(config: AuthMiddlewareConfig): Middleware {
  const {
    getToken,
    headerName = 'Authorization',
    headerFormat = (token) => `Bearer ${token}`,
    onUnauthorized,
    refreshToken,
  } = config;

  let isRefreshing = false;
  let refreshPromise: Promise<string | null> | null = null;

  return {
    name: 'auth',

    async before(ctx) {
      const token = await getToken();

      if (token) {
        ctx.headers = {
          ...ctx.headers,
          [headerName]: headerFormat(token),
        };
      }
    },

    async onError(ctx, error) {
      if (error instanceof AdapterError && error.status === 401) {
        if (refreshToken && !isRefreshing) {
          isRefreshing = true;
          refreshPromise = refreshToken();

          try {
            const newToken = await refreshPromise;
            isRefreshing = false;
            refreshPromise = null;

            if (newToken) {
              ctx.headers = {
                ...ctx.headers,
                [headerName]: headerFormat(newToken),
              };
              return { context: ctx };  // Retry
            }
          } catch {
            isRefreshing = false;
            refreshPromise = null;
          }
        } else if (isRefreshing && refreshPromise) {
          const newToken = await refreshPromise;
          if (newToken) {
            ctx.headers = {
              ...ctx.headers,
              [headerName]: headerFormat(newToken),
            };
            return { context: ctx };  // Retry
          }
        }

        if (onUnauthorized) {
          await onUnauthorized(ctx);
        }
      }

      return { error };
    },
  };
}
```

### Retry Middleware

```typescript
// src/middleware/retry.ts

import { Middleware, MiddlewareContext } from './types';
import { AdapterError } from '../adapters/types';

export interface RetryMiddlewareConfig {
  maxRetries?: number;
  retryDelay?: number | ((attempt: number) => number);
  retryOn?: (error: Error) => boolean;
}

export function createRetryMiddleware(config: RetryMiddlewareConfig = {}): Middleware {
  const {
    maxRetries = 3,
    retryDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000),
    retryOn = (error) => {
      if (error instanceof AdapterError) {
        return error.status >= 500;
      }
      return error.message.includes('network') || error.message.includes('fetch');
    },
  } = config;

  return {
    name: 'retry',

    async onError(ctx, error) {
      const attempt = (ctx.state.retryAttempt ?? 0) + 1;

      if (attempt <= maxRetries && retryOn(error)) {
        const delay = typeof retryDelay === 'function'
          ? retryDelay(attempt)
          : retryDelay;

        await new Promise(resolve => setTimeout(resolve, delay));

        return {
          context: {
            ...ctx,
            state: { ...ctx.state, retryAttempt: attempt },
          },
        };
      }

      return { error };
    },
  };
}
```

### Cache Middleware

```typescript
// src/middleware/cache.ts

import { Middleware, MiddlewareContext } from './types';
import { AdapterResponse } from '../adapters/types';

export interface CacheMiddlewareConfig {
  storage?: CacheStorage;
  ttl?: number;
  cacheOperations?: string[];
  keyGenerator?: (ctx: MiddlewareContext) => string;
}

interface CacheStorage {
  get(key: string): Promise<{ data: any; timestamp: number } | null>;
  set(key: string, value: { data: any; timestamp: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function createCacheMiddleware(config: CacheMiddlewareConfig = {}): Middleware {
  const {
    storage = createInMemoryCache(),
    ttl = 5 * 60 * 1000,
    cacheOperations = ['findOne', 'findMany'],
    keyGenerator = (ctx) => `${ctx.entity}:${ctx.operation}:${JSON.stringify(ctx.params)}`,
  } = config;

  return {
    name: 'cache',

    async before(ctx) {
      if (!cacheOperations.includes(ctx.operation)) return;

      const key = keyGenerator(ctx);
      const cached = await storage.get(key);

      if (cached && Date.now() - cached.timestamp < ttl) {
        return {
          response: { data: cached.data, meta: { fromCache: true } },
        };
      }
    },

    async after(ctx, response) {
      if (cacheOperations.includes(ctx.operation)) {
        const key = keyGenerator(ctx);
        await storage.set(key, {
          data: response.data,
          timestamp: Date.now(),
        });
      }

      // Invalidate on mutations
      if (['create', 'update', 'delete'].includes(ctx.operation)) {
        // Clear list cache for this entity
        // Implementation depends on cache storage
      }

      return response;
    },
  };
}

function createInMemoryCache(): CacheStorage {
  const cache = new Map<string, { data: any; timestamp: number }>();

  return {
    async get(key) { return cache.get(key) ?? null; },
    async set(key, value) { cache.set(key, value); },
    async delete(key) { cache.delete(key); },
    async clear() { cache.clear(); },
  };
}
```

### Logger Middleware

```typescript
// src/middleware/logger.ts

import { Middleware, MiddlewareContext } from './types';
import { AdapterResponse } from '../adapters/types';

export interface LoggerMiddlewareConfig {
  log?: (message: string, data?: any) => void;
  logRequest?: boolean;
  logResponse?: boolean;
  logErrors?: boolean;
}

export function createLoggerMiddleware(config: LoggerMiddlewareConfig = {}): Middleware {
  const {
    log = console.log,
    logRequest = true,
    logResponse = true,
    logErrors = true,
  } = config;

  return {
    name: 'logger',

    async before(ctx) {
      if (logRequest) {
        ctx.state.requestStartTime = Date.now();
        log(`[${ctx.operation}] ${ctx.entity}`, {
          params: ctx.params,
          data: ctx.data,
        });
      }
    },

    async after(ctx, response) {
      if (logResponse) {
        const duration = Date.now() - (ctx.state.requestStartTime ?? 0);
        log(`[${ctx.operation}] ${ctx.entity} completed in ${duration}ms`, {
          data: response.data,
          meta: response.meta,
        });
      }
      return response;
    },

    async onError(ctx, error) {
      if (logErrors) {
        const duration = Date.now() - (ctx.state.requestStartTime ?? 0);
        log(`[${ctx.operation}] ${ctx.entity} failed after ${duration}ms`, {
          error: error.message,
          params: ctx.params,
        });
      }
      return { error };
    },
  };
}
```

## Configuration

### Global Middleware

```typescript
import { configureDataLayer } from '@schemock/config';
import { createAuthMiddleware } from '@schemock/middleware/auth';
import { createRetryMiddleware } from '@schemock/middleware/retry';
import { createLoggerMiddleware } from '@schemock/middleware/logger';

configureDataLayer({
  middleware: [
    createAuthMiddleware({
      getToken: async () => localStorage.getItem('token'),
      refreshToken: async () => {
        const response = await fetch('/auth/refresh');
        const { token } = await response.json();
        localStorage.setItem('token', token);
        return token;
      },
      onUnauthorized: async () => {
        window.location.href = '/login';
      },
    }),
    createRetryMiddleware({ maxRetries: 3 }),
    createLoggerMiddleware(),
  ],
});
```

### Per-Entity Middleware

```typescript
configureDataLayer({
  middleware: [createAuthMiddleware({...})],

  entityMiddleware: {
    post: [
      createCacheMiddleware({ ttl: 60000 }),  // Cache posts for 1 minute
    ],
  },
});
```

## Execution Order

```
Request:
  Auth.before() → Logger.before() → Cache.before() → Retry.before()
                                          │
                                          ▼
                              [Cache hit? Return cached]
                                          │
                                          ▼
                                    ADAPTER CALL
                                          │
                                          ▼
Response:
  Retry.after() → Cache.after() → Logger.after() → Auth.after()
                       │
                       ▼
               [Store in cache]

Error:
  Auth.onError() → Logger.onError() → Cache.onError() → Retry.onError()
                                                              │
                                                              ▼
                                                    [Retry? Loop back]
```
