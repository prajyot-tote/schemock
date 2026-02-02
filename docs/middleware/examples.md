# Middleware Examples

Real-world patterns and recipes for common use cases.

## Authentication Patterns

### JWT with Refresh Token

```typescript
// schemock.config.ts
export default defineConfig({
  frontend: {
    middleware: {
      auth: { tokenStorage: 'localStorage', tokenKey: 'accessToken' },
      custom: ['./src/middleware/client/token-refresh.ts'],
    },
  },
  backend: {
    middleware: {
      auth: { provider: 'jwt', secretEnvVar: 'JWT_SECRET' },
    },
  },
});
```

```typescript
// src/middleware/client/token-refresh.ts
import { defineClientMiddleware } from 'schemock/schema';

export const tokenRefreshMiddleware = defineClientMiddleware('token-refresh', {
  onError: async ({ error, request }) => {
    if (error.status !== 401) throw error;

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      window.location.href = '/login';
      throw error;
    }

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) throw new Error('Refresh failed');

      const { accessToken, refreshToken: newRefresh } = await res.json();
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefresh);

      // Retry original request
      return fetch(request.url, {
        ...request,
        headers: { ...request.headers, Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json());
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      throw error;
    }
  },
});
```

### API Key Authentication

```typescript
// schemock.config.ts
export default defineConfig({
  backend: {
    middleware: {
      custom: ['./src/middleware/server/api-key.ts'],
    },
  },
});
```

```typescript
// src/middleware/server/api-key.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const apiKeyMiddleware = defineServerMiddleware('api-key', {
  config: {
    headerName: field.string().default('X-API-Key'),
    envVar: field.string().default('API_KEYS'),  // Comma-separated valid keys
  },

  handler: async ({ ctx, config, next }) => {
    const apiKey = ctx.headers[config.headerName.toLowerCase()];
    const validKeys = process.env[config.envVar]?.split(',') || [];

    if (!apiKey || !validKeys.includes(apiKey)) {
      return {
        response: {
          status: 401,
          body: { error: 'Invalid or missing API key' },
        },
      };
    }

    // Optionally: look up API key metadata
    ctx.context.apiKeyId = apiKey.substring(0, 8);  // Truncated for logging
    return next();
  },
  order: 'early',
});
```

---

## Multi-Tenancy Patterns

### Header-Based Tenant Isolation

```typescript
// schemock.config.ts
export default defineConfig({
  backend: {
    middleware: {
      auth: { provider: 'jwt', required: true },
      custom: ['./src/middleware/server/tenant.ts'],
      rls: true,
    },
  },
});
```

```typescript
// src/middleware/server/tenant.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const tenantMiddleware = defineServerMiddleware('tenant', {
  config: {
    headerName: field.string().default('X-Tenant-ID'),
    allowUserTenantSwitch: field.boolean().default(false),
  },

  handler: async ({ ctx, config, next, db }) => {
    // Get tenant from header or JWT
    let tenantId = ctx.headers[config.headerName.toLowerCase()];

    // If not in header, try JWT
    if (!tenantId && ctx.context.tenantId) {
      tenantId = ctx.context.tenantId as string;
    }

    if (!tenantId) {
      return {
        response: { status: 400, body: { error: 'Tenant ID required' } },
      };
    }

    // Verify user belongs to tenant (unless switching is allowed)
    if (!config.allowUserTenantSwitch && ctx.context.userId) {
      const membership = await db.tenantMember.findFirst({
        where: {
          tenantId,
          userId: ctx.context.userId,
        },
      });

      if (!membership) {
        return {
          response: { status: 403, body: { error: 'Not a member of this tenant' } },
        };
      }

      ctx.context.tenantRole = membership.role;
    }

    // Add tenant filter for all queries
    ctx.context.tenantId = tenantId;
    ctx.context.rlsFilter = { ...ctx.context.rlsFilter, tenantId };

    return next();
  },
  order: 'early',
});
```

