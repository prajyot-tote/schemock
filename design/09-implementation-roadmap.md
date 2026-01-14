# Implementation Roadmap

## Overview

This document outlines the implementation phases for Schemock, from MVP to full feature set.

> **Architecture Note**: Schemock uses a **code generation** approach rather than runtime adapter switching.
> The CLI generates adapter-specific code, eliminating the need for compile-time elimination plugins.
> Mock code is simply not generated when targeting production adapters.

## Phase Summary

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Core Schema + Types | ✅ Complete |
| 2 | Mock Data + Persistence | ✅ Complete |
| 3 | Resolvers + Relations | ✅ Complete |
| 4 | Adapters + Middleware | ✅ Complete |
| 5 | OpenAPI Generation | 🟡 Partial (Postman done) |
| 6 | React Bindings | ✅ Complete |
| 7 | CLI + DevTools | ✅ Complete |
| 8 | Documentation + Examples | 🟡 Partial |
| Future | Advanced Caching | 📋 Planned |

---

## Phase 1: Core Schema DSL

### Goals
- Define the schema DSL API
- Implement field type builders
- Implement type inference

### Deliverables
- `@schemock/schema` package
- Field types: string, number, boolean, date, enum, array, object
- Faker integration for field types
- TypeScript type inference from schema

### Tasks
- [ ] Design field builder API
- [ ] Implement `defineData()` function
- [ ] Implement `field.*` builders
- [ ] Implement type inference
- [ ] Write unit tests
- [ ] Write initial documentation

### Dependencies
- None (foundational)

---

## Phase 2: Mock Data Generation + Persistence

### Goals
- Generate mock data from schema
- In-memory persistence via @mswjs/data
- CRUD operations

### Deliverables
- Schema → @mswjs/data factory generator
- Seeding utilities
- Basic CRUD operations

### Tasks
- [ ] Implement schema registry
- [ ] Generate @mswjs/data factory from schema
- [ ] Implement `seed()` function
- [ ] Implement `reset()` function
- [ ] Test CRUD persistence
- [ ] Write documentation

### Dependencies
- Phase 1 (Schema DSL)
- @mswjs/data
- @faker-js/faker

---

## Phase 3: Resolvers + Relations

### Goals
- Relationship support (hasOne, hasMany, belongsTo)
- Computed fields
- Views/aggregations

### Deliverables
- Relation resolver
- Computed field resolver
- View resolver
- Query options (include, where, orderBy)

### Tasks
- [ ] Implement relation definitions
- [ ] Implement relation resolver
- [ ] Implement computed field resolver
- [ ] Implement view definitions
- [ ] Implement view resolver
- [ ] Handle circular references
- [ ] Performance optimization
- [ ] Write tests

### Dependencies
- Phase 2 (Persistence)

---

## Phase 4: Adapters + Middleware

### Goals
- Pluggable backend adapters
- Middleware system
- Production runtime

### Deliverables
- Adapter interface
- Fetch adapter
- Supabase adapter
- Firebase adapter
- GraphQL adapter
- Auth middleware
- Retry middleware
- Cache middleware
- Logger middleware
- Middleware chain executor

### Tasks
- [ ] Design adapter interface
- [ ] Implement fetch adapter
- [ ] Implement Supabase adapter
- [ ] Implement Firebase adapter
- [ ] Implement GraphQL adapter
- [ ] Design middleware interface
- [ ] Implement middleware chain
- [ ] Implement auth middleware
- [ ] Implement retry middleware
- [ ] Implement cache middleware
- [ ] Implement logger middleware
- [ ] Write tests

### Dependencies
- Phase 3 (Resolvers)

---

## Phase 5: OpenAPI Generation

### Goals
- Generate OpenAPI spec from schema
- Generate Postman collection
- CLI command

### Deliverables
- OpenAPI 3.0 generator
- Postman collection generator
- CLI `generate:openapi` command
- CLI `generate:postman` command

### Tasks
- [ ] Implement schema → OpenAPI mapping
- [ ] Generate response/create/update schemas
- [ ] Generate paths for CRUD
- [ ] Generate paths for views
- [ ] Implement Postman generator
- [ ] Add CLI commands
- [ ] Write tests

### Dependencies
- Phase 1 (Schema DSL)

---

## ~~Phase 6: Compile-Time Elimination~~ (REMOVED)

> **This phase has been removed.** The code generation architecture eliminates the need for
> compile-time elimination. When you run `schemock generate --adapter supabase`, the generated
> code contains no mock dependencies (faker, @mswjs/data, etc.). The "99.3% bundle reduction"
> is achieved by simply not generating mock code for production adapters.

---

## Phase 6: React Bindings

### Goals
- React hooks for data fetching
- Provider component
- DevTools panel

### Deliverables
- `useData` hook
- `useMutate` hook
- `useView` hook
- `DataLayerProvider` component
- DevTools panel (development only)

### Tasks
- [ ] Implement `useData` hook
- [ ] Implement `useMutate` hook
- [ ] Implement `useView` hook
- [ ] Implement provider component
- [ ] Implement devtools panel
- [ ] Write tests
- [ ] Write documentation

### Dependencies
- Phase 4 (Adapters)
- @tanstack/react-query

---

## Phase 7: CLI + DevTools

### Goals
- CLI for code generation
- Development tools

