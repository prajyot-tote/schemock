# Schemock 🍀

> Schema-first mocking for frontend developers

## CRITICAL: Do Not Modify Plugin Code

**NEVER modify files in `~/.claude/plugins/cache/`** - these are cached plugin files.

If I ask to change plugin functionality:
1. **STOP** and alert me
2. Point me to the source repo: `/Users/prajyot/Documents/Work/Matt/claude-plugins/`
3. Changes should be made in source, then versioned and published

This applies to ALL plugin paths:
- `~/.claude/plugins/cache/automatewithus-plugins/**`
- Any other plugin cache directories

## Project Overview

Schemock is a TypeScript library that enables frontend developers to work independently with realistic mock data while maintaining seamless transitions to production backends.

**Tagline**: "Define once. Mock instantly. Ship faster."

## Key Differentiators

1. **FE-First** - Frontend defines the data contract, backend implements to spec
2. **Adapter Pattern** - Same interface for mock and production backends
3. **99.3% Bundle Reduction** - Mock code excluded via code generation (not Babel)
4. **Full CRUD Persistence** - Not just fake data, real operations that persist

## Project Structure

```
schemock/
├── design/              # 9 design docs (READ THESE FIRST)
├── src/
│   ├── schema/          # defineData, field.*, relations
│   ├── runtime/         # Resolver engine, setup, seed
│   ├── adapters/        # Mock, Fetch, Supabase, Firebase, GraphQL
│   ├── middleware/      # Auth, Retry, Cache, Logger
│   ├── cli/             # Code generation CLI
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
| `09-implementation-roadmap.md` | Phased plan, current status |
| `10-security.md` | RLS, rate limiting, RBAC, ABAC, audit |

> **Note**: Bundle reduction is achieved via CLI code generation - run `schemock generate --adapter supabase` for production and mock code is simply not included.

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

// React hooks (from generated code)
import { useUsers, useCreateUser } from './generated';

// Adapters (runtime, if needed)
import { createMockAdapter, createSupabaseAdapter } from 'schemock/adapters';

// Middleware
import { createAuthMiddleware, createCacheMiddleware } from 'schemock/middleware';
```

## CLI Usage

```bash
# Generate mock adapter code (development)
npx schemock generate --adapter mock

# Generate Supabase adapter code (production)
npx schemock generate --adapter supabase

# Generate for multiple targets
npx schemock generate  # uses schemock.config.ts targets
```

## Implementation Status

| Feature | Status |
|---------|--------|
| Schema DSL (`defineData`, `field.*`, relations) | ✅ Complete |
| CLI Codegen (types, clients, hooks) | ✅ Complete |
| MockAdapter (@mswjs/data, PGlite) | ✅ Complete |
| React hooks | ✅ Complete |
| Middleware (Auth, Cache, Retry) | ✅ Complete |
| Adapters (Supabase, Firebase, Fetch) | ✅ Complete |
| OpenAPI export | 🟡 Partial (Postman done) |
| Documentation | 🟡 In progress |

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
