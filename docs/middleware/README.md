# Schemock Middleware Guide

> Define once. Run anywhere. Client or server.

## Overview

Schemock middleware lets you add cross-cutting concerns (auth, logging, caching, etc.) to your API layer. The key insight is that **client-side and server-side middleware are fundamentally different** and should be configured separately.

| Aspect | Client Middleware | Server Middleware |
|--------|-------------------|-------------------|
| **Runs in** | Browser | Node.js / Edge / Deno |
| **Purpose** | Request/response interception | Request validation & processing |
| **Access to** | localStorage, sessionStorage | Environment variables, database, secrets |
| **Cannot access** | Secrets, database directly | Browser APIs |
| **Examples** | Token injection, retry, client cache | JWT verification, RLS, rate limiting |

## Quick Start

### Minimal Setup (Most Projects)

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',

  frontend: {
    framework: 'react',
    adapter: 'supabase',
    // Client-side: just inject the token
    middleware: {
      auth: { tokenStorage: 'localStorage', tokenKey: 'authToken' },
    },
  },

  backend: {
    framework: 'nextjs',
    output: './src/generated/api',
    // Server-side: verify the token
    middleware: {
      auth: { provider: 'jwt', required: true },
      context: true,
    },
  },
});
```

Run `npx schemock generate` and you're done.

## Table of Contents

1. [Client Middleware](./client-middleware.md) - Browser-side interceptors
2. [Server Middleware](./server-middleware.md) - Server-side request handling
3. [Custom Middleware](./custom-middleware.md) - Writing your own middleware
4. [Built-in Middleware](./built-in-middleware.md) - Reference for all built-in options
5. [Examples](./examples.md) - Common patterns and recipes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Your React/Vue App                      │    │
│  │                         │                                │    │
│  │                         ▼                                │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           CLIENT MIDDLEWARE CHAIN               │    │    │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │    │    │
│  │  │  │  Auth   │→ │  Retry  │→ │  Cache  │→ fetch()│    │    │
│  │  │  │(inject) │  │         │  │(client) │         │    │    │
│  │  │  └─────────┘  └─────────┘  └─────────┘         │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Request
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           SERVER MIDDLEWARE CHAIN                        │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │  │  Auth   │→ │  Rate   │→ │ Context │→ │   RLS   │→ DB│    │
│  │  │(verify) │  │  Limit  │  │         │  │         │    │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### 1. Client Middleware = Interceptors

Client middleware wraps your API calls in the browser. Think of it like Axios interceptors:

```typescript
// What client middleware does internally
const response = await fetch(url, {
  headers: {
    ...headers,
    'Authorization': `Bearer ${getToken()}`,  // Auth middleware
  },
});

if (response.status === 401) {
  await refreshToken();  // Retry middleware
  return fetch(url, { ... });
}
```

### 2. Server Middleware = Request Pipeline

Server middleware processes requests on your backend before hitting the database:

```typescript
// What server middleware does internally
export async function GET(request: NextRequest) {
  // Auth middleware - verify JWT
  const user = await verifyJWT(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS middleware - filter data by user
  const data = await db.posts.findMany({ where: { authorId: user.id } });

  return NextResponse.json({ data });
}
```

### 3. Custom Middleware

For anything beyond the built-in options, use custom middleware:

```typescript
// src/middleware/server/tenant.ts
import { defineServerMiddleware } from 'schemock/schema';

export const tenantMiddleware = defineServerMiddleware('tenant', {
  handler: async ({ ctx, next }) => {
    const tenantId = ctx.headers['x-tenant-id'];
    if (!tenantId) {
      return { response: { status: 400, body: { error: 'Tenant ID required' } } };
    }
    ctx.context.tenantId = tenantId;
    return next();
  },
});
```

```typescript
// src/middleware/client/analytics.ts
import { defineClientMiddleware } from 'schemock/schema';

export const analyticsMiddleware = defineClientMiddleware('analytics', {
  before: async ({ request }) => {
    analytics.track('api_call', { url: request.url });
  },
  after: async ({ response }) => {
    analytics.track('api_response', { status: response.status });
  },
});
```

## Configuration Reference

### Full Config Structure

```typescript
// schemock.config.ts
export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',

  frontend: {
    framework: 'react',           // react | vue | svelte | none
    adapter: 'supabase',          // mock | supabase | firebase | fetch | pglite
    output: './src/generated/client',

    middleware: {
      // Built-in client middleware
      auth: {
        tokenStorage: 'localStorage',   // or 'sessionStorage' | 'memory' | 'cookie'
        tokenKey: 'authToken',
        onUnauthorized: 'redirect:/login',  // or custom handler path
      },
      retry: {
        maxRetries: 3,
        retryOn: [500, 502, 503, 504],
        backoff: 'exponential',
      },
      cache: {
        storage: 'memory',              // or 'localStorage'
        ttl: 60000,
        operations: ['list', 'get'],
      },
      logger: {
        enabled: true,
        level: 'debug',
      },

      // Custom client middleware
      custom: [
        './src/middleware/client/analytics.ts',
        './src/middleware/client/offline-queue.ts',
      ],
    },
  },

  backend: {
    framework: 'nextjs',          // node | nextjs | supabase-edge | neon
    output: './src/generated/api',
    database: {
      type: 'supabase',
      connectionEnvVar: 'DATABASE_URL',
    },

    middleware: {
      // Built-in server middleware
      auth: {
        provider: 'jwt',            // jwt | supabase-auth | nextauth | clerk
        required: true,
        secretEnvVar: 'JWT_SECRET',
      },
      rateLimit: {
        max: 100,
        windowMs: 60000,
        keyBy: 'user',              // or 'ip'
      },
      context: true,                // Extract JWT claims to ctx.context
      rls: true,                    // Apply row-level security
      validation: true,             // Validate request bodies
      logger: {
        level: 'info',
        redactFields: ['password', 'token'],
      },
      cache: {
        ttl: 300000,
        operations: ['findOne', 'findMany'],
      },

      // Custom server middleware
      custom: [
        './src/middleware/server/tenant.ts',
        './src/middleware/server/audit-log.ts',
      ],

      // Execution order (optional - defaults shown)
      chain: ['auth', 'rateLimit', 'logger', 'context', 'tenant', 'rls', 'validation'],
    },
  },
});
```

## Next Steps

- **New to middleware?** Start with [Client Middleware](./client-middleware.md)
- **Building an API?** Read [Server Middleware](./server-middleware.md)
- **Need custom logic?** See [Custom Middleware](./custom-middleware.md)
- **Looking for examples?** Check [Examples](./examples.md)