### Deliverables
- `schemock generate` command
- `schemock generate:openapi` command
- `schemock generate:postman` command
- Browser devtools extension (stretch)

### Tasks
- [ ] Implement CLI framework
- [ ] Implement generate command
- [ ] Implement generate:openapi command
- [ ] Implement generate:postman command
- [ ] (Stretch) Browser extension

### Dependencies
- Phase 5 (OpenAPI Generation)

---

## Phase 8: Documentation + Examples

### Goals
- Comprehensive documentation
- Example projects
- Getting started guide

### Deliverables
- Documentation website
- Getting started guide
- API reference
- Example: Basic React app
- Example: Next.js app
- Example: Supabase integration
- Example: Firebase integration

### Tasks
- [ ] Write getting started guide
- [ ] Write API reference
- [ ] Create basic React example
- [ ] Create Next.js example
- [ ] Create Supabase example
- [ ] Create Firebase example
- [ ] Set up documentation website

### Dependencies
- All previous phases

---

## MVP Definition

**Minimum Viable Product (Phases 1-3):** ✅ ACHIEVED

- Schema DSL with field types
- Mock data generation
- In-memory persistence
- Basic relationships
- React hooks (useData, useMutate)

**MVP was delivered with:**
- Multiple adapters (mock, fetch, supabase, firebase, pglite)
- Full middleware system
- CLI code generation
- Basic documentation

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| @mswjs/data limitations | High | Fork if needed, contribute upstream |
| Bundle size concerns | Medium | Aggressive tree-shaking, lazy loading |
| TypeScript inference complexity | Medium | Start simple, iterate |
| Build tool compatibility | Medium | Test early with multiple bundlers |

---

## Success Criteria

### MVP Success ✅
- [x] Schema defines types + mocks
- [x] CRUD operations work with persistence
- [x] Basic relations resolve correctly
- [x] React hooks work in dev mode

### v1.0 Success
- [x] All adapters functional (mock, fetch, supabase, firebase, pglite)
- [x] Middleware system working
- [ ] OpenAPI generation accurate
- [x] Production builds exclude mock code (via code generation)
- [x] Minimal production bundle (generated code only)
- [ ] Documentation complete
- [ ] 3+ example projects

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | @mswjs/data | Modern, maintained, good DX |
| Network mocking | MSW | Industry standard |
| Fake data | faker.js | Most comprehensive |
| React integration | TanStack Query | Best data fetching library |
| Code generation | CLI + templates | Simple, no build plugin needed |
| TypeScript | Yes | Type safety is core value prop |
| Build system | tsup | Fast, zero-config bundling |

---

## Team Requirements

| Role | Allocation | Focus |
|------|------------|-------|
| Lead Developer | 100% | Architecture, core implementation |
| TypeScript Expert | 50% | Type inference, generics |
| DevTools Developer | 25% | CLI, browser extension |
| Technical Writer | 25% | Documentation, examples |

---

## Release Plan

| Version | Contents | Status |
|---------|----------|--------|
| 0.0.4-alpha | Schema + Mocks + Adapters + CLI | ✅ Current |
| 0.1.0 | + OpenAPI generation + More examples | 🔜 Next |
| 1.0.0 | Full documentation + Stable API | Planned |

---

## Future: Advanced Caching

### Goals
- Distributed/persistent cache backends
- Smarter eviction strategies
- Pattern-based cache invalidation
- Client-side persistent storage

### Deliverables
- Redis cache storage implementation
- LRU eviction (replace current FIFO)
- Pattern-based invalidation (`user:*`, `findMany:*`)
- Stale-while-revalidate support
- localStorage/IndexedDB storage for client-side
- Cache warming utilities

### Tasks
- [ ] Implement `RedisCacheStorage` class
- [ ] Replace FIFO eviction with LRU in `MemoryCacheStorage`
- [ ] Add `invalidatePattern(pattern: string)` to `CacheStorage` interface
- [ ] Implement stale-while-revalidate (serve stale, refresh in background)
- [ ] Implement `LocalStorageCacheStorage` for browsers
- [ ] Implement `IndexedDBCacheStorage` for larger client-side caching
- [ ] Add cache warming/preload utilities
- [ ] Add cache statistics/metrics (hit rate, size, evictions)
- [ ] Write tests
- [ ] Write documentation

### Current Limitations (to address)
| Issue | Current Behavior | Target Behavior |
|-------|------------------|-----------------|
| Eviction strategy | FIFO (oldest insert) | LRU (least recently used) |
| Pattern invalidation | Exact key only | Glob patterns (`user:*`) |
| Stale handling | Hard TTL expiration | Stale-while-revalidate option |
| Distributed cache | None (in-memory only) | Redis, Memcached support |
| Client persistence | None (memory only) | localStorage, IndexedDB |

### Dependencies
- Phase 4 (Adapters + Middleware) - ✅ Complete
- External: `ioredis` or `redis` package for Redis support

### Priority
- **Medium** - Current in-memory cache works for most use cases
- Consider for v1.1+ or when users request distributed caching

---

## Next Steps

1. **Validate approach** - Build proof-of-concept with 1 entity
2. **Set up monorepo** - Package structure, build system
3. **Implement Phase 1** - Schema DSL
4. **Gather feedback** - Share with potential users
5. **Iterate** - Adjust based on feedback
