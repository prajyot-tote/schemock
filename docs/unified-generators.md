# Unified Generators

This document describes the unified generator architecture introduced in Schemock to provide consistent, production-ready code generation across multiple backend targets.

## Overview

Unified generators produce **adapter-agnostic** code that works identically whether you're:
- Mocking with MSW in development
- Running a Next.js API route
- Building an Express server
- Deploying to Supabase Edge Functions

The key insight is that **business logic should be identical** across all targets. Only the HTTP layer differs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Schema Definition                        │
│              defineData('user', { ... }, { rls: ... })      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    analyzeSchemas()                          │
│              Extracts fields, relations, RLS, middleware     │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Middleware    │  │    Service      │  │    Handler      │
│    Helper       │  │    Layer        │  │    Layer        │
│                 │  │                 │  │                 │
│ withMiddleware  │  │  userService    │  │  HTTP handlers  │
│ getMiddleware   │  │  postService    │  │  (per target)   │
│ MiddlewareCtx   │  │  RLS enforce    │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
                    Generated Code Output
```

### Layer Responsibilities

| Layer | Responsibility | Target-Specific? |
|-------|---------------|------------------|
| **Middleware Helper** | Context extraction, middleware chain orchestration | Yes (imports, Response types) |
| **Service Layer** | Business logic, RLS enforcement, CRUD operations | No (pure TypeScript) |
| **Handler Layer** | HTTP request/response handling, routing | Yes (MSW/Next.js/Express/Edge) |

## Configuration

Configure unified generators in `schemock.config.ts`:

```typescript
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  backend: {
    // Target platform
    framework: 'nextjs',  // 'node' | 'nextjs' | 'supabase-edge'

    // Output location for backend code
    output: './src/generated/api',

    // Database configuration
    database: {
      type: 'supabase',
      connectionEnvVar: 'SUPABASE_URL',
    },
  },

  // Middleware configuration
  middleware: {
    auth: { provider: 'supabase-auth', required: true },
    validation: true,
    logger: { level: 'info' },
    rls: true,
    custom: ['./src/middleware/tenant.ts'],
  },
});
```

## Service Layer

The service layer contains all business logic and is **completely target-agnostic**.

### Generated Service Structure

For a schema like:

```typescript
const userSchema = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  email: field.email(),
  tenantId: field.uuid(),
}, {
  rls: {
    scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
  },
});
```

The generator produces:

```typescript
// services/user.service.ts

import { db } from './db';
import type { User, UserCreate, UserUpdate, QueryOptions, UserFilter } from '../types';

