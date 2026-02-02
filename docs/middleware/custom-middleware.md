# Custom Middleware

Custom middleware is the most powerful feature of Schemock's middleware system. It lets you define **any** cross-cutting concern and have it generated for your target platform.

## The Key Insight

**Client and server middleware are fundamentally different.** Schemock provides two separate APIs:

| API | Runs In | Has Access To |
|-----|---------|---------------|
| `defineClientMiddleware()` | Browser | localStorage, sessionStorage, browser APIs |
| `defineServerMiddleware()` | Server | Environment variables, database, secrets |

This separation ensures:
1. You don't accidentally use server APIs in client code
2. You don't expose secrets to the browser
3. Code generation produces correct output for each environment

## File Organization

```
src/
├── middleware/
│   ├── client/                 # Browser middleware
│   │   ├── analytics.ts
│   │   ├── offline-queue.ts
│   │   └── error-boundary.ts
│   └── server/                 # Server middleware
│       ├── tenant.ts
│       ├── audit-log.ts
│       └── api-key.ts
```

## Client Middleware API

### `defineClientMiddleware(name, options)`

```typescript
import { defineClientMiddleware } from 'schemock/schema';

export const myMiddleware = defineClientMiddleware('my-middleware', {
  // Called BEFORE each request
  before?: async (context: ClientBeforeContext) => BeforeResult | void;

  // Called AFTER each response
  after?: async (context: ClientAfterContext) => Response | void;

  // Called on errors
  onError?: async (context: ClientErrorContext) => Response | void;

  // Metadata
  description?: string;
  order?: 'early' | 'normal' | 'late';
});
```

### Before Hook

Runs before the request is sent. Use it to:
- Modify request headers
- Add query parameters
- Transform request body
- Short-circuit with a cached response

```typescript
interface ClientBeforeContext {
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  context: {
    userId?: string;
    [key: string]: unknown;
  };
  operation: {
    entity: string;
    action: string;
  };
}

interface BeforeResult {
  // Modified request (optional)
  request?: Partial<ClientBeforeContext['request']>;

  // Short-circuit with this response (skip fetch)
  response?: { data: unknown; status: number };

  // Pass data to after hook
  metadata?: Record<string, unknown>;
}
```

**Example: Add Custom Headers**
```typescript
export const customHeadersMiddleware = defineClientMiddleware('custom-headers', {
  before: async ({ request }) => {
    return {
      request: {
        headers: {
          ...request.headers,
          'X-Client-Version': '1.0.0',
          'X-Request-ID': crypto.randomUUID(),
        },
      },
    };
  },
});
```

**Example: Return Cached Response**
```typescript
export const cacheMiddleware = defineClientMiddleware('cache', {
  before: async ({ request }) => {
    if (request.method === 'GET') {
      const cached = localStorage.getItem(`cache:${request.url}`);
      if (cached) {
        return {
          response: { data: JSON.parse(cached), status: 200 },
        };
      }
    }
  },
});
```

### After Hook

Runs after receiving a response. Use it to:
- Transform response data
- Cache responses
- Track analytics
- Normalize errors

```typescript
interface ClientAfterContext {
  request: { method: string; url: string; headers: Record<string, string> };
  response: { data: unknown; status: number; headers: Record<string, string> };
  context: { userId?: string; [key: string]: unknown };
  metadata: Record<string, unknown>;  // From before hook
}
```

**Example: Transform Response**
```typescript
export const transformMiddleware = defineClientMiddleware('transform', {
  after: async ({ response }) => {
    // Unwrap nested data
    if (response.data?.data) {
      return {
        ...response,
        data: response.data.data,
      };
    }
    return response;
  },
});
```

**Example: Track Performance**
```typescript
export const performanceMiddleware = defineClientMiddleware('performance', {
  before: async () => {
    return { metadata: { startTime: Date.now() } };
  },
  after: async ({ request, response, metadata }) => {
    const duration = Date.now() - (metadata.startTime as number);

    // Report to analytics
    performance.mark(`api-${request.url}`, { detail: { duration } });

    // Add to response headers (for debugging)
    return {
      ...response,
      headers: {
        ...response.headers,
        'X-Response-Time': `${duration}ms`,
      },
    };
  },
});
```

### Error Hook

Runs when a request fails. Use it to:
- Retry requests
- Refresh tokens
- Normalize error format
- Report errors

```typescript
interface ClientErrorContext {
  request: { method: string; url: string; headers: Record<string, string>; body?: unknown };
  error: { status: number; message: string; data?: unknown };
  context: { userId?: string; [key: string]: unknown };
  metadata: Record<string, unknown>;
  retryCount: number;
}
```

