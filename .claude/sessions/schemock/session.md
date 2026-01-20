# Session: schemock

**Started**: 2025-12-10_17:05
**Last Updated**: 2025-12-15T19:19:29Z

## Goal
Design and implement **Schemock** - a schema-first mocking library for frontend developers that:
1. Provides placeholders for BE data during FE development
2. Generates fake/mock data automatically in development mode
3. Seamlessly switches to real BE connections in production
4. Enables FE devs to work independently without waiting for BE APIs
5. Achieves 99.3% bundle reduction via compile-time elimination

## Overview
Working on: **Schemock** 🍀 - Schema-first mocking for frontend developers

**Tagline**: "Define once. Mock instantly. Ship faster."

**Current Phase**: Design Complete → Ready for Implementation

## Key Milestones
- [x] Define core architecture and API design (Adapter Pattern)
- [x] Identify key features and constraints
- [x] Evaluate technical feasibility
- [x] Design the toggle mechanism (dev/prod modes)
- [x] Plan mock data generation strategy
- [x] Design full adapter set (Data, Auth, Storage, RPC, Cache, Audit, Security)
- [x] Document security architecture
- [x] Clarify bidirectionality (FE→BE, NOT truly bidirectional)
- [x] Design "Beyond MSW" direct adapter approach
- [x] Move to separate repo (out of claude-plugins marketplace)
- [x] Name the project: **Schemock**
- [ ] Implement Schema DSL (`defineData`, `field.*`)
- [ ] Implement codegen (types + client)
- [ ] Build MockAdapter (Data + Auth)
- [ ] Build React hooks (`useData`, `useMutate`, `useView`)
- [ ] Build additional adapters (Storage, RPC, Cache, Audit)
- [ ] OpenAPI export
- [ ] Compile-time elimination (Babel plugin)

## Project Structure
```
/Users/prajyot/Documents/Work/Matt/schemock/
├── design/              # 10 comprehensive design docs
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
Located in `/design/`:
- `01-vision-and-usp.md` - Market positioning, USPs
- `02-architecture.md` - Adapter pattern, Beyond MSW, PGlite
- `03-schema-dsl.md` - Rich field types, relations, computed fields
- `04-resolver-system.md` - Registry, resolvers, topological sort
- `05-adapters.md` - All backend adapter implementations
- `06-middleware.md` - Middleware chain system
- `07-openapi-generation.md` - Schema → OpenAPI mapping
- `08-compile-elimination.md` - 99.3% bundle reduction
- `09-implementation-roadmap.md` - 14-week phased plan
- `10-security.md` - Security architecture

## Architecture Summary

```
Your Code → Generated API Client → Adapter Interface → [Mock|Supabase|REST|...]
```

### Adapters Required
| Adapter | Purpose |
|---------|---------|
| DataAdapter | CRUD + Realtime + RLS |
| AuthAdapter | Authentication + Sessions |
| StorageAdapter | File uploads |
| RPCAdapter | Server functions |
| CacheAdapter | Performance |
| AuditAdapter | Compliance |
| SecurityAdapter | Validation, AuthZ, Rate limits |

## Configuration
- Auto-capture: enabled

## Session History
- **Session 1** (2025-12-10): Initial concept, market research, composition approach
- **Session 2** (2025-12-11): Adapter pattern, full abstraction, security, documentation
- **Session 3** (2025-12-11): Comparison with existing docs, merge, rename to Schemock, separate repo
- **Session 4** (2026-01-12): Design doc audit, removed Phase 6 (compile-time elimination), documented architecture shift

## Architecture Shift (Session 4)

**Key Discovery**: The design docs describe a RUNTIME architecture, but the actual implementation uses a CODE GENERATION architecture.

### What Design Docs Describe (Outdated)
- Schemas registered at runtime
- Runtime adapter switching via `configureDataLayer()`
- Babel plugin to remove mock code from production
- Middleware chains execute at runtime

### What Was Actually Built (Current Reality)
- Schemas parsed by CLI at generation time
- Different code generated for each adapter (`schemock generate --adapter supabase`)
- No Babel plugin needed - mock code simply not generated for production
- RLS/middleware logic baked into generated code

### Discrepancies in Design Docs

| Document | Issue | Action Needed |
|----------|-------|---------------|
| `01-vision-and-usp.md` | USP 6 mentions "Compile-Time Elimination" via Babel | Update to reflect code generation approach |
| `02-architecture.md` | Was showing Babel transform pipeline | ✅ REWRITTEN |
| `04-resolver-system.md` | Describes runtime registry and resolver | Clarify this is for mock adapter only |
| `05-adapters.md` | Shows `configureDataLayer()` runtime switching | Clarify code generation is primary pattern |
| `08-compile-elimination.md` | Entire document was obsolete | ✅ DELETED |
| `09-implementation-roadmap.md` | Phase 6 (Compile Elimination) | ✅ REMOVED |

### Why This Matters
The code generation approach is **simpler and better**:
1. No complex Babel plugins to maintain
2. No framework-specific plugins (Vite, Webpack, Next.js)
3. Explicit control - user knows what code is generated
4. Works with any bundler out of the box
5. Type-safe generated code with full IntelliSense