export interface MiddlewareContext {
  userId?: string;
  role?: string;
  tenantId?: string;  // From RLS scope
  [key: string]: unknown;
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`);
  }
}

export class RLSError extends Error {
  readonly status = 403;
  readonly code = 'RLS_VIOLATION';
  constructor(operation: string, entity: string) {
    super(`Access denied: cannot ${operation} ${entity}`);
  }
}

export const userService = {
  async list(ctx: MiddlewareContext, options?: QueryOptions<UserFilter>): Promise<User[]> {
    // Apply RLS scope to filter
    const rlsFilter: Record<string, unknown> = {};
    if (ctx.tenantId) {
      rlsFilter.tenantId = ctx.tenantId;
    }

    const where = { ...rlsFilter, ...options?.where };

    return db.user.findMany({
      where,
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
      orderBy: options?.orderBy,
    });
  },

  async get(ctx: MiddlewareContext, id: string): Promise<User> {
    const record = await db.user.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('User', id);

    // Check RLS scope
    if (ctx.tenantId && record.tenantId !== ctx.tenantId) {
      throw new RLSError('read', 'User');
    }

    return record;
  },

  async create(ctx: MiddlewareContext, data: UserCreate): Promise<User> {
    // Inject RLS scope values from context
    const createData = {
      ...data,
      tenantId: ctx.tenantId ?? data.tenantId,
    };

    return db.user.create({ data: createData });
  },

  async update(ctx: MiddlewareContext, id: string, data: UserUpdate): Promise<User> {
    // Verify access before update
    await this.get(ctx, id);
    return db.user.update({ where: { id }, data });
  },

  async delete(ctx: MiddlewareContext, id: string): Promise<void> {
    // Verify access before delete
    await this.get(ctx, id);
    await db.user.delete({ where: { id } });
  },
};

export default userService;
```

### RLS Enforcement

RLS (Row-Level Security) is enforced at the service layer:

| Operation | RLS Enforcement |
|-----------|-----------------|
| `list` | Adds scope filter (e.g., `tenantId: ctx.tenantId`) to query |
| `get` | Verifies record matches scope, throws `RLSError` if not |
| `create` | Injects scope values from context into new record |
| `update` | Calls `get()` first to verify access |
| `delete` | Calls `get()` first to verify access |

### MiddlewareContext

The `MiddlewareContext` interface is generated based on:
1. Standard claims: `userId`, `role`
2. RLS scope keys from all schemas
3. Custom header extractions

## Handler Generation

Handlers are generated per target platform. All handlers:
1. Extract query parameters (limit, offset)
2. Call `withMiddleware()` with the appropriate middleware chain
3. Invoke the service method with context
4. Return properly formatted responses

### Target: MSW

```typescript
// handlers.ts
import { http, HttpResponse } from 'msw';
import { withMiddleware, getMiddleware, type MiddlewareContext } from './middleware';
import { userService } from './services';
import type { UserCreate, UserUpdate } from '../types';

function parseQueryOptions(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  return {
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
  };
}

export const handlers = [
  http.get('/api/users', async ({ request }) => {
    const options = parseQueryOptions(request);
    return withMiddleware(getMiddleware('user', 'list'), request, async (ctx) => {
      const data = await userService.list(ctx, options);
      return HttpResponse.json({ data, meta: { limit: options.limit ?? 20, offset: options.offset ?? 0 } });
    });
  }),

  http.get('/api/users/:id', async ({ request, params }) => {
    return withMiddleware(getMiddleware('user', 'get'), request, async (ctx) => {
      const data = await userService.get(ctx, params.id as string);
      return HttpResponse.json({ data });
    });
  }),

  http.post('/api/users', async ({ request }) => {
    return withMiddleware(getMiddleware('user', 'create'), request, async (ctx) => {
      const body = await request.json() as UserCreate;
      const data = await userService.create(ctx, body);
      return HttpResponse.json({ data }, { status: 201 });
    });
  }),

  // ... PUT, PATCH, DELETE handlers
];
```

### Target: Next.js

```typescript
// handlers.ts
import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware, getMiddleware, type MiddlewareContext } from './middleware';
import { userService } from './services';

export async function listUser(request: NextRequest) {
  const options = parseQueryOptions(request);
  return withMiddleware(getMiddleware('user', 'list'), request, async (ctx) => {
    const data = await userService.list(ctx, options);
    return NextResponse.json({ data, meta: { ... } });
  });
}

export async function getUser(request: NextRequest, id: string) {
  return withMiddleware(getMiddleware('user', 'get'), request, async (ctx) => {
    const data = await userService.get(ctx, id);
    return NextResponse.json({ data });
  });
}

// ... createUser, updateUser, deleteUser
```

### Target: Express

```typescript
// handlers.ts
import type { Request, Response, NextFunction } from 'express';

export async function listUser(req: Request, res: Response, next: NextFunction) {
  const options = parseQueryOptions(req);
  return withMiddleware(getMiddleware('user', 'list'), req, res, async (ctx) => {
    const data = await userService.list(ctx, options);
    res.json({ data, meta: { ... } });
  });
}
```

### Target: Supabase Edge

```typescript
// handlers.ts
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function listUser(request: Request): Promise<Response> {
  const options = parseQueryOptions(request);
  return withMiddleware(getMiddleware('user', 'list'), request, async (ctx) => {
    const data = await userService.list(ctx, options);
    return jsonResponse({ data, meta: { ... } });
  });
}
```

## Middleware Helper

The middleware helper provides orchestration infrastructure.

### Generated Components

| Component | Purpose |
|-----------|---------|
| `MiddlewareContext` | Interface for auth/tenant context |
| `AuthError` | 401 error class |
| `ForbiddenError` | 403 error class |
| `decodeJwtPayload()` | JWT payload extraction (no verification) |
| `extractContextFromHeaders()` | Extracts context from request headers |
| `MiddlewareHandler` | Type for middleware functions |
| `withMiddleware()` | Runs middleware chain and handler |
| `getMiddleware()` | Resolves middleware for entity/operation |
| `middlewareConfig` | Per-entity middleware configuration |

### withMiddleware Flow

```
Request
   │
   ▼
extractContextFromHeaders()  ← Extract userId, role, tenantId from JWT
   │
   ▼
for each middleware:
   │
   ├─► Middleware returns Response → Return early
   │
   └─► Middleware returns Context → Continue with updated context
   │
   ▼
handler(ctx)  ← Execute service method
   │
   ▼
Response
```

### Middleware Configuration

Per-entity middleware is configured from schema definitions:

```typescript
const middlewareConfig = {
  user: {
    default: [authMiddleware, tenantMiddleware],
    operations: {
      list: [],  // Public
      delete: [authMiddleware, adminMiddleware],
    },
  },
  post: {
    default: [authMiddleware],
    operations: {},
  },
};
```

## Examples

### Basic CRUD Flow

```typescript
// 1. Define schema
const userSchema = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  tenantId: field.uuid(),
}, {
  rls: { scope: [{ field: 'tenantId', contextKey: 'tenantId' }] },
});

// 2. Generate code
npx schemock generate --framework nextjs

// 3. Use in Next.js route
// app/api/users/route.ts
import { listUser, createUser } from '@/generated/api/handlers';

export const GET = listUser;
export const POST = createUser;
```

### Custom Middleware

```typescript
// Define custom middleware
import { defineServerMiddleware, field } from 'schemock/schema';

export const auditMiddleware = defineServerMiddleware('audit', {
  config: {
    logLevel: field.enum(['info', 'debug']).default('info'),
  },
  handler: async ({ ctx, config, next }) => {
    console.log(`[${config.logLevel}] ${ctx.userId} accessing resource`);
    return next();
  },
});

// Use in schema
const postSchema = defineData('post', { ... }, {
  middleware: [auditMiddleware],
});
```

### Skipping Operations

```typescript
// In generator config
const handlers = generateUnifiedHandlers(schemas, [], {
  target: 'msw',
  skip: ['user.delete', 'post.update'],  // Skip these operations
});
```

## Import Paths

Customize import paths for your project structure:

| Config | Default | Description |
|--------|---------|-------------|
| `dbImport` | `'./db'` | Path to database factory |
| `typesImport` | `'../types'` | Path to type definitions |
| `servicesImport` | `'./services'` | Path to service layer |
| `middlewareImport` | `'./middleware'` | Path to middleware helper |

## API Reference

### generateWithMiddleware

```typescript
function generateWithMiddleware(
  schemas: AnalyzedSchema[],
  config: WithMiddlewareConfig
): string;

interface WithMiddlewareConfig {
  target: 'msw' | 'nextjs' | 'express' | 'supabase-edge';
  servicesImport?: string;
  includeJwtExtraction?: boolean;
  customHeaders?: string[];
  middlewareImport?: string;
}
```

### generateEntityService

```typescript
function generateEntityService(
  schema: AnalyzedSchema,
  allSchemas: AnalyzedSchema[],
  config?: ServiceGeneratorConfig
): string;

interface ServiceGeneratorConfig {
  dbImport?: string;
  typesImport?: string;
  includeRLS?: boolean;
}
```

### generateUnifiedHandlers

```typescript
function generateUnifiedHandlers(
  schemas: AnalyzedSchema[],
  endpoints: AnalyzedEndpoint[],
  config: HandlerGeneratorConfig
): string;

interface HandlerGeneratorConfig {
  target: 'msw' | 'nextjs' | 'express' | 'supabase-edge';
  servicesImport?: string;
  middlewareImport?: string;
  typesImport?: string;
  skip?: string[];
  includeEndpoints?: boolean;
  apiPrefix?: string;
}
```

## Best Practices

1. **Keep services target-agnostic** - Never import framework-specific code in services
2. **Use RLS for authorization** - Define RLS in schemas, let services enforce it
3. **Customize via config** - Use generator config options, don't edit generated code
4. **Test services directly** - Unit test services with mock context objects
5. **Use consistent import paths** - Configure paths in config, not inline
