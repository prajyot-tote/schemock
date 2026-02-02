# Schemock Architecture Rework Plan

> **Status:** Planning Complete - Ready for Implementation
> **Created:** 2026-02-02
> **Goal:** Transform Schemock from a "shortcut mock" to a production-ready mock system

---

## Executive Summary

Rearchitect Schemock to mirror real production architecture. The generated code will have proper separation:

```
Client (frontend) → Routes (HTTP) → Services (business logic) → Database
```

**Key Principle:** Mock should behave exactly like production. Same client code works with mock AND real backends.

---

## Current Problems (What We're Fixing)

| # | Problem | Current State | Target State |
|---|---------|---------------|--------------|
| 1 | Client accesses DB directly | `client.ts` imports `db`, calls `db.user.getAll()` | Client only uses `fetch()` |
| 2 | No HTTP layer for CRUD | Entity CRUD bypasses HTTP entirely | All operations go through HTTP |
| 3 | Middleware is hardcoded | Built-in "auth", "rateLimit" | All middleware user-defined |
| 4 | Middleware referenced by string | `middleware: ['auth']` | Direct reference: `middleware: [authMiddleware]` |
| 5 | Custom endpoints bypass middleware | No middleware chain | Same middleware system as CRUD |
| 6 | RLS checked in client | Client-side enforcement | Service layer enforcement |
| 7 | Auth extracted, not validated | Client extracts JWT | Server middleware validates |
| 8 | Generated code not production-ready | Can't switch to real backend | Same client works with any backend |
| 9 | Backend code mixed with frontend | Everything in `generated/` | Separate frontend/backend outputs |
| 10 | No integration with existing code | Isolated mock system | Works with user's DB, services, routes |

---