**Example: Retry with Backoff**
```typescript
export const retryMiddleware = defineClientMiddleware('retry', {
  onError: async ({ request, error, retryCount }) => {
    // Only retry server errors
    if (error.status >= 500 && retryCount < 3) {
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));

      // Return undefined to retry
      return undefined;
    }

    // Re-throw to propagate error
    throw error;
  },
});
```

**Example: Token Refresh**
```typescript
export const tokenRefreshMiddleware = defineClientMiddleware('token-refresh', {
  onError: async ({ request, error }) => {
    if (error.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        const newToken = await refreshAccessToken(refreshToken);

        if (newToken) {
          localStorage.setItem('authToken', newToken);

          // Retry with new token
          const response = await fetch(request.url, {
            ...request,
            headers: { ...request.headers, Authorization: `Bearer ${newToken}` },
          });

          return response.json();
        }
      }

      // Redirect to login
      window.location.href = '/login';
    }

    throw error;
  },
});
```

## Server Middleware API

### `defineServerMiddleware(name, options)`

```typescript
import { defineServerMiddleware, field } from 'schemock/schema';

export const myMiddleware = defineServerMiddleware('my-middleware', {
  // Optional: Configuration schema
  config?: {
    [key: string]: FieldBuilder;  // Using field.* helpers
  };

  // The middleware handler
  handler: async (context: ServerHandlerContext) => MiddlewareResult;

  // Metadata
  description?: string;
  order?: 'early' | 'normal' | 'late';
});
```

### Handler Context

```typescript
interface ServerHandlerContext<TConfig = Record<string, unknown>> {
  // Request context
  ctx: {
    headers: Record<string, string | null>;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    query: Record<string, string>;
    body?: unknown;
    context: Record<string, unknown>;  // Populated by previous middleware
    metadata: Record<string, unknown>;
  };

  // Config values (from your config schema)
  config: TConfig;

  // Continue to next middleware
  next: () => Promise<MiddlewareResult>;

  // Database client (if configured)
  db?: DatabaseClient;
}
```

### Middleware Result

```typescript
interface MiddlewareResult {
  // Return early with a response (stops the chain)
  response?: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  };

  // If no response, middleware continues to next()
}
```

### Config Schema

Use `field.*` helpers to define typed configuration:

```typescript
import { defineServerMiddleware, field } from 'schemock/schema';

export const configuredMiddleware = defineServerMiddleware('configured', {
  config: {
    // String with default
    headerName: field.string().default('X-Custom-Header'),

    // Boolean with default
    required: field.boolean().default(true),

    // Number with constraints
    maxSize: field.number().min(1).max(1000).default(100),

    // Enum
    mode: field.enum(['strict', 'lenient']).default('strict'),

    // Array
    allowedOrigins: field.array(field.string()).default(['*']),

    // Object
    limits: field.object({
      maxRequests: field.number().default(100),
      windowMs: field.number().default(60000),
    }),
  },

  handler: async ({ ctx, config, next }) => {
    // config is fully typed based on your schema
    const headerValue = ctx.headers[config.headerName.toLowerCase()];

    if (config.required && !headerValue) {
      return {
        response: {
          status: 400,
          body: { error: `Missing required header: ${config.headerName}` },
        },
      };
    }

    return next();
  },
});
```

### Using Config in schemock.config.ts

```typescript
// schemock.config.ts
export default defineConfig({
  backend: {
    middleware: {
      custom: [
        {
          path: './src/middleware/server/configured.ts',
          // Override default config values
          config: {
            headerName: 'X-My-Header',
            required: false,
            maxSize: 500,
          },
        },
      ],
    },
  },
});
```

Or use the simple array format for defaults:

```typescript
backend: {
  middleware: {
    custom: ['./src/middleware/server/configured.ts'],  // Uses defaults
  },
}
```

## Complete Examples

### Client: Analytics Middleware

```typescript
// src/middleware/client/analytics.ts
import { defineClientMiddleware } from 'schemock/schema';

interface AnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
}

export const analyticsMiddleware = defineClientMiddleware('analytics', {
  before: async ({ request, context, operation }) => {
    // Track request start
    trackEvent('api_request_started', {
      method: request.method,
      endpoint: request.url,
      entity: operation.entity,
      action: operation.action,
      userId: context.userId,
    });

    return {
      metadata: { startTime: Date.now() },
    };
  },

  after: async ({ request, response, metadata, operation }) => {
    const duration = Date.now() - (metadata.startTime as number);

    // Track successful response
    trackEvent('api_request_completed', {
      method: request.method,
      endpoint: request.url,
      entity: operation.entity,
      action: operation.action,
      status: response.status,
      duration,
    });

    return response;
  },

  onError: async ({ request, error, operation }) => {
    // Track error
    trackEvent('api_request_failed', {
      method: request.method,
      endpoint: request.url,
      entity: operation.entity,
      action: operation.action,
      status: error.status,
      message: error.message,
    });

    throw error;
  },

  description: 'Tracks API calls for analytics',
  order: 'early',
});

function trackEvent(event: string, properties: Record<string, unknown>) {
  // Send to your analytics service
  if (typeof window !== 'undefined' && window.analytics) {
    window.analytics.track(event, properties);
  }
}
```

