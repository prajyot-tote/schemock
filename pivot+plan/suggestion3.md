# Schemock v2 Plan: Feasibility Assessment (v3)

## 1. Overview: Is This Doable?

**YES, technically feasible with caveats.**

### Logical Reasoning:
- **Proven Patterns**: Plugin-based architectures (Prisma, tRPC, OpenAPI generators) and schema-first codegen are established. The plan leverages these successfully.
- **Code Reuse**: ~50% reuse (DSL, analysis, utils) is realistic based on codebase inspection. Core abstractions are stable.
- **Tooling**: Libraries like ts-morph, zod-to-json-schema are mature and fit the needs.
- **Parallel Approach**: Option C (parallel versions) is pragmatic, reducing risk.
- **Dry Run Insights**: Current CLI works, but ES module handling and generated file interdependencies show areas needing cleanup before plugin migration.

**Caveats**: Current codebase has ES module import issues and tight coupling in generators. Plugin system would need to address these to avoid dead ends.

## 2. Suggestions to Make It Doable / Improvements
- **Fix ES Module Issues First**: Resolve directory imports and module resolution in current system before plugin refactor. Add "type": "module" to package.json or use .mts extensions.
- **Decouple Generators**: Refactor current generators to be more modular and less interdependent (e.g., separate file writing from logic).
- **POC Plugin System**: Build a minimal plugin (e.g., mock client only) using current utils, then migrate others. Validate registry and context interfaces early.
- **Template Engine**: Implement a shared template system (Handlebars/EJS) before plugins to reduce duplication.
- **Dependency Management**: Use npm for plugin discovery; add peerDep validation and auto-installation.
- **Error Handling**: Robust plugin loading with fallbacks; clear error messages for config issues.
- **Testing**: Golden-file tests for each plugin output; integration tests for multi-target scenarios.
- **Alternative Implementation**: If plugin complexity grows, consider a simpler "generator factory" pattern instead of full plugins.

## 3. Open Questions
- How to handle plugin versioning and compatibility with core schema/analysis changes?
- What happens when plugins generate conflicting file paths—override, error, or namespace?
- How to support user-written plugins without exposing internal APIs?
- Performance: Will analysis scale for large schemas across multiple plugins?
- Migration: How to handle custom generators in v1 that don't fit plugin model?
- Security: Sandboxing for third-party plugins (if allowed)?
- Config validation: How to validate plugin-specific configs without loading plugins?

## 4. Alternatives & Related Libraries
- **Full Alternatives**:
  - **Prisma + tRPC + OpenAPI Generator**: Combine for similar multi-target output (DB schema, API routes, client SDKs).
  - **Wasp Framework**: Opinionated full-stack with DSL, but less extensible.
  - **RedwoodJS**: Integrated full-stack, but tied to specific tech stack.
- **Composable Stack**:
  - **Zod + ts-morph + MSW + Supertest**: Build custom codegen without plugins.
  - **TypeGraphQL + Nexus + GraphQL Code Generator**: For GraphQL-focused multi-target.
  - **OpenAPI Spec + OpenAPI Generator + Custom Scripts**: For API-first with multiple clients.
- **Libraries for Pieces**:
  - **ts-morph**: AST manipulation (already planned).
  - **zod-to-json-schema**: Schema conversion.
  - **openapi-typescript**: Client generation from OpenAPI.
  - **Hygen/Plop**: Simpler codegen if plugins are overkill.
  - **@faker-js/faker**: Mock data (already in use).

---

**Final Verdict**: Feasible, but requires addressing current codebase issues first. The plugin system is a good long-term architecture, but start with incremental improvements to avoid dead ends.