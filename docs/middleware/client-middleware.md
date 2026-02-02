# Client Middleware

Client middleware runs **in the browser** and intercepts API calls before they're sent and after responses are received.

## When to Use Client Middleware

| Use Case | Why Client-Side |
|----------|-----------------|
| Token injection | Token is stored in browser (localStorage/cookie) |
| Retry on failure | User experience - retry without page reload |
| Response caching | Reduce network calls, faster UI |
| Offline queue | Store requests when offline, sync later |
| Analytics | Track API usage from client perspective |
| Error normalization | Consistent error format for UI |

## Built-in Client Middleware

### Auth (Token Injection)

Automatically adds the auth token to every request.

```typescript
frontend: {
  middleware: {
    auth: {
      // Where the token is stored
      tokenStorage: 'localStorage',  // 'localStorage' | 'sessionStorage' | 'memory' | 'cookie'

      // Key name for the token
      tokenKey: 'authToken',         // default: 'authToken'

      // Token prefix in Authorization header
      tokenPrefix: 'Bearer',         // default: 'Bearer'

      // What to do on 401 response
      onUnauthorized: 'redirect:/login',  // or path to custom handler

      // Skip auth for these operations
      skip: ['login', 'register', 'public-list'],
    },
  },
}
```

**What it does:**
```typescript
// Before each request
headers['Authorization'] = `Bearer ${localStorage.getItem('authToken')}`;

// After 401 response
window.location.href = '/login';
```

### Retry

Automatically retry failed requests with exponential backoff.

```typescript
frontend: {
  middleware: {
    retry: {
      maxRetries: 3,                      // default: 3
      retryOn: [500, 502, 503, 504],      // HTTP status codes to retry
      backoff: 'exponential',             // 'exponential' | 'linear' | 'fixed'
      baseDelay: 1000,                    // Starting delay in ms
      maxDelay: 30000,                    // Maximum delay in ms

      // Custom retry condition (optional)
      shouldRetry: './src/helpers/should-retry.ts',
    },
  },
}
```

**What it does:**
```typescript
// On 500 error
// Wait 1000ms, retry
// Wait 2000ms, retry
// Wait 4000ms, retry
// Give up, return error
```

### Cache

Cache GET responses to reduce network calls.

```typescript
frontend: {
  middleware: {
    cache: {
      storage: 'memory',           // 'memory' | 'localStorage'
      ttl: 60000,                  // Time-to-live in ms (1 minute)
      maxSize: 100,                // Max entries (memory only)

      // Which operations to cache
      operations: ['list', 'get'], // default: ['list', 'get']

      // Cache key generator (optional)
      keyGenerator: './src/helpers/cache-key.ts',
    },
  },
}
```

**What it does:**
```typescript
// GET /api/users
// → Check cache: MISS
// → Fetch from server
// → Store in cache

// GET /api/users (within 60s)
// → Check cache: HIT
// → Return cached data (no network call)
```

### Logger

Log API calls for debugging.

```typescript
frontend: {
  middleware: {
    logger: {
      enabled: true,
      level: 'debug',              // 'debug' | 'info' | 'warn' | 'error'
      includeHeaders: false,       // Log request headers
      includeBody: false,          // Log request/response body
      redactFields: ['password', 'token'],
    },
  },
}
```

**What it does:**
```typescript
// Console output
// [API] GET /api/users → 200 (142ms)
// [API] POST /api/posts → 201 (89ms)
// [API] DELETE /api/posts/123 → 403 (12ms) - Forbidden
```

## Custom Client Middleware

For anything beyond built-in options, create custom middleware:

```typescript
// src/middleware/client/analytics.ts
import { defineClientMiddleware } from 'schemock/schema';

export const analyticsMiddleware = defineClientMiddleware('analytics', {
  // Runs BEFORE every request
  before: async ({ request, context }) => {
    const startTime = Date.now();

    // Track the API call
    analytics.track('api_request', {
      method: request.method,
      url: request.url,
      userId: context.userId,
    });

    // Store start time for duration calculation
    return { startTime };
  },

  // Runs AFTER every response
  after: async ({ request, response, context, metadata }) => {
    const duration = Date.now() - metadata.startTime;

    analytics.track('api_response', {
      method: request.method,
      url: request.url,
      status: response.status,
      duration,
      userId: context.userId,
    });

    // Return response unchanged (or modify it)
    return response;
  },

  // Runs on errors
  onError: async ({ request, error, context }) => {
    analytics.track('api_error', {
      method: request.method,
      url: request.url,
      error: error.message,
      userId: context.userId,
    });

    // Re-throw or return a custom error response
    throw error;
  },
});
```

Then add to config:

```typescript
frontend: {
  middleware: {
    custom: ['./src/middleware/client/analytics.ts'],
  },
}
```

