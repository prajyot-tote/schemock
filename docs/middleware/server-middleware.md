# Server Middleware

Server middleware runs **on your backend** (Node.js, Edge Functions, etc.) and processes requests before they reach your database.

## When to Use Server Middleware

| Use Case | Why Server-Side |
|----------|-----------------|
| JWT verification | Secret key must stay on server |
| Rate limiting | Must be enforced server-side to be effective |
| Row-level security (RLS) | Data filtering must happen at database level |
| Request validation | Don't trust client input |
| Audit logging | Tamper-proof logging |
| Multi-tenancy | Tenant isolation at data layer |

## Built-in Server Middleware

### Auth (Token Verification)

Verifies JWT tokens and extracts user info.

```typescript
backend: {
  middleware: {
    auth: {
      // Auth provider
      provider: 'jwt',              // 'jwt' | 'supabase-auth' | 'nextauth' | 'clerk'

      // Is authentication required?
      required: true,               // 401 if no/invalid token

      // JWT secret (for 'jwt' provider)
      secretEnvVar: 'JWT_SECRET',   // Environment variable name

      // Skip auth for these routes (optional)
      skip: ['/api/auth/login', '/api/health'],
    },
  },
}
```

**Provider options:**

| Provider | How it works |
|----------|--------------|
| `jwt` | Verifies JWT using secret from env var |
| `supabase-auth` | Uses Supabase client to verify token |
| `nextauth` | Uses NextAuth.js `getServerSession()` |
| `clerk` | Uses Clerk's `auth()` function |

**What it does (jwt example):**
```typescript
// Extract token from header
const token = request.headers.get('authorization')?.split(' ')[1];

// Verify with secret
const payload = jwt.verify(token, process.env.JWT_SECRET);

// Add to context
context.userId = payload.sub;
context.email = payload.email;
context.role = payload.role;
```

### Rate Limiting

Prevents abuse by limiting requests per user/IP.

```typescript
backend: {
  middleware: {
    rateLimit: {
      max: 100,                    // Max requests per window
      windowMs: 60000,             // Window duration (1 minute)

      // How to identify the requester
      keyBy: 'user',               // 'user' | 'ip' | 'custom'

      // Custom key generator (optional)
      keyGenerator: './src/helpers/rate-limit-key.ts',

      // Response when rate limited
      message: 'Too many requests, please try again later',

      // Headers to include in response
      headers: true,               // X-RateLimit-Limit, X-RateLimit-Remaining, etc.
    },
  },
}
```

**What it does:**
```typescript
// Check rate limit
const key = `user:${context.userId}`;
const current = rateLimitStore.get(key) || 0;

if (current >= 100) {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

rateLimitStore.set(key, current + 1, { ttl: 60000 });
```

### Context

Extracts context from JWT and custom headers into `ctx.context`.

```typescript
backend: {
  middleware: {
    context: true,  // or detailed config:
    context: {
      // Custom headers to extract
      extractHeaders: ['X-Tenant-ID', 'X-Request-ID'],

      // JWT claims to extract (beyond standard sub/email/role)
      extractClaims: ['permissions', 'orgId'],
    },
  },
}
```

**What it does:**
```typescript
// From JWT
context.userId = jwtPayload.sub;
context.email = jwtPayload.email;
context.role = jwtPayload.role;
context.permissions = jwtPayload.permissions;
context.orgId = jwtPayload.orgId;

// From headers
context.tenantId = request.headers.get('x-tenant-id');
context.requestId = request.headers.get('x-request-id');
```

### RLS (Row-Level Security)

Automatically filters data based on user context. Works with schema-level RLS config.

```typescript
backend: {
  middleware: {
    rls: true,  // Enable RLS enforcement
  },
}
```

**Requires schema-level RLS config:**
```typescript
// src/schemas/post.ts
export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  authorId: field.uuid(),
}, {
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

**What it does:**
```typescript
// User with role: 'user'
// GET /api/posts
// → SELECT * FROM posts WHERE author_id = 'user-123'

// User with role: 'admin'
// GET /api/posts
// → SELECT * FROM posts (no filter, bypass applies)
```

### Validation

Validates request bodies against your schema definitions.

```typescript
backend: {
  middleware: {
    validation: true,  // Enable schema validation
  },
}
```

**What it does:**
```typescript
// POST /api/users
// Body: { name: '', email: 'not-an-email' }