## New Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVELOPER CODE                                                     │
│                                                                     │
│    import { api } from '@/generated/client';                        │
│                                                                     │
│    const users = await api.user.list();                             │
│    const result = await api.search({ q: 'test' });                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER (generated/client.ts)                                 │
│                                                                     │
│    - fetch() calls ONLY                                             │
│    - NO db import                                                   │
│    - Interceptors for auth headers                                  │
│    - Same code for mock AND production                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (fetch)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ROUTE LAYER                                                        │
│                                                                     │
│    Mock: MSW handlers (generated/handlers.ts)                       │
│    Next.js: app/api/users/route.ts                                  │
│    Express: src/routes/users.ts                                     │
│                                                                     │
│    - Receives HTTP request                                          │
│    - Runs middleware chain                                          │
│    - Calls service layer                                            │
│    - Returns HTTP response                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (generated/services/*.ts)                            │
│                                                                     │
│    - Business logic                                                 │
│    - RLS enforcement                                                │
│    - Database access                                                │
│    - Reusable across routes                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE LAYER                                                     │
│                                                                     │
│    Mock: @mswjs/data or PGlite (in-memory)                          │
│    Production: Prisma, Supabase, Drizzle, etc.                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Changes

### 1. Middleware Definition (User-Defined, No Built-ins)

```typescript
// src/middleware/auth.ts
import { defineServerMiddleware } from 'schemock/schema';

export const authMiddleware = defineServerMiddleware({
  name: 'auth',
  requiredHeaders: ['Authorization'],  // Metadata for documentation/validation
  handler: async ({ ctx, next }) => {
    const token = ctx.headers.Authorization?.replace('Bearer ', '');
    if (!token) throw new ApiError('Unauthorized', 401);
    ctx.context.userId = decodeJwt(token).sub;
    ctx.context.role = decodeJwt(token).role;
    return next();
  }
});

// Configurable middleware with .with() override
export const rateLimitMiddleware = defineServerMiddleware({
  name: 'rateLimit',
  config: {
    max: field.number().default(100),
    windowMs: field.number().default(60000),
  },
  handler: async ({ ctx, config, next }) => {
    // User implements rate limiting logic
    return next();
  }
});

// Usage with config override
rateLimitMiddleware.with({ max: 10 })  // Stricter limit
```

### 2. Entity Definition with Middleware

```typescript
// src/schemas/user.ts
import { defineData, field } from 'schemock/schema';
import { authMiddleware, tenantMiddleware, adminMiddleware } from '../middleware';

export const userSchema = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  email: field.email(),
  tenantId: field.uuid(),
}, {
  // Default middleware for all CRUD operations
  middleware: [authMiddleware, tenantMiddleware],

  // Per-operation overrides
  endpoints: {
    list: { middleware: [] },  // Public - no auth required
    create: { middleware: [authMiddleware, tenantMiddleware] },  // Default
    update: { middleware: [authMiddleware, tenantMiddleware] },  // Default
    delete: { middleware: [authMiddleware, adminMiddleware] },   // Admin only
  },

  // RLS config (enforced in service layer)
  rls: {
    scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
  },
});
```

### 3. Custom Endpoint with Middleware

```typescript
// src/endpoints/search.ts
import { defineEndpoint, field } from 'schemock/schema';
import { authMiddleware, tenantMiddleware } from '../middleware';

export const searchEndpoint = defineEndpoint({
  path: '/api/search',
  method: 'POST',
  middleware: [authMiddleware, tenantMiddleware],  // Direct reference, not string
  params: {
    q: field.string(),
    limit: field.number().default(20),
  },
  response: {
    results: field.array(field.object({
      id: field.uuid(),
      name: field.string(),
      score: field.number(),
    })),
    total: field.number(),
  },
  resolver: async ({ params, db, context }) => {
    // context.userId available from authMiddleware
    // context.tenantId available from tenantMiddleware
    const results = db.user.findMany({
      where: {
        name: { contains: params.q },
        tenantId: context.tenantId,
      },
      take: params.limit,
    });
    return { results, total: results.length };
  }
});
```

---

## Generated Code Structure

### File Structure

```
project/
├── src/
│   ├── generated/                    # Frontend + Services (ALWAYS here)
│   │   ├── client.ts                 # API client (fetch only)
│   │   ├── types.ts                  # TypeScript types
│   │   ├── hooks.ts                  # React hooks (if framework: 'react')
│   │   ├── middleware.ts             # withMiddleware helper
│   │   └── services/                 # Business logic layer
│   │       ├── user.service.ts
│   │       ├── post.service.ts
│   │       └── search.service.ts
│   │
│   ├── schemas/                      # User-defined schemas
│   │   ├── user.ts
│   │   └── post.ts
│   │
│   ├── endpoints/                    # User-defined custom endpoints
│   │   └── search.ts
│   │
│   ├── middleware/                   # User-defined middleware
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── tenant.ts
│   │   └── admin.ts
│   │
│   └── lib/                          # User's existing code
│       ├── db.ts                     # Database client (Prisma, Supabase, etc.)
│       └── email.ts
│
├── app/api/                          # Backend routes (Next.js target)
│   ├── users/
│   │   ├── route.ts                  # GET /api/users, POST /api/users
│   │   └── [id]/
│   │       └── route.ts              # GET/PATCH/DELETE /api/users/:id
│   ├── posts/
│   │   └── ...
│   └── search/
│       └── route.ts                  # POST /api/search
│
└── schemock.config.ts
```

### Generated Client (fetch only)

```typescript
// src/generated/client.ts
// NO db import - fetch() only

export interface RequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ClientConfig {
  baseUrl?: string;
  onRequest?: (ctx: RequestContext) => RequestContext | Promise<RequestContext>;
  onError?: (error: ApiError) => void | Promise<void>;
}

export function createClient(config?: ClientConfig) {
  async function request<T>(
    method: string,
    path: string,
    options?: { query?: Record<string, unknown>; body?: unknown }
  ): Promise<T> {
    let ctx: RequestContext = { method, path, headers: {}, body: options?.body };

    // Run interceptor (adds auth headers)
    if (config?.onRequest) {
      ctx = await config.onRequest(ctx);
    }

    // Build URL
    const url = new URL(path, config?.baseUrl ?? window.location.origin);
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, JSON.stringify(value));
        }
      }
    }

    // Make request
    const response = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', ...ctx.headers },
      body: ctx.body ? JSON.stringify(ctx.body) : undefined,
    });

    // Handle errors
    if (!response.ok) {
      const error = await parseError(response);
      if (config?.onError) await config.onError(error);
      throw error;
    }

    return response.json();
  }

  return {
    // Entity CRUD
    user: {
      list: (options?: UserListOptions) =>
        request<ListResponse<User>>('GET', '/api/users', { query: options }),
      get: (id: string) =>
        request<ItemResponse<User>>('GET', `/api/users/${id}`),
      create: (data: UserCreate) =>
        request<ItemResponse<User>>('POST', '/api/users', { body: data }),
      update: (id: string, data: UserUpdate) =>
        request<ItemResponse<User>>('PATCH', `/api/users/${id}`, { body: data }),
      delete: (id: string) =>
        request<void>('DELETE', `/api/users/${id}`),
    },

    // Custom endpoints
    search: (params: SearchParams) =>
      request<SearchResponse>('POST', '/api/search', { body: params }),
  };
}

export const api = createClient();
```

### Generated Service

```typescript
// src/generated/services/user.service.ts
import { db } from '@/lib/db';  // User's DB client (configured in schemock.config.ts)
import type { User, UserCreate, UserUpdate, ListOptions } from '../types';
import type { MiddlewareContext } from '../middleware';

export const userService = {
  async list(ctx: MiddlewareContext, options?: ListOptions): Promise<User[]> {
    return db.user.findMany({
      where: {
        tenantId: ctx.context.tenantId,  // RLS enforcement
        ...options?.where
      },
      orderBy: options?.orderBy,
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
    });
  },

  async get(ctx: MiddlewareContext, id: string): Promise<User | null> {
    const user = await db.user.findUnique({ where: { id } });
    // RLS check
    if (user && user.tenantId !== ctx.context.tenantId) {
      return null;
    }
    return user;
  },

  async create(ctx: MiddlewareContext, data: UserCreate): Promise<User> {
    return db.user.create({
      data: {
        ...data,
        tenantId: ctx.context.tenantId,
        createdBy: ctx.context.userId,
      },
    });
  },

  async update(ctx: MiddlewareContext, id: string, data: UserUpdate): Promise<User> {
    const existing = await this.get(ctx, id);
    if (!existing) throw new NotFoundError('User', id);
    return db.user.update({ where: { id }, data });
  },

  async delete(ctx: MiddlewareContext, id: string): Promise<void> {
    const existing = await this.get(ctx, id);
    if (!existing) throw new NotFoundError('User', id);
    await db.user.delete({ where: { id } });
  },
};
```

### Generated Routes (Next.js Target)

```typescript
// app/api/users/route.ts (generated)
import { userService } from '@/generated/services/user.service';
import { withMiddleware, parseQueryOptions } from '@/generated/middleware';
import { authMiddleware, tenantMiddleware } from '@/middleware';

// GET /api/users - public (no middleware per schema config)
export async function GET(request: Request) {
  return withMiddleware([], request, async (ctx) => {
    const options = parseQueryOptions(new URL(request.url));
    const users = await userService.list(ctx, options);
    return Response.json({ data: users });
  });
}

// POST /api/users - requires auth + tenant
export async function POST(request: Request) {
  return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
    const data = await request.json();
    const user = await userService.create(ctx, data);
    return Response.json({ data: user }, { status: 201 });
  });
}
```

```typescript
// app/api/users/[id]/route.ts (generated)
import { userService } from '@/generated/services/user.service';
import { withMiddleware } from '@/generated/middleware';
import { authMiddleware, tenantMiddleware, adminMiddleware } from '@/middleware';

// GET /api/users/:id - requires auth + tenant
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
    const user = await userService.get(ctx, params.id);
    if (!user) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ data: user });
  });
}

// PATCH /api/users/:id - requires auth + tenant
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
    const data = await request.json();
    const user = await userService.update(ctx, params.id, data);
    return Response.json({ data: user });
  });
}

// DELETE /api/users/:id - requires auth + admin
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return withMiddleware([authMiddleware, adminMiddleware], request, async (ctx) => {
    await userService.delete(ctx, params.id);
    return new Response(null, { status: 204 });
  });
}
```

### Generated Handlers (Mock/MSW Target)

```typescript
// src/generated/handlers.ts
import { http, HttpResponse } from 'msw';
import { userService } from './services/user.service';
import { withMiddleware, parseQueryOptions } from './middleware';
import { authMiddleware, tenantMiddleware, adminMiddleware } from '@/middleware';

export const handlers = [
  // User.list - public
  http.get('/api/users', async ({ request }) => {
    return withMiddleware([], request, async (ctx) => {
      const options = parseQueryOptions(new URL(request.url));
      const users = await userService.list(ctx, options);
      return HttpResponse.json({ data: users });
    });
  }),

  // User.get - auth + tenant
  http.get('/api/users/:id', async ({ request, params }) => {
    return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
      const user = await userService.get(ctx, params.id as string);
      if (!user) {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return HttpResponse.json({ data: user });
    });
  }),

  // User.create - auth + tenant
  http.post('/api/users', async ({ request }) => {
    return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
      const data = await request.json();
      const user = await userService.create(ctx, data);
      return HttpResponse.json({ data: user }, { status: 201 });
    });
  }),

  // User.update - auth + tenant
  http.patch('/api/users/:id', async ({ request, params }) => {
    return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
      const data = await request.json();
      const user = await userService.update(ctx, params.id as string, data);
      return HttpResponse.json({ data: user });
    });
  }),

  // User.delete - auth + admin
  http.delete('/api/users/:id', async ({ request, params }) => {
    return withMiddleware([authMiddleware, adminMiddleware], request, async (ctx) => {
      await userService.delete(ctx, params.id as string);
      return new HttpResponse(null, { status: 204 });
    });
  }),

  // Custom: search - auth + tenant
  http.post('/api/search', async ({ request }) => {
    return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
      const params = await request.json();
      const result = await searchService.execute(ctx, params);
      return HttpResponse.json(result);
    });
  }),
];
```

---

## Configuration

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock';

export default defineConfig({
  // Source files
  schemas: './src/schemas/**/*.ts',
  endpoints: './src/endpoints/**/*.ts',
  middleware: './src/middleware/**/*.ts',

  // Frontend generation
  frontend: {
    output: './src/generated',
    framework: 'react',  // 'react' | 'vue' | 'svelte' | 'none'
  },

  // Backend generation
  backend: {
    target: 'nextjs',  // 'mock' | 'nextjs' | 'express' | 'supabase-edge' | 'golang'

    // Services (always generated)
    services: {
      output: './src/generated/services',
      dbImport: '@/lib/db',  // Where to import db from
    },

    // Routes (optional, can be skipped)
    routes: {
      output: './app/api',     // Where to generate routes
      overwrite: false,        // Don't overwrite user-modified files
      skip: [                  // Skip these - user writes manually
        'POST /api/users',
        'DELETE /api/users/:id',
      ],
      skipEntities: [          // Skip entire entities
        'payment',
      ],
    },

    // Middleware import path
    middlewareImport: '@/middleware',
  },
});
```

---

## Route Override Workflow

When user needs custom logic beyond what Schemock generates:

### 1. Configure Skip in Config

```typescript
// schemock.config.ts
backend: {
  routes: {
    skip: ['POST /api/users'],  // Don't generate this route
  }
}
```

### 2. Write Custom Route Using Generated Service

```typescript
// app/api/users/route.ts (user-written)
import { userService } from '@/generated/services/user.service';
import { withMiddleware } from '@/generated/middleware';
import { authMiddleware, tenantMiddleware } from '@/middleware';
import { sendWelcomeEmail } from '@/lib/email';
import { createStripeCustomer } from '@/lib/stripe';

