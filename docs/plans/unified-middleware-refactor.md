# Plan: Refactor Target System with Unified Middleware

## Vision

**Define middleware once in `schemock.config.ts`, generate framework-specific code for any backend.**

Similar to how `defineEndpoint()` creates resolvers that work across mock/PGlite/production, middleware should be defined once and adapted per backend framework.

---

## Proposed Architecture

### New Config Schema

```typescript
// schemock.config.ts
export default {
  schemas: './src/schemas',
  output: './src/generated',

  // NEW: Separate FE and BE framework configuration
  frontend: {
    framework: 'react',           // react | vue | svelte | none
    adapter: 'mock',              // mock | supabase | firebase | fetch | pglite
  },

  backend: {
    framework: 'node',            // node | nextjs | supabase-edge | neon
    output: './src/server',
  },

  // Middleware defined once, generated for both FE and BE
  middleware: {
    auth: {
      provider: 'jwt',            // jwt | supabase-auth | clerk | custom
      required: true,
    },
    rateLimit: {
      max: 100,
      windowMs: 60000,
    },
    cache: {
      ttl: 300000,
      operations: ['findMany'],
    },
    logger: true,
    // Custom middleware (resolver-style)
    custom: [
      './src/middleware/tenant.ts',   // Custom middleware files
    ],
  },
};
```

### Custom Middleware Definition (Resolver Pattern)

```typescript
// src/middleware/tenant.ts
import { defineMiddleware } from 'schemock/schema';

export const tenantMiddleware = defineMiddleware('tenant', {
  // Config schema (optional)
  config: {
    headerName: field.string().default('X-Tenant-ID'),
  },

  // Handler - same pattern as endpoint resolvers
  handler: async ({ ctx, config, next }) => {
    const tenantId = ctx.headers[config.headerName];
    if (!tenantId) {
      throw new MiddlewareError('Tenant ID required', 400);
    }
    ctx.context.tenantId = tenantId;
    return next();
  },
});
```

### Generated Output Per Backend

| Backend | Generated Middleware Pattern |
|---------|------------------------------|
| **node** (Express) | `(req, res, next) => {}` functions + router setup |
| **nextjs** | Inline checks OR `middleware.ts` for edge |
| **supabase-edge** | Deno-style Edge Function handlers |
| **neon** | Similar to Node (using @neondatabase/serverless) |

---

## What Exists vs What Needs Building

### Can Reuse (Existing Code)

| Component | Location | Notes |
|-----------|----------|-------|
| Middleware types | `src/middleware/types.ts` | `Middleware`, `MiddlewareContext` interfaces |
| Middleware chain | `src/middleware/chain.ts` | `MiddlewareChain` class |
| Built-in middleware | `src/middleware/*.ts` | Auth, Cache, Retry, Logger, Context, RLS |
| Endpoint analyzer pattern | `src/cli/analyze-endpoints.ts` | Reuse for middleware discovery |
| Resolver serialization | `src/cli/generators/mock/endpoints.ts` | `injectResolverTypeAnnotation()` pattern |
| Node handler generator | `src/cli/generators/node-handlers/` | Base for Express middleware |
| Next.js generator | `src/cli/generators/nextjs-api/` | Base for Next.js middleware |

### Needs Building (New Code)

| Component | Description |
|-----------|-------------|
| `defineMiddleware()` | Schema-layer API for custom middleware |
| `analyzeMiddleware()` | CLI analyzer for middleware discovery |
| Config schema update | New `frontend`/`backend`/`middleware` structure |
| Middleware generators | Per-backend code generators |
| Supabase Edge generator | New target type for Edge Functions |
| Neon generator | Node-like but with @neondatabase/serverless |

---

## Implementation Phases

### Phase 1: Foundation (Config + Types) ✅ COMPLETE
**Goal:** New config schema without breaking existing functionality

1. Define new `SchemockConfig` interface with `frontend`/`backend`/`middleware`
2. Add backward compatibility layer for old config format
3. Create `defineMiddleware()` API in `src/schema/`
4. Add `MiddlewareSchema` types

**Files modified:**
- `src/cli/types.ts` - Config schema (added FrontendConfig, BackendConfig, MiddlewareConfig)
- `src/schema/define-middleware.ts` - New file
- `src/schema/types.ts` - Added MiddlewareSchema types
- `src/schema/index.ts` - Export defineMiddleware

### Phase 2: Middleware Analysis ✅ COMPLETE
**Goal:** Discover and analyze custom middleware definitions

1. Create `analyzeMiddleware()` following `analyzeEndpoints()` pattern
2. Handle named vs inline handlers (like resolvers)
3. Dependency detection for custom middleware

**Files created:**
- `src/cli/analyze-middleware.ts`
- `src/cli/types.ts` - Added AnalyzedMiddleware, AnalyzedMiddlewareConfigField

### Phase 3: Node/Express Backend ✅ COMPLETE
**Goal:** Generate Express middleware from config

1. Generate middleware files from config
2. Generate middleware chain setup
3. Integrate with existing `node-handlers` generator
4. Support custom middleware injection

