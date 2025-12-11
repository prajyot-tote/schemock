# Session: schemock

**Started**: 2025-12-10_17:05
**Last Updated**: 2025-12-11T03:00:00.000Z

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
