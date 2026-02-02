# Schemock v2: Full-Stack Schema-Driven Framework

## Executive Summary

Based on your requirements, Schemock v2 should transform from a **mock-first code generator** to a **full-stack schema-driven framework** where:

1. **Frontend defines contracts** (schema + endpoints)
2. **Mock is generated** for development/testing
3. **Production backend code is generated** for multiple targets (Express, Next.js, tRPC, Supabase Edge, etc.)

**New USP**: "Define once. Generate everywhere. Ship to any backend."

---

## Breaking Changes vs. Incremental: Comparison

### Option A: Clean Break (v2.0)

| Aspect | Details |
|--------|---------|
| **Effort** | 12-16 weeks for core framework + initial plugins |
| **Code Reuse** | ~40% - Schema DSL, analysis pipeline, utilities |
| **Risk** | Higher - existing users need migration |
| **Benefit** | Clean architecture, no legacy constraints |

**What gets rewritten:**
- Plugin system (new)
- Target registry → Plugin dispatcher
- Configuration format
- CLI commands

**What gets reused:**
- Schema DSL (`defineData`, `field.*`, relations)
- Analysis pipeline (`analyzeSchemas`, `AnalyzedSchema`)
- Type generation utilities
- RLS logic (refactored into plugin-consumable format)

### Option B: Incremental (v1.x → v2.0)

| Aspect | Details |
|--------|---------|
| **Effort** | 16-20 weeks (longer due to compatibility layer) |
| **Code Reuse** | ~70% - Most existing code preserved |
| **Risk** | Lower - backwards compatible |
| **Benefit** | Existing users unaffected |

**Approach:**
1. v1.5: Add plugin interface alongside existing generators
2. v1.6: Convert existing generators to plugins
3. v1.7: Add new backend plugins (Express, tRPC)
4. v2.0: Deprecate legacy config, clean up

### Option C: Parallel Version (Recommended)

| Aspect | Details |
|--------|---------|
| **Effort** | 14-18 weeks |
| **Code Reuse** | ~50% - Shared core, separate entry points |
| **Risk** | Medium - two codebases temporarily |
| **Benefit** | Best of both worlds |

**Approach:**
```
schemock/
├── src/
│   ├── core/           # Shared: schema, analysis, types
│   ├── v1/             # Current generators (maintained)
│   └── v2/             # New plugin system
├── package.json        # Exports both versions
```

```typescript
// Users choose their entry point
import { defineConfig } from 'schemock/cli';      // v1 (current)
import { defineConfig } from 'schemock/v2';       // v2 (new)
```

**My Recommendation: Option C (Parallel Version)**
- Allows v2 development without breaking v1 users
- Shared core reduces duplication
- Clear migration path when v2 is stable
- Can eventually deprecate v1 exports

---

## Core Architecture: Plugin-Based Full-Stack Generation

### The Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SCHEMOCK V2 ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Schema DSL      │  defineData(), field.*, relations, RLS
│  (Reused from v1)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Analysis        │  AnalyzedSchema, AnalyzedEndpoint, AnalyzedMiddleware
│  (Reused from v1)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Plugin Registry │  Load built-in + npm + local plugins
│  (NEW)           │
└────────┬─────────┘
         │
         ├──────────────┬──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Mock Plugin  │ │ Express      │ │ Next.js      │ │ tRPC Plugin  │ │ Supabase     │
│              │ │ Plugin       │ │ Plugin       │ │              │ │ Edge Plugin  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Generated Code                                                          │
│  - Types (shared)                                                        │
│  - Client SDK (frontend)                                                 │
│  - Route handlers (backend)                                              │
│  - Middleware (auth, RLS, validation)                                    │
│  - Database schema/migrations                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Plugin Interface

```typescript
// Core plugin interface - inspired by Prisma generators
interface SchemockPlugin {
  name: string;                    // 'express', 'nextjs', 'trpc'
  displayName: string;             // 'Express.js'
  version: string;
  category: 'frontend-adapter' | 'backend-framework' | 'baas' | 'database' | 'documentation';

  manifest: {
    outputs: Array<{
      type: 'routes' | 'handlers' | 'client' | 'types' | 'sql';
      pathPattern: string;         // 'routes/{{plural}}.ts'
    }>;
    peerDependencies?: Record<string, string>;
    capabilities: {
      crud: boolean;
      customEndpoints: boolean;
      relations: boolean;
      rls: boolean;
      realtime: boolean;
      transactions: boolean;
    };
  };

  generate(context: PluginGenerationContext): Promise<PluginGenerationResult>;
  validateConfig?(config: unknown): ValidationResult;
  postGenerate?(context: PostGenerateContext): Promise<void>;
}
```

### Generation Context (What Plugins Receive)