**Files modified/created:**
- `src/cli/generators/node-handlers/middleware-chain-template.ts` - NEW: Generates middleware chain setup
- `src/cli/generators/node-handlers/middleware-template.ts` - Added generators for all middleware types:
  - `generateRateLimitMiddleware()` - Rate limiting
  - `generateCacheMiddleware()` - Response caching
  - `generateLoggerMiddleware()` - Request/response logging
  - `generateContextMiddleware()` - JWT/header context extraction
  - `generateRlsMiddleware()` - Row-level security
  - `generateCustomMiddleware()` - Custom middleware from defineMiddleware()
- `src/cli/generators/node-handlers/router-template.ts` - Uses middleware chain when new config is present
- `src/cli/generators/node-handlers/index.ts` - Orchestrates middleware generation from config

### Phase 4: Next.js Backend ✅ COMPLETE
**Goal:** Generate Next.js middleware from config

1. Generate `middleware.ts` for edge middleware (auth, rate limit)
2. Generate inline middleware for route handlers
3. Support custom middleware

**Files created:**
- `src/cli/generators/nextjs-api/middleware-template.ts` - NEW: Generates middleware files:
  - `generateAuthMiddlewareNextjs()` - JWT, Supabase Auth, NextAuth, Clerk support
  - `generateRateLimitMiddlewareNextjs()` - IP/user-based rate limiting
  - `generateCacheMiddlewareNextjs()` - Response caching
  - `generateLoggerMiddlewareNextjs()` - Request/response logging
  - `generateContextMiddlewareNextjs()` - JWT/header context extraction
  - `generateRlsMiddlewareNextjs()` - Row-level security from schema config
  - `generateCustomMiddlewareNextjs()` - Custom middleware from defineMiddleware()
  - `generateValidationNextjs()` - Schema-based validation
- `src/cli/generators/nextjs-api/middleware-chain-template.ts` - NEW: Generates middleware chain:
  - `generateNextjsMiddlewareChain()` - Coordinates all middleware
  - `runMiddlewareChain()` - Runs middleware in sequence
  - `withMiddleware()` - Helper to wrap route handlers
  - Exports `middleware` object and `middlewareOrder` array

**Files modified:**
- `src/cli/generators/nextjs-api/index.ts` - Added customMiddleware parameter, generates middleware from config
- `src/cli/generators/nextjs-api/route-template.ts` - Uses middleware chain when new config is present

### Phase 5: Supabase Edge Functions
**Goal:** New backend target for Supabase Edge

1. Create Supabase Edge Function generator
2. Adapt middleware to Deno patterns
3. Generate proper project structure

**Files to create:**
- `src/cli/generators/supabase-edge/`

### Phase 6: Neon Serverless
**Goal:** Backend using @neondatabase/serverless

1. Similar to Node but with Neon driver
2. Optimized for edge/serverless environments

**Files to create:**
- `src/cli/generators/neon/`

### Phase 7: Frontend Adapter Middleware
**Goal:** Apply same middleware config to client adapters

1. Generate middleware chain for MockAdapter
2. Generate interceptors for Supabase/Firebase clients
3. Unify FE and BE middleware from same config

---

## Critical Considerations

### 1. Breaking Changes
The config refactor is breaking. Options:
- **Option A:** Major version bump (v1.0.0)
- **Option B:** Support both old and new config with deprecation warnings

### 2. Middleware Semantics Differ
- Express: `next()` continues chain
- Next.js Edge: Return response or `NextResponse.next()`
- Supabase Edge: Deno patterns

The `defineMiddleware()` handler needs an abstraction that translates.

### 3. Custom Middleware Portability
Not all custom code will work everywhere:
- Node-specific APIs won't work in Edge/Deno
- Need clear documentation on portable patterns

### 4. Testing Strategy
- Unit tests for each generator
- Integration tests with real Next.js/Express apps
- E2E tests for full generation → runtime flow

---

## Decisions Made

1. **Config migration:** Breaking change for v1.0 - new format required, provide migration docs
2. **Phase priority:** Node/Express → Next.js → Supabase Edge → Neon
3. **Execution:** Separate PRs per phase for easier review
4. **Middleware ordering:** Use sensible defaults (auth → logger → context → rls → cache)

---

## Files Summary

### Phase 1 (Foundation)
- `src/cli/types.ts` - Config schema update
- `src/schema/define-middleware.ts` - New
- `src/schema/types.ts` - Middleware types

### Phase 2 (Analysis)
- `src/cli/analyze-middleware.ts` - New

### Phase 3-6 (Generators)
- `src/cli/generators/node-handlers/` - Modify
- `src/cli/generators/nextjs-api/` - Modify
- `src/cli/generators/supabase-edge/` - New
- `src/cli/generators/neon/` - New

---

## Verification

1. **Config parsing:** New config loads without errors
2. **Backward compat:** Old configs still work (with warnings)
3. **Node generation:** `npx schemock generate` produces valid Express middleware
4. **Next.js generation:** Produces valid Next.js middleware
5. **Custom middleware:** User-defined middleware generates correctly
6. **Type safety:** Generated code has full TypeScript types