// Returns 400 Bad Request:
{
  "error": "Validation failed",
  "details": [
    { "field": "name", "message": "name is required" },
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

### Logger

Logs requests and responses for debugging and auditing.

```typescript
backend: {
  middleware: {
    logger: {
      level: 'info',               // 'debug' | 'info' | 'warn' | 'error'
      includeBody: false,          // Log request body (careful with sensitive data)
      includeResponse: false,      // Log response body
      redactFields: ['password', 'token', 'secret', 'authorization'],
    },
  },
}
```

**What it does:**
```typescript
// Console output (JSON format for log aggregation)
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Request completed",
  "method": "POST",
  "path": "/api/users",
  "userId": "user-123",
  "status": 201,
  "duration": 142
}
```

### Cache (Server-Side)

Caches responses to reduce database load.

```typescript
backend: {
  middleware: {
    cache: {
      ttl: 300000,                 // 5 minutes
      operations: ['findOne', 'findMany'],

      // Storage backend
      storage: 'memory',           // 'memory' | 'redis'
      redisEnvVar: 'REDIS_URL',    // For redis storage

      // Cache key customization
      keyGenerator: './src/helpers/cache-key.ts',

      // Invalidation
      invalidateOn: ['create', 'update', 'delete'],
    },
  },
}
```

## Custom Server Middleware

For anything beyond built-in options:

```typescript
// src/middleware/server/tenant.ts
import { defineServerMiddleware } from 'schemock/schema';

export const tenantMiddleware = defineServerMiddleware('tenant', {
  // Optional: Configuration schema
  config: {
    headerName: field.string().default('X-Tenant-ID'),
    required: field.boolean().default(true),
    validateTenant: field.boolean().default(true),
  },

  // The middleware handler
  handler: async ({ ctx, config, next, db }) => {
    const tenantId = ctx.headers[config.headerName.toLowerCase()];

    // Check if tenant ID is provided
    if (!tenantId && config.required) {
      return {
        response: {
          status: 400,
          body: { error: 'Tenant ID is required' },
        },
      };
    }

    // Optionally validate tenant exists
    if (tenantId && config.validateTenant) {
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return {
          response: {
            status: 404,
            body: { error: 'Tenant not found' },
          },
        };
      }
      ctx.context.tenant = tenant;
    }

    // Add tenant ID to context for downstream use
    ctx.context.tenantId = tenantId;

    // Continue to next middleware
    return next();
  },

  // Metadata
  description: 'Extracts and validates tenant ID from request headers',
  order: 'early',  // Run before most other middleware
});
```

Add to config:

```typescript
backend: {
  middleware: {
    custom: ['./src/middleware/server/tenant.ts'],
  },
}
```

## Server Middleware Context

Every server middleware receives:

```typescript
interface ServerMiddlewareContext {
  // Request info
  headers: Record<string, string | null>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  query: Record<string, string>;
  body?: unknown;

  // User context (populated by auth/context middleware)
  context: {
    userId?: string;
    email?: string;
    role?: string;
    tenantId?: string;
    [key: string]: unknown;
  };

  // Metadata from previous middleware
  metadata: Record<string, unknown>;

  // Entity and operation info
  entity?: string;           // 'user', 'post', etc.
  operation?: 'select' | 'insert' | 'update' | 'delete';
}
```

## Middleware Handler API

```typescript
type MiddlewareHandler = (params: {
  ctx: ServerMiddlewareContext;
  config: YourConfigType;
  next: () => Promise<MiddlewareResult>;
  db?: DatabaseClient;  // Available if database is configured
}) => Promise<MiddlewareResult>;

interface MiddlewareResult {
  // Return early with a response (stops chain)
  response?: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  };

  // Or continue to next middleware
  // (implicitly continues if no response returned)
}
```

## Execution Order

Default order:

```
auth → rateLimit → logger → context → [custom:early] → rls → [custom:normal] → validation → [custom:late] → handler
```

Customize with `chain`:

```typescript
backend: {
  middleware: {
    chain: ['auth', 'tenant', 'rateLimit', 'logger', 'context', 'rls', 'validation'],
  },
}
```

### Order Options for Custom Middleware

```typescript
defineServerMiddleware('my-middleware', {
  handler: async ({ ctx, next }) => { ... },
  order: 'early',   // 'early' | 'normal' | 'late'
});
```

| Order | When | Use Case |
|-------|------|----------|
| `early` | Before built-in | Tenant extraction, request ID |
| `normal` | With built-in | Custom auth, custom validation |
| `late` | After built-in | Audit logging, response modification |

## Generated Code

### Next.js Example

```typescript
// Generated: src/generated/api/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export async function runMiddlewareChain(
  request: NextRequest,
  entity?: string,
  operation?: 'select' | 'insert' | 'update' | 'delete'
): Promise<MiddlewareChainResult> {
  const context: MiddlewareChainContext = {};

  // Auth middleware
  const authResult = await authMiddleware(request);
  if (authResult.error) {
    return { error: true, response: authResult.response, context };
  }
  Object.assign(context, authResult.context);

  // Rate limit middleware
  const rateLimitResult = rateLimitMiddleware(request, context.userId);
  if (rateLimitResult.error) {
    return { error: true, response: rateLimitResult.response, context };
  }

  // ... more middleware ...

  return { error: false, context };
}

// Helper to wrap route handlers
export function withMiddleware(
  handler: (request: NextRequest, context: MiddlewareChainContext) => Promise<NextResponse>,
  options?: { entity?: string; operation?: 'select' | 'insert' | 'update' | 'delete' }
) {
  return async (request: NextRequest) => {
    const result = await runMiddlewareChain(request, options?.entity, options?.operation);

    if (result.error) {
      return result.response;
    }

    return handler(request, result.context);
  };
}
```

### Usage in Route Handlers

```typescript
// src/generated/api/routes/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '../../middleware';
import { supabase } from '../../supabase';

export const GET = withMiddleware(
  async (request, context) => {
    // context.userId is available from auth middleware
    // context.tenantId is available from tenant middleware
    // context.rlsFilter is available from RLS middleware

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .match(context.rlsFilter || {});

    return NextResponse.json({ data });
  },
  { entity: 'posts', operation: 'select' }
);

export const POST = withMiddleware(
  async (request, context) => {
    const body = await request.json();

    // Validation already done by middleware
    // RLS will be applied on insert

    const { data, error } = await supabase
      .from('posts')
      .insert({ ...body, authorId: context.userId })
      .select()
      .single();

    return NextResponse.json({ data }, { status: 201 });
  },
  { entity: 'posts', operation: 'insert' }
);
```

## Common Patterns

### Multi-Tenant Isolation

```typescript
// src/middleware/server/tenant-isolation.ts
import { defineServerMiddleware } from 'schemock/schema';

export const tenantIsolationMiddleware = defineServerMiddleware('tenant-isolation', {
  handler: async ({ ctx, next, db }) => {
    const tenantId = ctx.context.tenantId;

    if (!tenantId) {
      return {
        response: { status: 400, body: { error: 'Tenant context required' } },
      };
    }

    // Add tenant filter to all queries
    ctx.context.rlsFilter = {
      ...ctx.context.rlsFilter,
      tenantId,
    };

    return next();
  },
  order: 'normal',
});
```

### Audit Logging

```typescript
// src/middleware/server/audit-log.ts
import { defineServerMiddleware } from 'schemock/schema';

export const auditLogMiddleware = defineServerMiddleware('audit-log', {
  handler: async ({ ctx, next, db }) => {
    const startTime = Date.now();

    // Continue with request
    const result = await next();

    // Log after response
    await db.auditLog.create({
      data: {
        userId: ctx.context.userId,
        action: ctx.operation,
        entity: ctx.entity,
        path: ctx.path,
        method: ctx.method,
        statusCode: result.response?.status || 200,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      },
    });

    return result;
  },
  order: 'late',  // Run after handler completes
});
```

### API Key Authentication

```typescript
// src/middleware/server/api-key.ts
import { defineServerMiddleware, field } from 'schemock/schema';

export const apiKeyMiddleware = defineServerMiddleware('api-key', {
  config: {
    headerName: field.string().default('X-API-Key'),
    envVar: field.string().default('API_KEY'),
  },
  handler: async ({ ctx, config, next }) => {
    const apiKey = ctx.headers[config.headerName.toLowerCase()];
    const expectedKey = process.env[config.envVar];

    if (!apiKey || apiKey !== expectedKey) {
      return {
        response: {
          status: 401,
          body: { error: 'Invalid API key' },
        },
      };
    }

    return next();
  },
  order: 'early',
});
```

### Request Sanitization

```typescript
// src/middleware/server/sanitize.ts
import { defineServerMiddleware } from 'schemock/schema';
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeMiddleware = defineServerMiddleware('sanitize', {
  handler: async ({ ctx, next }) => {
    if (ctx.body && typeof ctx.body === 'object') {
      ctx.body = sanitizeObject(ctx.body);
    }
    return next();
  },
  order: 'early',
});

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = DOMPurify.sanitize(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

## Next Steps

- [Custom Middleware](./custom-middleware.md) - Deep dive into writing custom middleware
- [Built-in Middleware](./built-in-middleware.md) - Full reference for all options
- [Examples](./examples.md) - More patterns and recipes
