# Schemock v2 Plan: Feasibility & Critique

## 1) Doable? (Yes/No + Reasoning)
Yes—technically feasible. The plugin-based, schema-first, multi-target codegen model mirrors proven patterns (e.g., Prisma generators, tRPC routers, OpenAPI codegen). Core DSL and analysis reuse lowers risk. The main risks are scope creep, plugin surface explosion, and config complexity, not fundamental impossibility.

## 2) Suggestions to Make It Doable
- Land a minimal POC: one end-to-end plugin (e.g., mock → client + handlers) using the new registry to validate the API before broad migration.
- Nail boundaries: keep core (DSL, analysis, shared utils) independent; forbid plugin-specific logic leaking into core.
- Contract-first plugin API: versioned plugin interface with capability flags; add schema validation for config early.
- Test harness for plugins: golden-file snapshots per schema scenario; contract tests for outputs and peerDeps.
- Conflict policy: deterministic file output rules (namespacing, per-target output roots) and collision detection.
- Perf hygiene: cache analysis; parallelize generation per target; add a dry-run mode with diff output.
- Migration path: shims for v1 configs; adapters to wrap old generators as plugins; deprecation schedule.
- Dependency management: auto-check/install peerDeps or emit actionable guidance.

## 3) Open Questions
- Plugin discovery/loading: npm-installed vs. local path vs. remote; security and sandboxing?
- How to handle breaking changes in plugin API and core types (semver, compatibility matrix)?
- Strategy for user-written custom generators—supported as first-class plugins with typed SDK?
- File collision rules across multiple targets; what if two plugins emit same path?
- Schema evolution and DB migrations across targets—who owns migration ordering and rollback?
- Auth/RLS abstractions: how to express provider-agnostic policies so plugins implement consistently?

## 4) Alternatives / Similar Stacks
- Prisma (DB schema → client/migrations; not multi-backend route codegen).
- tRPC (type-safe RPC without codegen; could pair with custom codegen for routes/clients).
- OpenAPI Generator or orval (OpenAPI/Swagger → clients/servers; could layer on zod-to-openapi + openapi-typescript).
- Wasp (full-stack codegen with a DSL; opinionated but adjacent).
- Blitz/Redwood (integrated full-stack frameworks; less pluggable but similar goals).
- DIY stack: Zod + ts-morph + a template engine (Handlebars/EJS) + MSW for mocks + zod-to-json-schema + openapi-typescript.
