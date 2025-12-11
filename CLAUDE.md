# Schemock 🍀

> Schema-first mocking for frontend developers

## Project Overview

Schemock is a TypeScript library that enables frontend developers to work independently with realistic mock data while maintaining seamless transitions to production backends.

**Tagline**: "Define once. Mock instantly. Ship faster."

## Key Differentiators

1. **FE-First** - Frontend defines the data contract, backend implements to spec
2. **Adapter Pattern** - Same interface for mock and production backends
3. **99.3% Bundle Reduction** - Mock code completely eliminated at build time
4. **Full CRUD Persistence** - Not just fake data, real operations that persist

## Project Structure

```
schemock/
├── design/              # 10 comprehensive design docs (READ THESE FIRST)
├── src/
│   ├── schema/          # defineData, field.*, relations
│   ├── runtime/         # Resolver engine, setup, seed
│   ├── adapters/        # Mock, Fetch, Supabase, Firebase, GraphQL
│   ├── middleware/      # Auth, Retry, Cache, Logger
│   ├── generator/       # Types, hooks, OpenAPI
│   ├── build/           # Babel/Vite/Webpack plugins
│   ├── react/           # useData, useMutate, Provider
│   └── security/        # RLS, rate limit, audit
├── package.json
└── README.md
```

## Design Documentation

**IMPORTANT**: Read the design docs in `/design/` before implementing. They contain:

| Doc | Contents |
|-----|----------|
| `01-vision-and-usp.md` | Market positioning, 8 USPs, target users |
| `02-architecture.md` | Adapter pattern, Beyond MSW, PGlite option |
| `03-schema-dsl.md` | Field types, relations, computed fields, views |
| `04-resolver-system.md` | Registry, resolvers, topological sort |
| `05-adapters.md` | Fetch, Supabase, Firebase, GraphQL implementations |
| `06-middleware.md` | Auth, Retry, Cache, Logger chain |
| `07-openapi-generation.md` | Schema → OpenAPI 3.0 mapping |
| `08-compile-elimination.md` | Babel plugin, bundle reduction |
| `09-implementation-roadmap.md` | 14-week phased plan |
| `10-security.md` | RLS, rate limiting, RBAC, ABAC, audit |

## Session Context

This project has an active session. To continue where we left off:

```bash
/session:continue schemock
```

Session files in `.claude/sessions/schemock/`:
- `session.md` - Milestones, status, history
- `context.md` - Key decisions, discoveries, technical context

## Tech Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| In-memory DB | PGlite or @mswjs/data | Data persistence |
| Fake data | @faker-js/faker | Realistic mock data |
| Events | mitt | Pub/sub for realtime |
| Validation | zod | Schema validation |
| React Query | @tanstack/react-query | Data fetching hooks |
| Build | tsup | TypeScript bundling |

## Package Exports

```typescript
// Schema definition
import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

// React hooks
import { useData, useMutate, useView } from 'schemock/react';

// Adapters
import { createMockAdapter, createSupabaseAdapter } from 'schemock/adapters';

// Middleware
import { createAuthMiddleware, createCacheMiddleware } from 'schemock/middleware';

// Build plugins
import { schemockVitePlugin } from 'schemock/build/vite';
```

## Implementation Priority

1. **Schema DSL** - `defineData`, `field.*`, relations (foundation)
2. **Codegen** - TypeScript types, API client generation
3. **MockAdapter** - Data + Auth adapters with PGlite/@mswjs/data
4. **React hooks** - `useData`, `useMutate`, `useView`
5. **Middleware** - Auth, Cache, Retry chain
6. **Additional adapters** - Supabase, REST, Firebase
7. **OpenAPI export** - Generate specs from schemas
8. **Build plugins** - Compile-time elimination

## Code Conventions

- TypeScript strict mode
- ESM-first with CJS fallback
- Zod for runtime validation
- Comprehensive JSDoc comments
- Unit tests with Vitest

## Commands

```bash
npm run build      # Build with tsup
npm run dev        # Watch mode
npm run test       # Run tests
npm run typecheck  # TypeScript check
```