### Server: Multi-Tenant Middleware

```typescript
// src/middleware/server/tenant.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const tenantMiddleware = defineServerMiddleware('tenant', {
  config: {
    headerName: field.string().default('X-Tenant-ID'),
    required: field.boolean().default(true),
    validateExists: field.boolean().default(true),
    cacheValidation: field.boolean().default(true),
  },

  handler: async ({ ctx, config, next, db }) => {
    // Extract tenant ID from header
    const tenantId = ctx.headers[config.headerName.toLowerCase()];

    // Check if required
    if (!tenantId) {
      if (config.required) {
        return {
          response: {
            status: 400,
            body: {
              error: 'Tenant ID required',
              header: config.headerName,
            },
          },
        };
      }
      return next();
    }

    // Validate tenant exists (with optional caching)
    if (config.validateExists && db) {
      const cacheKey = `tenant:${tenantId}`;
      let tenant = config.cacheValidation ? tenantCache.get(cacheKey) : null;

      if (!tenant) {
        tenant = await db.tenant.findUnique({ where: { id: tenantId } });

        if (!tenant) {
          return {
            response: {
              status: 404,
              body: { error: 'Tenant not found', tenantId },
            },
          };
        }

        if (config.cacheValidation) {
          tenantCache.set(cacheKey, tenant, { ttl: 60000 });
        }
      }

      // Check if tenant is active
      if (tenant.status !== 'active') {
        return {
          response: {
            status: 403,
            body: { error: 'Tenant is not active', status: tenant.status },
          },
        };
      }

      ctx.context.tenant = tenant;
    }

    // Add tenant ID to context
    ctx.context.tenantId = tenantId;

    // Add tenant filter for RLS
    ctx.context.rlsFilter = {
      ...ctx.context.rlsFilter,
      tenantId,
    };

    return next();
  },

  description: 'Extracts and validates tenant ID, adds to RLS filter',
  order: 'early',
});

// Simple in-memory cache (use Redis in production)
const tenantCache = new Map<string, { value: unknown; expires: number }>();
tenantCache.get = function(key: string) {
  const entry = Map.prototype.get.call(this, key);
  if (entry && entry.expires > Date.now()) {
    return entry.value;
  }
  this.delete(key);
  return null;
};
tenantCache.set = function(key: string, value: unknown, options: { ttl: number }) {
  Map.prototype.set.call(this, key, { value, expires: Date.now() + options.ttl });
};
```

### Server: API Versioning Middleware

```typescript
// src/middleware/server/api-version.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const apiVersionMiddleware = defineServerMiddleware('api-version', {
  config: {
    headerName: field.string().default('X-API-Version'),
    defaultVersion: field.string().default('2024-01-01'),
    supportedVersions: field.array(field.string()).default([
      '2024-01-01',
      '2023-06-01',
      '2023-01-01',
    ]),
    deprecatedVersions: field.array(field.string()).default(['2023-01-01']),
  },

  handler: async ({ ctx, config, next }) => {
    // Get version from header or use default
    const version = ctx.headers[config.headerName.toLowerCase()] || config.defaultVersion;

    // Check if version is supported
    if (!config.supportedVersions.includes(version)) {
      return {
        response: {
          status: 400,
          body: {
            error: 'Unsupported API version',
            version,
            supportedVersions: config.supportedVersions,
          },
        },
      };
    }

    // Add to context
    ctx.context.apiVersion = version;

    // Continue with request
    const result = await next();

    // Add deprecation warning header if needed
    if (config.deprecatedVersions.includes(version)) {
      result.response = result.response || { status: 200, body: {} };
      result.response.headers = result.response.headers || {};
      result.response.headers['X-API-Deprecation-Warning'] =
        `API version ${version} is deprecated. Please upgrade to ${config.defaultVersion}`;
    }

    return result;
  },

  description: 'Handles API versioning via header',
  order: 'early',
});
```

### Client: Optimistic Update Middleware