### Subdomain-Based Tenancy

```typescript
// src/middleware/server/subdomain-tenant.ts
import { defineServerMiddleware } from 'schemock/schema';

export const subdomainTenantMiddleware = defineServerMiddleware('subdomain-tenant', {
  handler: async ({ ctx, next, db }) => {
    const host = ctx.headers['host'];
    if (!host) {
      return { response: { status: 400, body: { error: 'Missing host header' } } };
    }

    // Extract subdomain: tenant.example.com -> tenant
    const parts = host.split('.');
    if (parts.length < 3) {
      // No subdomain, might be main site
      return next();
    }

    const subdomain = parts[0];

    // Skip common subdomains
    if (['www', 'api', 'app'].includes(subdomain)) {
      return next();
    }

    // Look up tenant by subdomain
    const tenant = await db.tenant.findFirst({
      where: { subdomain },
    });

    if (!tenant) {
      return { response: { status: 404, body: { error: 'Tenant not found' } } };
    }

    ctx.context.tenantId = tenant.id;
    ctx.context.tenant = tenant;
    ctx.context.rlsFilter = { ...ctx.context.rlsFilter, tenantId: tenant.id };

    return next();
  },
  order: 'early',
});
```

---

## Caching Patterns

### User-Specific Cache

```typescript
// src/middleware/client/user-cache.ts
import { defineClientMiddleware } from 'schemock/schema';

const cache = new Map<string, { data: unknown; expires: number }>();

export const userCacheMiddleware = defineClientMiddleware('user-cache', {
  before: async ({ request, context }) => {
    if (request.method !== 'GET') return;

    // Include userId in cache key for user-specific data
    const cacheKey = `${context.userId}:${request.url}`;
    const entry = cache.get(cacheKey);

    if (entry && entry.expires > Date.now()) {
      return {
        response: { data: entry.data, status: 200 },
        metadata: { cacheHit: true },
      };
    }
  },

  after: async ({ request, response, context }) => {
    if (request.method !== 'GET' || response.status !== 200) return response;

    const cacheKey = `${context.userId}:${request.url}`;
    cache.set(cacheKey, {
      data: response.data,
      expires: Date.now() + 60000,  // 1 minute
    });

    return response;
  },
});
```

### Invalidate on Mutation

```typescript
// src/middleware/client/cache-invalidation.ts
import { defineClientMiddleware } from 'schemock/schema';

const cache = new Map<string, unknown>();

export const cacheInvalidationMiddleware = defineClientMiddleware('cache-invalidation', {
  after: async ({ request, operation }) => {
    // Invalidate cache on mutations
    if (['create', 'update', 'delete'].includes(operation.action)) {
      // Clear all cache entries for this entity
      for (const key of cache.keys()) {
        if (key.includes(`/api/${operation.entity}`)) {
          cache.delete(key);
        }
      }
    }
  },
});
```

---

## Logging & Monitoring

### Structured Logging with Request ID

```typescript
// src/middleware/server/request-id.ts
import { defineServerMiddleware } from 'schemock/schema';

export const requestIdMiddleware = defineServerMiddleware('request-id', {
  handler: async ({ ctx, next }) => {
    // Use existing or generate new
    const requestId = ctx.headers['x-request-id'] || crypto.randomUUID();
    ctx.context.requestId = requestId;
    ctx.metadata.requestId = requestId;

    const result = await next();

    // Add to response headers
    result.response = result.response || { status: 200, body: {} };
    result.response.headers = result.response.headers || {};
    result.response.headers['X-Request-ID'] = requestId;

    return result;
  },
  order: 'early',
});
```

### Audit Log Middleware