// GET - use generated service directly
export async function GET(request: Request) {
  return withMiddleware([], request, async (ctx) => {
    const users = await userService.list(ctx);
    return Response.json({ data: users });
  });
}

// POST - custom logic wrapping generated service
export async function POST(request: Request) {
  return withMiddleware([authMiddleware, tenantMiddleware], request, async (ctx) => {
    const data = await request.json();

    // Custom validation
    if (!isValidEmailDomain(data.email)) {
      return Response.json({ error: 'Email domain not allowed' }, { status: 400 });
    }

    // Custom: Create Stripe customer first
    const stripeCustomer = await createStripeCustomer(data.email);

    // Use generated service for DB operation
    const user = await userService.create(ctx, {
      ...data,
      stripeCustomerId: stripeCustomer.id,
    });

    // Custom: Send welcome email
    await sendWelcomeEmail(user.email, user.name);

    return Response.json({ data: user }, { status: 201 });
  });
}
```

---

## Implementation Phases

### Phase 1: Schema API Updates
- [ ] Add `middleware` option to `defineData()` options
- [ ] Add `endpoints` override option to `defineData()` options
- [ ] Add `middleware` option to `defineEndpoint()` config
- [ ] Update `defineServerMiddleware()` to support `requiredHeaders` metadata
- [ ] Add `.with()` method for middleware config override
- [ ] Change middleware from string reference to direct import
- [ ] Update TypeScript types for all schema APIs

### Phase 2: Analysis Layer Updates
- [ ] Update schema analyzer to extract middleware per operation
- [ ] Update endpoint analyzer to extract middleware
- [ ] Update middleware analyzer to extract `requiredHeaders`
- [ ] Build middleware chain resolution per operation
- [ ] Track skip/override configuration

### Phase 3: Client Generator Rewrite
- [ ] Remove ALL `db` imports from client generator
- [ ] Generate pure `fetch()` based client
- [ ] Generate unified client (entity CRUD + custom endpoints)
- [ ] Support configurable `baseUrl`
- [ ] Generate proper TypeScript types

### Phase 4: Service Generator (NEW)
- [ ] Create new service generator module
- [ ] Generate service file per entity
- [ ] Include RLS logic in service methods
- [ ] Include filtering, sorting, pagination logic
- [ ] Support configurable DB import path
- [ ] Generate custom endpoint services

### Phase 5: Route/Handler Generator Rewrite
- [ ] Rewrite handler generator to use services
- [ ] Generate handlers for ALL operations (CRUD + custom)
- [ ] Apply correct middleware chain per operation
- [ ] Support skip configuration
- [ ] Support multiple targets:
  - [ ] Mock (MSW)
  - [ ] Next.js (App Router)
  - [ ] Express
  - [ ] Supabase Edge Functions

### Phase 6: Middleware Generator Updates
- [ ] Generate `withMiddleware` helper
- [ ] Generate middleware chain runner
- [ ] Import user-defined middleware from configured path
- [ ] Handle middleware context properly

### Phase 7: Config Updates
- [ ] Add `frontend` config section
- [ ] Add `backend` config section
- [ ] Add `services.dbImport` config
- [ ] Add `routes.skip` config
- [ ] Add `routes.overwrite` config
- [ ] Add `middlewareImport` config
- [ ] Update config validation

### Phase 8: Testing & Documentation
- [ ] Test client generation (fetch only)
- [ ] Test service generation (RLS, CRUD)
- [ ] Test route generation (all targets)
- [ ] Test middleware chain execution
- [ ] Test route override workflow
- [ ] Test integration with existing user code
- [ ] Update CLAUDE.md with new architecture
- [ ] Update documentation

---

## Migration Notes

### Breaking Changes
1. Client no longer imports `db` - cannot access mock data directly
2. Middleware must be imported, not referenced by string
3. Config structure changes (`frontend`/`backend` sections)
4. Generated file structure changes

### Migration Path
1. Update middleware definitions to use `defineServerMiddleware`
2. Update schema/endpoint definitions to use direct middleware imports
3. Update `schemock.config.ts` to new format
4. Run `schemock generate`
5. Update any code that directly accessed `db` from client

---

## Success Criteria

- [ ] Client code is identical for mock and production
- [ ] All requests go through HTTP layer (no direct db access from client)
- [ ] Middleware is user-defined and type-safe
- [ ] RLS is enforced in service layer
- [ ] Generated routes can be overridden
- [ ] Works with existing user code (DB clients, services, utilities)
- [ ] Multiple backend targets supported
