# Built-in Middleware Reference

Quick reference for all built-in middleware options.

## Client Middleware

### auth

Injects authentication token into requests.

```typescript
frontend: {
  middleware: {
    auth: {
      tokenStorage: 'localStorage',     // 'localStorage' | 'sessionStorage' | 'memory' | 'cookie'
      tokenKey: 'authToken',            // Key name in storage
      tokenPrefix: 'Bearer',            // Prefix in Authorization header
      onUnauthorized: 'redirect:/login', // Action on 401: 'redirect:/path' | './handler.ts'
      skip: ['login', 'register'],      // Operations to skip auth
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenStorage` | string | `'localStorage'` | Where token is stored |
| `tokenKey` | string | `'authToken'` | Key name for token |
| `tokenPrefix` | string | `'Bearer'` | Prefix in header |
| `onUnauthorized` | string | `'redirect:/login'` | 401 handling |
| `skip` | string[] | `[]` | Operations to skip |

### retry

Retries failed requests with backoff.

```typescript
frontend: {
  middleware: {
    retry: {
      maxRetries: 3,                    // Maximum retry attempts
      retryOn: [500, 502, 503, 504],    // Status codes to retry
      backoff: 'exponential',           // 'exponential' | 'linear' | 'fixed'
      baseDelay: 1000,                  // Initial delay (ms)
      maxDelay: 30000,                  // Maximum delay (ms)
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | `3` | Max retry attempts |
| `retryOn` | number[] | `[500, 502, 503, 504]` | Status codes to retry |
| `backoff` | string | `'exponential'` | Backoff strategy |
| `baseDelay` | number | `1000` | Initial delay in ms |
| `maxDelay` | number | `30000` | Max delay in ms |

### cache

Caches GET responses in the browser.

```typescript
frontend: {
  middleware: {
    cache: {
      storage: 'memory',                // 'memory' | 'localStorage'
      ttl: 60000,                       // Time-to-live (ms)
      maxSize: 100,                     // Max entries (memory only)
      operations: ['list', 'get'],      // Operations to cache
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage` | string | `'memory'` | Where to cache |
| `ttl` | number | `60000` | Cache TTL in ms |
| `maxSize` | number | `100` | Max cache entries |
| `operations` | string[] | `['list', 'get']` | What to cache |

### logger

Logs API calls in the browser console.

```typescript
frontend: {
  middleware: {
    logger: {
      enabled: true,                    // Enable/disable
      level: 'debug',                   // 'debug' | 'info' | 'warn' | 'error'
      includeHeaders: false,            // Log request headers
      includeBody: false,               // Log request/response body
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable logging |
| `level` | string | `'info'` | Minimum log level |
| `includeHeaders` | boolean | `false` | Log headers |
| `includeBody` | boolean | `false` | Log body |

---

## Server Middleware

### auth

Verifies authentication tokens on the server.

```typescript
backend: {
  middleware: {
    auth: {
      provider: 'jwt',                  // 'jwt' | 'supabase-auth' | 'nextauth' | 'clerk'
      required: true,                   // Require auth for all routes
      secretEnvVar: 'JWT_SECRET',       // Env var for JWT secret
      skip: ['/api/health'],            // Routes to skip auth
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `'jwt'` | Auth provider |
| `required` | boolean | `true` | Require authentication |
| `secretEnvVar` | string | `'JWT_SECRET'` | Secret env var |
| `skip` | string[] | `[]` | Routes to skip |

**Provider-specific options:**

```typescript
// supabase-auth
auth: {
  provider: 'supabase-auth',
  // Uses SUPABASE_URL and SUPABASE_ANON_KEY from env
}

// nextauth
auth: {
  provider: 'nextauth',
  // Uses NextAuth's getServerSession
}

// clerk
auth: {
  provider: 'clerk',
  // Uses Clerk's auth() function
}
```

### rateLimit

Limits requests per user or IP.

```typescript
backend: {
  middleware: {
    rateLimit: {
      max: 100,                         // Max requests per window
      windowMs: 60000,                  // Window duration (ms)
      keyBy: 'user',                    // 'user' | 'ip'
      message: 'Too many requests',     // Error message
      headers: true,                    // Include rate limit headers
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | number | `100` | Max requests |
| `windowMs` | number | `60000` | Window in ms |
| `keyBy` | string | `'ip'` | How to identify client |
| `message` | string | `'Too many requests'` | Error message |
| `headers` | boolean | `true` | Include headers |

**Response headers:**
- `X-RateLimit-Limit`: Max requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: When window resets (Unix timestamp)
- `Retry-After`: Seconds until retry (on 429)

### context

Extracts context from JWT and headers.

```typescript
backend: {
  middleware: {
    context: true,  // Simple enable

    // Or detailed config:
    context: {
      extractHeaders: ['X-Tenant-ID', 'X-Request-ID'],
      extractClaims: ['permissions', 'orgId'],
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extractHeaders` | string[] | `[]` | Headers to extract |
| `extractClaims` | string[] | `[]` | JWT claims to extract |

**Default extracted from JWT:**
- `userId` (from `sub`)
- `email`
- `role`

### rls

Applies row-level security based on schema config.

```typescript
backend: {
  middleware: {
    rls: true,  // Enable RLS enforcement
  },
}
```

Requires schema-level RLS config:

```typescript
// In your schema
defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
}, {
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

### validation

Validates request bodies against schemas.

```typescript
backend: {
  middleware: {
    validation: true,  // Enable validation
  },
}
```

Returns 400 with validation errors:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "name", "message": "name is required" }
  ]
}
```

### logger

Logs requests on the server.

```typescript
backend: {
  middleware: {
    logger: {
      level: 'info',                    // 'debug' | 'info' | 'warn' | 'error'
      includeBody: false,               // Log request body
      includeResponse: false,           // Log response body
      redactFields: ['password', 'token', 'secret'],
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | `'info'` | Minimum log level |
| `includeBody` | boolean | `false` | Log request body |
| `includeResponse` | boolean | `false` | Log response body |
| `redactFields` | string[] | `['password', 'token', 'secret']` | Fields to redact |

### cache

Caches responses on the server.

```typescript
backend: {
  middleware: {
    cache: {
      ttl: 300000,                      // TTL in ms (5 minutes)
      operations: ['findOne', 'findMany'],
      storage: 'memory',                // 'memory' | 'redis'
      redisEnvVar: 'REDIS_URL',         // For Redis storage
    },
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | number | `300000` | Cache TTL in ms |
| `operations` | string[] | `['findOne', 'findMany']` | What to cache |
| `storage` | string | `'memory'` | Cache backend |
| `redisEnvVar` | string | `'REDIS_URL'` | Redis connection |

---

## Quick Comparison

| Middleware | Client | Server | Purpose |
|------------|--------|--------|---------|
| auth | Inject token | Verify token | Authentication |
| retry | ✓ | - | Retry failed requests |
| cache | Browser cache | Server cache | Reduce load |
| logger | Console log | Server log | Debugging/audit |
| rateLimit | - | ✓ | Prevent abuse |
| context | - | ✓ | Extract user info |
| rls | - | ✓ | Row-level security |
| validation | - | ✓ | Validate input |

---

## Minimal Configs

### Development (Mock Backend)

```typescript
export default defineConfig({
  frontend: {
    adapter: 'mock',
    middleware: {
      auth: { tokenStorage: 'localStorage' },
      logger: { level: 'debug' },
    },
  },
});
```

### Production (Supabase)

```typescript
export default defineConfig({
  frontend: {
    adapter: 'supabase',
    middleware: {
      auth: { tokenStorage: 'localStorage' },
      retry: { maxRetries: 3 },
    },
  },
  backend: {
    framework: 'nextjs',
    middleware: {
      auth: { provider: 'supabase-auth', required: true },
      rateLimit: { max: 100, windowMs: 60000 },
      context: true,
      rls: true,
      validation: true,
      logger: { level: 'info' },
    },
  },
});
```

### API-Only (No Frontend)

```typescript
export default defineConfig({
  backend: {
    framework: 'node',
    middleware: {
      auth: { provider: 'jwt', required: true },
      rateLimit: { max: 1000, windowMs: 60000 },
      validation: true,
      logger: { level: 'warn' },
    },
  },
});
```