```typescript
// src/middleware/server/audit-log.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const auditLogMiddleware = defineServerMiddleware('audit-log', {
  config: {
    logReads: field.boolean().default(false),  // Usually too noisy
    logTable: field.string().default('audit_logs'),
  },

  handler: async ({ ctx, config, next, db }) => {
    const startTime = Date.now();

    // Execute the request
    const result = await next();

    // Skip logging reads unless configured
    if (ctx.method === 'GET' && !config.logReads) {
      return result;
    }

    // Log the action
    try {
      await db[config.logTable].create({
        data: {
          timestamp: new Date(),
          userId: ctx.context.userId,
          action: `${ctx.method} ${ctx.path}`,
          entity: ctx.entity,
          entityId: extractEntityId(ctx.path),
          changes: ctx.method !== 'GET' ? JSON.stringify(ctx.body) : null,
          statusCode: result.response?.status || 200,
          duration: Date.now() - startTime,
          ip: ctx.headers['x-forwarded-for'] || 'unknown',
          userAgent: ctx.headers['user-agent'],
          requestId: ctx.context.requestId,
        },
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Audit log error:', error);
    }

    return result;
  },
  order: 'late',  // Run after handler
});

function extractEntityId(path: string): string | null {
  const match = path.match(/\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}
```

### Error Tracking Integration

```typescript
// src/middleware/client/error-tracking.ts
import { defineClientMiddleware } from 'schemock/schema';

export const errorTrackingMiddleware = defineClientMiddleware('error-tracking', {
  onError: async ({ request, error, context }) => {
    // Send to error tracking service (Sentry, Bugsnag, etc.)
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(new Error(`API Error: ${error.message}`), {
        tags: {
          api_method: request.method,
          api_url: request.url,
          status_code: error.status,
        },
        user: {
          id: context.userId,
        },
        extra: {
          response: error.data,
        },
      });
    }

    throw error;
  },
});
```

---

## Rate Limiting Patterns

### Tiered Rate Limits

```typescript
// src/middleware/server/tiered-rate-limit.ts
import { defineServerMiddleware } from 'schemock/schema';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export const tieredRateLimitMiddleware = defineServerMiddleware('tiered-rate-limit', {
  handler: async ({ ctx, next }) => {
    const userId = ctx.context.userId as string;
    const role = ctx.context.role as string;

    // Different limits per role
    const limits: Record<string, { max: number; windowMs: number }> = {
      free: { max: 100, windowMs: 60000 },
      pro: { max: 1000, windowMs: 60000 },
      enterprise: { max: 10000, windowMs: 60000 },
      admin: { max: Infinity, windowMs: 60000 },  // No limit
    };

    const limit = limits[role] || limits.free;
    const key = `rate:${userId}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + limit.windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > limit.max) {
      return {
        response: {
          status: 429,
          body: {
            error: 'Rate limit exceeded',
            limit: limit.max,
            resetAt: new Date(entry.resetAt).toISOString(),
            upgradeUrl: role === 'free' ? '/pricing' : undefined,
          },
          headers: {
            'X-RateLimit-Limit': String(limit.max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
            'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
          },
        },
      };
    }

    const result = await next();

    // Add rate limit headers to successful responses
    result.response = result.response || { status: 200, body: {} };
    result.response.headers = {
      ...result.response.headers,
      'X-RateLimit-Limit': String(limit.max),
      'X-RateLimit-Remaining': String(Math.max(0, limit.max - entry.count)),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    };

    return result;
  },
  order: 'early',
});
```

---

## Validation Patterns

### Custom Validation Rules

```typescript
// src/middleware/server/custom-validation.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const customValidationMiddleware = defineServerMiddleware('custom-validation', {
  handler: async ({ ctx, next, db }) => {
    if (ctx.method !== 'POST' && ctx.method !== 'PUT') {
      return next();
    }

    const body = ctx.body as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];

    // Example: Check email uniqueness on user create/update
    if (ctx.entity === 'user' && body.email) {
      const existing = await db.user.findFirst({
        where: { email: body.email },
      });

      if (existing && existing.id !== ctx.query.id) {
        errors.push({ field: 'email', message: 'Email already in use' });
      }
    }

    // Example: Validate foreign key exists
    if (ctx.entity === 'post' && body.categoryId) {
      const category = await db.category.findUnique({
        where: { id: body.categoryId },
      });

      if (!category) {
        errors.push({ field: 'categoryId', message: 'Category not found' });
      }
    }

    if (errors.length > 0) {
      return {
        response: {
          status: 400,
          body: { error: 'Validation failed', details: errors },
        },
      };
    }

    return next();
  },
});
```

---

## Offline Support

### Offline Queue

```typescript
// src/middleware/client/offline-queue.ts
import { defineClientMiddleware } from 'schemock/schema';