```typescript
// src/middleware/client/optimistic.ts
import { defineClientMiddleware } from 'schemock/schema';

export const optimisticMiddleware = defineClientMiddleware('optimistic', {
  before: async ({ request, operation }) => {
    // Only for mutations
    if (request.method === 'GET') return;

    // Generate optimistic ID for creates
    if (operation.action === 'create') {
      const optimisticId = `temp-${Date.now()}`;

      // Store optimistic data (you'd integrate with your state manager)
      window.__optimisticUpdates = window.__optimisticUpdates || {};
      window.__optimisticUpdates[optimisticId] = {
        entity: operation.entity,
        data: request.body,
        status: 'pending',
      };

      return {
        metadata: { optimisticId },
      };
    }
  },

  after: async ({ response, metadata, operation }) => {
    if (metadata.optimisticId) {
      // Replace optimistic data with real data
      const optimistic = window.__optimisticUpdates[metadata.optimisticId];
      if (optimistic) {
        optimistic.status = 'confirmed';
        optimistic.realId = response.data?.id;

        // Clean up after a delay
        setTimeout(() => {
          delete window.__optimisticUpdates[metadata.optimisticId];
        }, 5000);
      }
    }

    return response;
  },

  onError: async ({ error, metadata }) => {
    if (metadata.optimisticId) {
      // Mark optimistic update as failed
      const optimistic = window.__optimisticUpdates[metadata.optimisticId];
      if (optimistic) {
        optimistic.status = 'failed';
        optimistic.error = error.message;
      }
    }

    throw error;
  },

  description: 'Enables optimistic updates for mutations',
  order: 'early',
});
```

## Middleware Order

### Execution Flow

```
CLIENT (before):
  auth → analytics → retry → cache → custom → [fetch]

SERVER:
  auth → rateLimit → logger → context → tenant → rls → validation → [handler]

SERVER (after handler):
  [handler] → audit-log → response-transform

CLIENT (after):
  [response] → cache → analytics → auth
```

### Setting Order

```typescript
// Runs before most built-in middleware
defineServerMiddleware('early-middleware', {
  handler: ...,
  order: 'early',
});

// Runs with built-in middleware (default)
defineServerMiddleware('normal-middleware', {
  handler: ...,
  order: 'normal',
});

// Runs after built-in middleware and handler
defineServerMiddleware('late-middleware', {
  handler: ...,
  order: 'late',
});
```

### Custom Order in Config

```typescript
backend: {
  middleware: {
    // Explicit ordering
    chain: [
      'auth',           // Built-in
      'tenant',         // Custom (early)
      'rateLimit',      // Built-in
      'api-version',    // Custom
      'logger',         // Built-in
      'context',        // Built-in
      'rls',            // Built-in
      'validation',     // Built-in
      'audit-log',      // Custom (late)
    ],
  },
}
```

## Best Practices

### 1. Keep Middleware Focused

Each middleware should do ONE thing well.

```typescript
// Good: Single responsibility
const tenantMiddleware = defineServerMiddleware('tenant', { ... });
const auditLogMiddleware = defineServerMiddleware('audit-log', { ... });

// Bad: Too many concerns
const kitchenSinkMiddleware = defineServerMiddleware('everything', {
  handler: async ({ ctx, next }) => {
    // Extract tenant
    // Validate API key
    // Log request
    // Apply rate limit
    // Check permissions
    // ... too much!
  },
});
```

### 2. Use Config for Flexibility

Make middleware configurable instead of hardcoding values.

```typescript
// Good: Configurable
const rateLimitMiddleware = defineServerMiddleware('rate-limit', {
  config: {
    max: field.number().default(100),
    windowMs: field.number().default(60000),
  },
  handler: async ({ config, ... }) => {
    // Use config.max and config.windowMs
  },
});

// Bad: Hardcoded
const rateLimitMiddleware = defineServerMiddleware('rate-limit', {
  handler: async ({ ... }) => {
    const max = 100;  // Can't change without editing code
    const windowMs = 60000;
  },
});
```

### 3. Handle Errors Gracefully

Always return proper error responses.

```typescript
// Good: Proper error response
handler: async ({ ctx, next }) => {
  try {
    const result = await someOperation();
    ctx.context.data = result;
    return next();
  } catch (error) {
    return {
      response: {
        status: 500,
        body: {
          error: 'Internal server error',
          code: 'MIDDLEWARE_ERROR',
          // Don't leak internal details
        },
      },
    };
  }
}

// Bad: Unhandled error
handler: async ({ ctx, next }) => {
  const result = await someOperation();  // Might throw!
  ctx.context.data = result;
  return next();
}
```

### 4. Document Your Middleware

Add descriptions and comments for maintainability.

```typescript
/**
 * Tenant Isolation Middleware
 *
 * Extracts tenant ID from X-Tenant-ID header and adds it to the
 * RLS filter context. All subsequent database queries will be
 * automatically scoped to this tenant.
 *
 * @requires Auth middleware (needs userId in context)
 * @modifies ctx.context.tenantId
 * @modifies ctx.context.rlsFilter
 */
export const tenantMiddleware = defineServerMiddleware('tenant', {
  description: 'Extracts tenant ID and applies tenant isolation',
  ...
});
```

## Next Steps

- [Built-in Middleware](./built-in-middleware.md) - Reference for all built-in options
- [Examples](./examples.md) - More patterns and recipes
