# Session Context: schemock

## Key Decisions

### Session 3 (2025-12-11)

1. **Named the project "Schemock"** - Schema + mock. Unique, ownable, memorable. Sounds like "shamrock" 🍀

2. **Moved to separate repo** - `/Users/prajyot/Documents/Work/Matt/schemock/` to avoid shipping code with claude-plugins marketplace

3. **Merged session docs with existing design docs** - The `/design/` folder now has all 10 docs with session insights incorporated

### Session 2 (2025-12-11)

1. **NOT truly bidirectional** - Clarified that the library is unidirectional in the opposite direction from existing tools, not truly bidirectional (no two-way sync)

2. **Adapter Pattern is the architecture** - Instead of scattered `if (isDev)` conditionals, use abstract adapter interfaces with pluggable implementations

3. **Mix + Adapter approach** - Use existing libs internally where mature, custom code where needed, but expose consistent interface through adapters

4. **Beyond MSW** - Don't rely solely on MSW (Service Workers). With adapter pattern, dev mode can bypass network entirely with direct in-memory calls

5. **Full adapter set required**:
   - DataAdapter (CRUD + Realtime + RLS)
   - AuthAdapter (Authentication + Sessions)
   - StorageAdapter (File uploads)
   - RPCAdapter (Server functions)
   - CacheAdapter (Performance)
   - AuditAdapter (Compliance)
   - SecurityAdapter (Validation, AuthZ, Rate limits)

6. **Security is cross-cutting** - Not a separate layer but woven into every operation (validation → auth → authz → rate limit → execute → audit)

### Session 1 (2025-12-10)

1. Focus on FE-first paradigm (market gap)
2. Composition approach: faker.js + @mswjs/data + MSW
3. Data persistence is non-negotiable
4. Bidirectional flow (FE → OpenAPI) as differentiator
5. Support complex queries with views and computed fields

## Important Discoveries

### Session 3

1. **Existing design docs were comprehensive** - 9 detailed docs already existed with Schema DSL, Resolver System, Middleware, OpenAPI generation, Compile-time elimination, 14-week roadmap

2. **Session docs added value** - Security architecture, Beyond MSW discussion, Adapter pattern philosophy, Bidirectionality clarification were NEW

3. **Merged approach** - Updated existing docs with new insights rather than replacing

### Session 2

1. **Service Workers explained** - MSW works by intercepting fetch at browser level, not starting a real server. Request never leaves browser in dev mode.

2. **The abstraction layer was missing** - Original design had schemas and mocks but no generated API client connecting them. The generated client IS the abstraction.

3. **Mock → Backend translation** - Same interface means mock implementation documents what backend needs. RLS policy in JS maps directly to PostgreSQL RLS or MongoDB middleware.

4. **PGlite option** - Can run actual PostgreSQL in browser via WASM for more accurate mock behavior.

## Technical Context

### Architecture Diagram

```
Your Code → Generated API Client → Adapter Interface → [Mock|Supabase|REST|MongoDB]
```

### Package Exports
```typescript
import { defineData, field, hasMany } from 'schemock/schema';
import { useData, useMutate, useView } from 'schemock/react';
import { createSupabaseAdapter } from 'schemock/adapters';
import { createAuthMiddleware } from 'schemock/middleware';
```

### Key User Flow
```
1. npm install schemock
2. npx schemock init
3. Define schema in src/schemas/
4. npx schemock generate
5. Use generated client in components
6. Works immediately - no backend needed
7. Switch to real backend with one line config change
```

### Technology Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| In-memory DB | PGlite or @mswjs/data | Data persistence |
| Fake data | faker.js | Realistic mock data |
| Events | mitt | Tiny pub/sub for realtime |
| Validation | Zod | Schema validation |
| React Query | @tanstack/react-query | Data fetching |
| Types | TypeScript | Generated interfaces |

## Documentation

All design docs in `/design/`:

1. `01-vision-and-usp.md` - Market positioning, 8 USPs
2. `02-architecture.md` - Adapter pattern + Beyond MSW + PGlite
3. `03-schema-dsl.md` - Field types, relations, computed, views
4. `04-resolver-system.md` - Registry, resolvers, topological sort
5. `05-adapters.md` - Fetch, Supabase, Firebase, GraphQL
6. `06-middleware.md` - Auth, Retry, Cache, Logger chain
7. `07-openapi-generation.md` - Schema → OpenAPI 3.0
8. `08-compile-elimination.md` - Babel plugin, 99.3% reduction
9. `09-implementation-roadmap.md` - 14-week phased plan
10. `10-security.md` - RLS, rate limit, RBAC, ABAC, audit

## Next Steps (Implementation)

1. **Phase 1: Schema DSL** - `defineData`, `field.*`, relations
2. **Phase 2: Codegen** - TypeScript types, API client
3. **Phase 3: MockAdapter** - Data + Auth adapters
4. **Phase 4: React hooks** - `useData`, `useMutate`, `useView`
5. **Phase 5: Middleware** - Auth, Cache, Retry
6. **Phase 6: Additional adapters** - Supabase, REST
7. **Phase 7: OpenAPI export**
8. **Phase 8: Compile-time elimination**

## Open Questions

1. PGlite vs @mswjs/data - performance tradeoffs
2. Exact field type API naming conventions
3. How to handle Supabase realtime filters
4. OpenAPI export precision from faker.js definitions

## Summary

Schemock is fully designed and ready for implementation. The adapter pattern provides flexibility (mix libs + custom, swap backends). Security is integrated throughout. 10 comprehensive design docs capture everything needed to build the library.

**Next action**: Create implementation plan and start coding Phase 1 (Schema DSL).