interface QueuedRequest {
  id: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: unknown };
  timestamp: number;
}

const QUEUE_KEY = 'offline-queue';

function getQueue(): QueuedRequest[] {
  const data = localStorage.getItem(QUEUE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveQueue(queue: QueuedRequest[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export const offlineQueueMiddleware = defineClientMiddleware('offline-queue', {
  before: async ({ request }) => {
    // Allow GET requests to fail naturally
    if (request.method === 'GET') return;

    // If offline, queue the request
    if (!navigator.onLine) {
      const queue = getQueue();
      const queuedRequest: QueuedRequest = {
        id: crypto.randomUUID(),
        request,
        timestamp: Date.now(),
      };
      queue.push(queuedRequest);
      saveQueue(queue);

      // Return optimistic response
      return {
        response: {
          data: { queued: true, queueId: queuedRequest.id },
          status: 202,  // Accepted
        },
      };
    }
  },
});

// Process queue when back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} queued requests...`);

    const newQueue: QueuedRequest[] = [];

    for (const item of queue) {
      try {
        await fetch(item.request.url, {
          method: item.request.method,
          headers: item.request.headers,
          body: item.request.body ? JSON.stringify(item.request.body) : undefined,
        });
      } catch {
        // Keep failed requests in queue
        newQueue.push(item);
      }
    }

    saveQueue(newQueue);
    console.log(`Queue processed. ${newQueue.length} requests remaining.`);
  });
}
```

---

## Full Example Configuration

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',

  frontend: {
    framework: 'react',
    adapter: 'supabase',
    output: './src/generated/client',

    middleware: {
      auth: {
        tokenStorage: 'localStorage',
        tokenKey: 'accessToken',
      },
      retry: {
        maxRetries: 3,
        backoff: 'exponential',
      },
      logger: {
        enabled: process.env.NODE_ENV === 'development',
        level: 'debug',
      },
      custom: [
        './src/middleware/client/token-refresh.ts',
        './src/middleware/client/analytics.ts',
        './src/middleware/client/offline-queue.ts',
        './src/middleware/client/error-tracking.ts',
      ],
      chain: ['auth', 'token-refresh', 'analytics', 'retry', 'offline-queue', 'error-tracking'],
    },
  },

  backend: {
    framework: 'nextjs',
    output: './src/generated/api',
    database: {
      type: 'supabase',
      connectionEnvVar: 'DATABASE_URL',
    },

    middleware: {
      auth: {
        provider: 'supabase-auth',
        required: true,
      },
      rateLimit: {
        max: 100,
        windowMs: 60000,
      },
      context: {
        extractHeaders: ['X-Request-ID'],
      },
      validation: true,
      rls: true,
      logger: {
        level: 'info',
        redactFields: ['password', 'token', 'apiKey'],
      },
      custom: [
        './src/middleware/server/request-id.ts',
        './src/middleware/server/tenant.ts',
        './src/middleware/server/tiered-rate-limit.ts',
        './src/middleware/server/audit-log.ts',
      ],
      chain: [
        'request-id',
        'auth',
        'tenant',
        'tiered-rate-limit',
        'logger',
        'context',
        'rls',
        'validation',
        'audit-log',
      ],
    },
  },
});
```

This gives you a production-ready setup with:
- JWT auth with token refresh
- Multi-tenant isolation
- Tiered rate limiting
- Offline support
- Full audit trail
- Error tracking
- Analytics