```typescript
interface PluginGenerationContext {
  schemas: AnalyzedSchema[];       // All analyzed entities
  endpoints: AnalyzedEndpoint[];   // Custom endpoints
  middleware: AnalyzedMiddleware[];
  config: SchemockConfig;
  pluginConfig: Record<string, unknown>;
  target: GenerationTarget;
  outputDir: string;

  // Utilities
  utils: {
    getTypeScriptType(field: AnalyzedField): string;
    getSQLType(field: AnalyzedField, dialect: SQLDialect): string;
    getFakerCall(field: AnalyzedField): string;
    pluralize(name: string): string;
    toPascalCase(name: string): string;
    filterSchemas(schemas: AnalyzedSchema[], target: GenerationTarget): AnalyzedSchema[];
    sortByDependencies(schemas: AnalyzedSchema[]): AnalyzedSchema[];
  };

  templates: TemplateEngine;
  logger: Logger;
  dryRun: boolean;
}
```

---

## Configuration Design

### New v2 Configuration

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/v2';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  // Frontend (development with mocks)
  frontend: {
    adapter: 'mock',              // or 'supabase', 'firebase', 'pglite'
    framework: 'react',           // or 'vue', 'svelte', 'none'
    output: './src/generated/client',
  },

  // Backend (production code generation)
  backend: {
    framework: 'express',         // or 'fastify', 'nextjs', 'trpc', 'graphql'
    output: './src/generated/server',
    database: {
      type: 'supabase',           // or 'postgres', 'prisma', 'firebase'
      connectionEnvVar: 'DATABASE_URL',
    },
  },

  // Middleware (applies to both)
  middleware: {
    auth: { provider: 'supabase-auth', required: true },
    validation: true,
    rls: true,
    logger: { level: 'info' },
  },

  // Plugin-specific config
  plugins: {
    express: { cors: true, errorHandler: true },
    trpc: { subscriptions: true },
  },
});
```

### Multi-Target Configuration

```typescript
// For complex setups with multiple backends
export default defineConfig({
  schemas: './src/schemas/**/*.ts',

  targets: [
    // Mock for local dev
    { name: 'dev', type: 'mock', output: './src/generated/mock', framework: 'react' },

    // Express for admin API
    { name: 'admin', type: 'express', output: './admin/api', tags: ['admin'] },

    // tRPC for realtime features
    { name: 'realtime', type: 'trpc', output: './src/trpc', tags: ['realtime'] },

    // Supabase Edge for public API
    { name: 'api', type: 'supabase-edge', output: './supabase/functions', excludeTags: ['admin'] },
  ],
});
```

---

## Example: One Schema → Multiple Backends

### Source Schema

```typescript
// src/schemas/post.ts
export const Post = defineData('post', {
  id: field.uuid(),
  title: field.string().min(1).max(200),
  content: field.string(),
  status: field.enum(['draft', 'published']).default('draft'),
  authorId: field.ref('user'),
  createdAt: field.date().readOnly(),

  author: belongsTo('user', { foreignKey: 'authorId' }),
}, {
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

### Generated: Express Routes

```typescript
// Generated: src/generated/server/routes/posts.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import * as handlers from '../handlers/posts';

export const postsRouter = Router();

postsRouter.get('/', handlers.listPosts);
postsRouter.get('/:id', handlers.getPost);
postsRouter.post('/', authMiddleware, validateBody(postCreateSchema), handlers.createPost);
postsRouter.put('/:id', authMiddleware, validateBody(postUpdateSchema), handlers.updatePost);
postsRouter.delete('/:id', authMiddleware, handlers.deletePost);
```

### Generated: tRPC Router

```typescript
// Generated: src/trpc/routers/post.ts
export const postRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return db.post.findMany({ take: input.limit });
    }),

  create: protectedProcedure
    .input(postCreateSchema)
    .mutation(async ({ input, ctx }) => {
      return db.post.create({ data: { ...input, authorId: ctx.user.id } });
    }),

  onUpdate: publicProcedure
    .subscription(({ input }) => {
      return observable<Post>((emit) => {
        // Realtime subscription
      });
    }),
});
```

### Generated: Next.js API Route

```typescript
// Generated: src/app/api/posts/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .limit(limit);

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { data, error } = await supabase.from('posts').insert(body).select().single();
  return NextResponse.json(data, { status: 201 });
}
```

---

## Built-in Plugins (Phase 1)

| Plugin | Category | Generates | Status |
|--------|----------|-----------|--------|
| `mock` | frontend-adapter | Client + MSW handlers + seed | Migrate from v1 |
| `supabase` | frontend-adapter | Supabase client wrapper | Migrate from v1 |
| `pglite` | frontend-adapter | PGlite client + SQL | Migrate from v1 |
| `firebase` | frontend-adapter | Firebase client wrapper | Migrate from v1 |
| `express` | backend-framework | Routes + handlers + middleware | **New** |
| `fastify` | backend-framework | Routes + handlers + middleware | **New** |
| `nextjs` | backend-framework | API routes (App Router) | Migrate from v1 |
| `trpc` | backend-framework | Routers + procedures | **New** |
| `graphql` | backend-framework | Schema SDL + resolvers | **New** |
| `supabase-edge` | baas | Edge Functions | Migrate from v1 |
| `openapi` | documentation | OpenAPI 3.0 spec | **New** |

---

## Implementation Roadmap

### Phase 1: Core Plugin System (4-6 weeks)
**Goal**: Build the plugin infrastructure

1. Define `SchemockPlugin` interface and types
2. Implement `PluginRegistry` (built-in + npm + local loading)
3. Create `TemplateEngine` and `CodeBuilder` utilities
4. Refactor `mock` generator → `mock` plugin (proof of concept)
5. Update CLI to use plugin dispatcher

**Deliverable**: `npx schemock generate` works with plugin system

### Phase 2: Migrate Existing Generators (3-4 weeks)
**Goal**: All v1 generators become plugins

1. Convert `supabase` → plugin
2. Convert `pglite` → plugin
3. Convert `firebase` → plugin
4. Convert `nextjs-api` → plugin
5. Convert `supabase-edge` → plugin
6. Ensure backwards compatibility with v1 config

**Deliverable**: All existing functionality works via plugins

### Phase 3: New Backend Plugins (6-8 weeks)
**Goal**: Full backend generation

1. **Express plugin** - Routes, handlers, middleware, error handling
2. **Fastify plugin** - Routes, handlers, schema validation
3. **tRPC plugin** - Routers, procedures, subscriptions
4. **GraphQL plugin** - SDL schema, resolvers, DataLoader

**Deliverable**: Generate production-ready backend code

### Phase 4: Database Abstraction (3-4 weeks)
**Goal**: Plugins can target different databases

1. Unified database adapter interface for plugins
2. Prisma adapter (generate Prisma-compatible queries)
3. Drizzle adapter
4. Raw SQL adapter

**Deliverable**: Express plugin works with Prisma, Drizzle, or raw SQL

### Phase 5: OpenAPI & Documentation (2-3 weeks)
**Goal**: Standard API documentation

1. **OpenAPI plugin** - Generate OpenAPI 3.0 spec
2. Export to Postman, Swagger UI
3. Generate client SDKs from OpenAPI

**Deliverable**: Full API documentation from schema

---

## What Gets Reused from v1

| Component | Reuse Level | Notes |
|-----------|-------------|-------|
| Schema DSL (`defineData`, `field.*`) | 100% | Core abstraction unchanged |
| Relations (`hasMany`, `belongsTo`) | 100% | Works as-is |
| RLS definitions | 100% | Schema-level, plugin-agnostic |
| Analysis pipeline | 90% | Minor extensions for new features |
| `AnalyzedSchema` types | 90% | Add new fields for plugins |
| `CodeBuilder` utility | 100% | Reuse for all plugins |
| Type generation utilities | 80% | Extract into shared utils |
| Existing generator logic | 60% | Refactor into plugin format |

---

## Critical Files to Modify/Create

### Modify (Refactor)
1. `src/cli/generators/target-registry.ts` → Plugin dispatcher
2. `src/cli/types.ts` → Add plugin interfaces
3. `src/cli/generate.ts` → Use plugin system

### Create (New)
1. `src/v2/plugins/types.ts` → Plugin interface definitions
2. `src/v2/plugins/registry.ts` → Plugin loading and management
3. `src/v2/plugins/builtin/express/` → Express plugin
4. `src/v2/plugins/builtin/trpc/` → tRPC plugin
5. `src/v2/plugins/builtin/graphql/` → GraphQL plugin

---

## Libraries to Leverage

| Library | Purpose | Why |
|---------|---------|-----|
| **ts-morph** | Complex AST transformations | For sophisticated code generation |
| **zod-to-json-schema** | OpenAPI export | Convert Zod schemas to JSON Schema |
| **openapi-typescript** | Type generation from OpenAPI | For client SDK generation |
| **@faker-js/faker** | Keep | Mock data generation |
| **MSW** | Keep | HTTP mocking |
| **PGlite** | Keep | Browser PostgreSQL |

---

## Summary

Schemock v2 transforms from a **mock-first tool** to a **full-stack schema-driven framework**:

1. **Frontend defines contracts** via schema DSL
2. **Plugin system** generates code for any backend target
3. **Mock → Production** is a config change, not a rewrite
4. **Extensible** - community can build custom plugins

The architecture change is significant but ~50% of current code is reusable. The parallel version approach (Option C) allows development without breaking existing users.