## Client Middleware Context

Every client middleware receives a context object:

```typescript
interface ClientMiddlewareContext {
  // Request info
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };

  // User context (from auth)
  context: {
    userId?: string;
    email?: string;
    role?: string;
    [key: string]: unknown;
  };

  // Metadata from previous middleware
  metadata: Record<string, unknown>;

  // Operation info
  operation: {
    entity: string;      // 'user', 'post', etc.
    action: string;      // 'list', 'get', 'create', 'update', 'delete'
  };
}
```

## Execution Order

Client middleware executes in this order:

```
Request Flow:
  auth.before → retry.before → cache.before → custom.before → fetch()

Response Flow:
  fetch() → custom.after → cache.after → retry.after → auth.after
```

You can customize the order:

```typescript
frontend: {
  middleware: {
    chain: ['auth', 'analytics', 'retry', 'cache'],  // Custom order
  },
}
```

## Generated Code

When you run `npx schemock generate`, the client middleware is generated as interceptors:

```typescript
// Generated: src/generated/client/interceptor.ts
import type { ClientConfig } from './types';

export function createInterceptor(config: InterceptorConfig = {}): ClientConfig {
  return {
    onRequest: async (ctx) => {
      // Auth: inject token
      const token = localStorage.getItem('authToken');
      if (token) {
        ctx.headers['Authorization'] = `Bearer ${token}`;
      }
      return ctx;
    },

    onResponse: async (response) => {
      // Cache: store successful responses
      if (response.ok && shouldCache(response)) {
        cacheStore.set(getCacheKey(response), response.data);
      }
      return response;
    },

    onError: async (error) => {
      // Auth: handle 401
      if (error.status === 401) {
        window.location.href = '/login';
      }

      // Retry: attempt retry for 5xx errors
      if (error.status >= 500 && retryCount < 3) {
        return retry(error.request);
      }

      throw error;
    },
  };
}
```

## Usage with Generated Client

```typescript
import { createClient, createInterceptor } from './generated/client';

// Create interceptor with middleware
const interceptor = createInterceptor({
  onUnauthorized: () => router.push('/login'),
});

// Create API client with interceptor
const api = createClient(interceptor);

// All calls now have middleware applied
const users = await api.user.list();  // Auth token added automatically
```

## Common Patterns

### Token Refresh

```typescript
// src/middleware/client/token-refresh.ts
import { defineClientMiddleware } from 'schemock/schema';

export const tokenRefreshMiddleware = defineClientMiddleware('token-refresh', {
  onError: async ({ error, request }) => {
    if (error.status === 401) {
      // Try to refresh the token
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
          const { accessToken } = await response.json();
          localStorage.setItem('authToken', accessToken);

          // Retry the original request
          return fetch(request.url, {
            ...request,
            headers: {
              ...request.headers,
              'Authorization': `Bearer ${accessToken}`,
            },
          });
        }
      }

      // Refresh failed, redirect to login
      window.location.href = '/login';
    }

    throw error;
  },
});
```

### Offline Queue

```typescript
// src/middleware/client/offline-queue.ts
import { defineClientMiddleware } from 'schemock/schema';

const offlineQueue: Array<{ request: Request; resolve: Function }> = [];

export const offlineQueueMiddleware = defineClientMiddleware('offline-queue', {
  before: async ({ request }) => {
    if (!navigator.onLine && request.method !== 'GET') {
      // Queue the request for later
      return new Promise((resolve) => {
        offlineQueue.push({ request, resolve });

        // Notify user
        showToast('You are offline. Request will be sent when back online.');
      });
    }
  },
});

// Process queue when back online
window.addEventListener('online', async () => {
  while (offlineQueue.length > 0) {
    const { request, resolve } = offlineQueue.shift()!;
    const response = await fetch(request);
    resolve(response);
  }
});
```

### Request Deduplication

```typescript
// src/middleware/client/dedupe.ts
import { defineClientMiddleware } from 'schemock/schema';

const inFlightRequests = new Map<string, Promise<Response>>();

export const dedupeMiddleware = defineClientMiddleware('dedupe', {
  before: async ({ request }) => {
    if (request.method === 'GET') {
      const key = `${request.method}:${request.url}`;

      // If same request is already in flight, return that promise
      if (inFlightRequests.has(key)) {
        return inFlightRequests.get(key);
      }
    }
  },

  after: async ({ request, response }) => {
    if (request.method === 'GET') {
      const key = `${request.method}:${request.url}`;
      inFlightRequests.delete(key);
    }
    return response;
  },
});
```

## Next Steps

- [Server Middleware](./server-middleware.md) - Learn about server-side middleware
- [Custom Middleware](./custom-middleware.md) - Deep dive into writing custom middleware
- [Examples](./examples.md) - More patterns and recipes
