# Schemock v2 Plan Review — Feasibility Assessment

## 1) Overview — Doable or Not
**Answer: Yes, technically feasible, but not as scoped/timed.**

**Reasoning (short):**
- The current codebase already has multi-target generation, schema analysis, and adapter generators. This is a solid base for a plugin system, so the architecture is feasible.
- The plan mixes “SQL is canonical” with ORM adapters and multiple backend frameworks. That is achievable, but the integration complexity and testing surface are much larger than the schedule suggests.
- “Production-ready” across Express/Fastify/tRPC/GraphQL plus RLS, auth, validation, and DB abstraction is a large product surface; without narrowing scope, the risk of incomplete or brittle outputs is high.

## 2) Suggestions to Make It Doable
- **Narrow the first milestone**: ship a v2 core with only **mock + one backend** (e.g., Express + Postgres) and one DB path. Add others later.
- **Separate concerns**: keep **SQL generation** as core, and treat ORM adapters as optional plugins that *derive* from the SQL model instead of being first-class at launch.
- **Define the plugin boundary early**: split into core (schema/analysis/IR) and plugin runners, with strict versioning and compatibility rules.
- **Stabilize a canonical IR**: introduce a middle-layer IR that is stable and explicitly versioned so plugins can remain compatible as schema features evolve.
- **Treat RLS as two layers**:
  - DB-level RLS (Postgres/Supabase) generated SQL
  - App-level enforcement (Express/Fastify/tRPC) generated filters
- **Delay GraphQL** unless there’s a validated use case. It is a major complexity multiplier.
- **Add a plugin test harness**: snapshot tests + integration tests per plugin target to avoid regressions.
- **Make the configuration incremental**: support v1 config with a “compat layer” that compiles into v2 config for a smoother transition.

## 3) Open Questions
- What is the **canonical IR**? Does it include RLS, auth, validation, and middleware semantics, or only data models + endpoints?
- How will **plugin discovery and trust** work? (npm/local plugins are security-sensitive.)
- Which **DBs** are first-class? Postgres only initially, or do you need cross-dialect support from day one?
- How does **endpoint definition** map to tRPC/GraphQL conventions? Will endpoints remain REST-oriented?
- How will **auth contexts** be represented consistently across frameworks?
- What is the **migration story** for existing users with v1 configs and generated outputs?
- How do you ensure **runtime correctness** for edge runtimes (Next.js Edge, Supabase Edge) where libraries differ?

## 4) Alternatives (Libraries / Combinations)
- **Prisma + Zod + OpenAPI**: Prisma as data model; Zod schemas for validation; OpenAPI generation with `zod-to-openapi` + `openapi-typescript` for clients.
- **tRPC + Zod + Prisma/Drizzle**: schema-driven, type-safe client/server without codegen for REST.
- **GraphQL Code Generator**: if GraphQL is primary, it already handles client/server types and schema-driven tooling.
- **Supabase + Supabase CLI**: if Supabase is the primary deployment, lean into its native tooling instead of building multi-backend generation.
- **Hono + Zod + OpenAPI**: minimal runtime with strong schema-to-OpenAPI flow.
- **NestJS + Swagger**: opinionated backend scaffolding with OpenAPI-based client generation.

---

### Bottom line
The plan is **technically feasible**, but the current scope, timeline, and breadth of targets are **over-ambitious**. It is doable only if the first release is narrowed to a single backend target and a single database path, with a stable IR and a strict plugin boundary.
