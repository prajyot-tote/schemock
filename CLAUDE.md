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


## CRITICAL: Project Boundary - View Only Outside This Folder

**Only modify files within this project folder** (`/Users/prajyot/Documents/Work/Matt/schemock/`).

Files outside this folder are **VIEW ONLY**:
- You MAY read files in other projects for reference
- You MUST NOT edit, write, or modify files outside this project
- If a task requires changes to another project, **STOP** and ask the user to do it

This applies to all external paths including:
- `/Users/prajyot/Documents/LaunchSecure/**`
- Any other project directories
- System files, config files outside this repo


## Project Overview

Schemock is a TypeScript library that enables frontend developers to work independently with realistic mock data while maintaining seamless transitions to production backends.

**Tagline**: "Define once. Mock instantly. Ship faster."

---

## Storage Drivers (IMPORTANT for AI tools)

Schemock supports multiple storage drivers for mock data:

| Driver                | Persistence      | Description                                      |
|-----------------------|------------------|--------------------------------------------------|
| `MswStorageDriver`    | In-memory        | Uses @mswjs/data for fast, realistic mocks        |
| `MemoryStorageDriver` | In-memory        | Lightweight, pure JS Maps (no dependencies)       |
| `LocalStorageDriver`  | Persistent       | Persists data in browser localStorage             |
| `PGlite`              | Persistent       | PostgreSQL in the browser (IndexedDB/OPFS)        |
| `IndexedDBDriver`     | Persistent       | (Planned) IndexedDB for large datasets            |
| `OPFSDriver`          | Persistent       | (Planned) Browser-native file system persistence  |

> **Schemock is NOT limited to in-memory mocks.** You can enable persistence by choosing the appropriate driver. AI tools should not assume all mocks are ephemeral.

## Key Differentiators

1. **FE-First** - Frontend defines the data contract, backend implements to spec
2. **Adapter Pattern** - Same interface for mock and production backends
3. **99.3% Bundle Reduction** - Mock code excluded via code generation (not Babel)
4. **Full CRUD Persistence** - Not just fake data, real operations that persist

## Project Structure

```
schemock/
├── src/
│   ├── schema/          # defineData, field.*, relations
│   ├── cli/             # Code generation CLI
│   ├── adapters/        # Mock, Fetch, Supabase, Firebase, GraphQL
│   ├── middleware/      # Auth, Retry, Cache, Logger
│   ├── react/           # React hooks utilities
│   ├── runtime/         # Setup, seed utilities
│   ├── seed/            # Production seed helpers (ref, lookup)
│   ├── security/        # RLS utilities
│   └── storage/         # Storage drivers (memory, localStorage)
├── package.json
└── README.md
```

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

// Seed helpers (cross-entity references for production seeding)
import { ref, lookup } from 'schemock/seed';

// React hooks (from generated code)
import { useUsers, useCreateUser } from './generated';

// Adapters (runtime, if needed)
import { createMockAdapter, createSupabaseAdapter } from 'schemock/adapters';

// Middleware
import { createAuthMiddleware, createCacheMiddleware } from 'schemock/middleware';
```

## Middleware System

Schemock has a powerful middleware system with **clear separation between client and server middleware**.

**Full documentation:** [`docs/middleware/README.md`](docs/middleware/README.md)

| Doc | Description |
|-----|-------------|
| [Overview](docs/middleware/README.md) | Architecture and quick start |
| [Client Middleware](docs/middleware/client-middleware.md) | Browser-side interceptors |
| [Server Middleware](docs/middleware/server-middleware.md) | Server-side request handling |
| [Custom Middleware](docs/middleware/custom-middleware.md) | Writing your own middleware |
| [Built-in Reference](docs/middleware/built-in-middleware.md) | All built-in options |
| [Examples](docs/middleware/examples.md) | Common patterns and recipes |

### Quick Config Example

```typescript
// schemock.config.ts
export default defineConfig({
  frontend: {
    middleware: {
      // Client-side: inject token
      auth: { tokenStorage: 'localStorage', tokenKey: 'authToken' },
      retry: { maxRetries: 3 },
      custom: ['./src/middleware/client/analytics.ts'],
    },
  },
  backend: {
    middleware: {
      // Server-side: verify token, apply RLS
      auth: { provider: 'jwt', required: true },
      rateLimit: { max: 100, windowMs: 60000 },
      rls: true,
      custom: ['./src/middleware/server/tenant.ts'],
    },
  },
});
```

### Custom Middleware APIs

```typescript
// Client middleware (browser)
import { defineClientMiddleware } from 'schemock/schema';

export const analyticsMiddleware = defineClientMiddleware('analytics', {
  before: async ({ request }) => { /* track request */ },
  after: async ({ response }) => { /* track response */ },
});

// Server middleware (Node.js/Edge)
import { defineServerMiddleware, field } from 'schemock/schema';

export const tenantMiddleware = defineServerMiddleware('tenant', {
  config: {
    headerName: field.string().default('X-Tenant-ID'),
  },
  handler: async ({ ctx, config, next }) => {
    ctx.context.tenantId = ctx.headers[config.headerName.toLowerCase()];
    return next();
  },
});
```

## CLI Usage

```bash
# Generate framework-agnostic code (types + client only)
npx schemock generate

# Generate with React Query hooks and SchemockProvider
npx schemock generate --framework react

# Generate Supabase adapter code (production)
npx schemock generate --adapter supabase

# Generate for multiple targets
npx schemock generate  # uses schemock.config.ts targets
```

### Framework Option

| Flag | Output |
|------|--------|
| `--framework none` (default) | `types.ts`, `client.ts`, `db.ts`, `seed.ts` |
| `--framework react` | Above + `hooks.ts`, `provider.tsx` |

Use `--framework react` for React/Next.js projects. Omit for Angular, Vue, Svelte, or vanilla JS.

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


## CRITICAL: Testing New Features (AI Agents)

When implementing new features or modules, you MUST follow this testing checklist:

### 1. Write Tests for New Code
- **Do NOT just run existing tests** - add new test cases for your new code
- Create test files for new modules (e.g., `src/schema/define-client-middleware.test.ts`)
- Test all new parameters, options, and edge cases
- Test error conditions and validation

### 2. Update Existing Tests
- If modifying existing modules, update their test files
- Add test cases for new parameters/options added to existing functions
- Ensure backwards compatibility is tested

### 3. Verification Checklist (REQUIRED)
Before considering a feature complete, run ALL of these:

```bash
# 1. TypeScript compilation check
npm run typecheck

# 2. Build verification
npm run build

# 3. Run ALL tests (not just new ones)
npm run test

# 4. Verify exports work correctly
# Check dist/*.d.ts files include new exports
```

### 4. What to Test

| New Code | Required Tests |
|----------|----------------|
| New function | Unit tests for all parameters, return values, error cases |
| New type/interface | Type inference tests (if applicable) |
| New module file | Export tests, integration with existing code |
| New CLI option | CLI argument parsing, generated output verification |
| Bug fix | Regression test that fails without fix, passes with fix |

### Example: Adding a New API Function

```typescript
// ❌ WRONG - Just ran existing tests
npm run test  // "All tests pass!" but new code is untested

// ✅ CORRECT - Added tests for new code
// 1. Create test file: src/schema/my-new-feature.test.ts
// 2. Write tests covering:
//    - Happy path
//    - All parameter variations
//    - Error conditions
//    - Edge cases
// 3. Run: npm run test
// 4. Run: npm run typecheck
// 5. Run: npm run build
```

### If Tests Don't Exist

If the module you're modifying has no existing tests:
1. **Create the test file** following the pattern of similar modules
2. Add tests for your changes
3. Optionally add tests for existing functionality (time permitting)

**Never skip testing just because a module lacks tests.**

## Commands

```bash
npm run build      # Build with tsup
npm run dev        # Watch mode
npm run test       # Run tests
npm run typecheck  # TypeScript check
```

<!-- SCHEMOCK:START - AI instructions for Schemock. Do not remove this marker -->

## Schemock - AI Instructions

This project uses [Schemock](https://github.com/prajyot-tote/schemock) for schema-first code generation.

---

## ⛔ CRITICAL: Generated Files - NEVER MODIFY

### AI Agents: READ THIS FIRST

**The following directories contain AUTO-GENERATED code. DO NOT EDIT these files under any circumstances.**

Any modifications will:
1. Be overwritten on next `npx schemock generate`
2. Break production migration paths
3. Cause inconsistencies between mock and production adapters

### Protected Directories (DO NOT TOUCH)

```
./src/generated/           ← NEVER MODIFY
./src/generated/**/*       ← NEVER MODIFY
./src/generated/api/       ← NEVER MODIFY
./src/generated/node/      ← NEVER MODIFY
./src/generated/supabase/  ← NEVER MODIFY
./src/generated/pglite/    ← NEVER MODIFY
./src/generated/mock/      ← NEVER MODIFY
./src/generated/firebase/  ← NEVER MODIFY
./generated/               ← NEVER MODIFY (alternate location)
```

### Protected File Patterns

These files are auto-generated - **NEVER edit them**:

| File | Purpose | Action if bug found |
|------|---------|---------------------|
| `types.ts` | TypeScript types | Report issue |
| `client.ts` | API client | Report issue |
| `db.ts` | Database factory | Report issue |
| `handlers.ts` | MSW handlers | Report issue |
| `hooks.ts` | React Query hooks | Report issue |
| `seed.ts` | Seed utilities | Report issue |
| `routes.ts` | Route definitions | Report issue |
| `index.ts` (in generated/) | Barrel exports | Report issue |

### If You Find a Bug in Generated Code

**DO NOT** fix it by editing the generated file. Instead:

1. **Report the issue**: https://github.com/prajyot-tote/schemock/issues
2. **Describe the problem**: Include the schema definition and expected vs actual output
3. **Wait for fix**: The fix must be made in the generator, not the output

### Why This Matters

Generated code is designed to work seamlessly across:
- Mock adapter (development)
- Supabase adapter (production)
- Firebase adapter (production)
- Fetch adapter (production)

Editing generated files breaks this contract and causes production failures.

---

## ✅ How to Make Changes

To modify generated types, hooks, or clients:

1. **Edit schema files** in `./src/schemas/`
2. **Run generation**: `npx schemock generate`
3. **Import from generated directory**

---

## Client Interceptor Pattern (Mock, PGlite & Supabase)

All three adapters (**Mock**, **PGlite**, and **Supabase**) use a production-ready interceptor pattern for centralized auth and error handling. This provides a consistent API across development and production.

### Usage with React Hooks (Recommended - Mock only)

Use `SchemockProvider` to inject a configured client into all generated hooks:

```tsx
import { SchemockProvider, createClient, useUsers } from './generated';

// 1. Create configured client at app startup
const api = createClient({
  onRequest: (ctx) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      ctx.headers.Authorization = `Bearer ${token}`;
    }
    return ctx;
  },
  onError: (error) => {
    if (error.status === 401) {
      window.location.href = '/login';
    }
  }
});

// 2. Wrap your app with SchemockProvider
function App() {
  return (
    <SchemockProvider client={api}>
      <MyComponent />
    </SchemockProvider>
  );
}

// 3. Hooks automatically use the configured client
function MyComponent() {
  const { data } = useUsers(); // Auth headers included automatically
  return <div>{data?.data.map(u => u.name)}</div>;
}
```

### Direct API Usage (Mock, PGlite & Supabase)

Works identically for mock, PGlite, and Supabase clients:

```typescript
// For mock:
import { createClient } from './generated/mock/client';
// For PGlite (PostgreSQL in the browser):
import { createClient } from './generated/pglite/client';
// For Supabase:
import { createClient } from './generated/supabase/client';

const api = createClient({
  onRequest: (ctx) => {
    ctx.headers.Authorization = `Bearer ${getToken()}`;
    return ctx;
  },
  onError: (error) => {
    if (error.status === 401) window.location.href = '/login';
    if (error.status === 403) toast.error('Access denied');
    if (error.status === 409) toast.error('Duplicate entry');
  }
});

// Use anywhere - auth is automatic
const posts = await api.post.list();
```

### Exported Types (Public API)

| Export | Mock | PGlite | Supabase | Purpose |
|--------|------|--------|----------|---------|
| `createClient(config?)` | ✅ | ✅ | ✅ | Factory to create configured client |
| `ClientConfig` | ✅ | ✅ | ✅ | Type for interceptor configuration |
| `RequestContext` | ✅ | ✅ | ✅ | Type for onRequest hook |
| `ApiError` | ✅ | ✅ | ✅ | Error class with status codes |
| `ApiClient` | ✅ | ✅ | ✅ | Type interface for the API client |
| `api` | ✅ | ✅ | ✅ | Default client (no config) |
| `supabase` | ❌ | ❌ | ✅ | Raw Supabase client instance |
| `SchemockProvider` | ✅ | ❌ | ❌ | React provider for hooks |
| `useSchemockClient()` | ✅ | ❌ | ❌ | Hook to access client from context |

### PostgreSQL Error Code Mapping (PGlite & Supabase)

Both PGlite and Supabase clients map PostgreSQL error codes to HTTP status codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `23505` | 409 | Unique constraint violation |
| `23503` | 400 | Foreign key violation |
| `23502` | 400 | Not null violation |
| `23514` | 400 | Check constraint violation |
| `42501` | 403 | RLS policy violation |
| `42P01` | 404 | Undefined table |
| `42703` | 400 | Undefined column |
| `22P02` | 400 | Invalid text representation |

### Supabase-specific Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `PGRST116` | 404 | Row not found |
| `PGRST302` | 401 | JWT expired |
| `PGRST303` | 401 | Invalid JWT |

### Internal Types (Not Exported - Mock & PGlite)

These simulate backend behavior and are **not** part of the public API:
- `RLSContext` - Internal RLS context type
- `decodeJwtPayload()` - JWT decoding
- `extractContextFromHeaders()` - Context extraction from headers
- `rlsEntitySelect/Insert/Update/Delete` - RLS filter functions
- `setContext()` - (PGlite) Sets PostgreSQL session variables
- `withContext()` - (PGlite) Executes function within transaction with context

---

## API Layers: db vs api (IMPORTANT)

Schemock generates two distinct layers with different purposes:

| Layer | Purpose | Adapter-Consistent? | Use In |
|-------|---------|---------------------|--------|
| `api.*` | **Public client API** | ✅ Yes - identical across all adapters | UI components, frontend code |
| `db.*` | **Internal database layer** | ❌ No - varies by adapter | Endpoint resolvers, seeding, tests |

### ⚠️ Do NOT use `db.*` in UI Code

The `db` layer has different APIs depending on the adapter:
- **Mock**: `db.user.create()`, `db.user.getAll()` (ORM-like via @mswjs/data)
- **PGlite**: `db.query('SELECT * FROM users')` (raw SQL)
- **Supabase**: Not generated (uses Supabase client directly)

If you use `db.*` in your UI code, you'll need to refactor when switching adapters.

### ✅ Always use `api.*` in UI Code

The `api` client is consistent across ALL adapters:

```typescript
// Works identically with Mock, PGlite, Supabase, Firebase, Fetch
import { api } from './generated';
// OR
import { createClient } from './generated/mock/client';
import { createClient } from './generated/pglite/client';
import { createClient } from './generated/supabase/client';

const api = createClient();

// Same API everywhere
await api.user.list();
await api.user.get(id);
await api.user.create({ name: 'John', email: 'john@example.com' });
await api.user.update(id, { name: 'John Doe' });
await api.user.delete(id);
```

### When to Use Each Layer

| Use Case | Use This |
|----------|----------|
| React components | `api.*` or hooks (`useUsers()`) |
| Vue/Svelte/Angular components | `api.*` |
| Custom endpoint `mockResolver` | `db.*` (resolver receives `db`) |
| Seed scripts | `db.*` or `seed()` utility |
| Unit tests (direct data setup) | `db.*` |

For detailed migration instructions, see [docs/migration-db-to-api.md](docs/migration-db-to-api.md).

---

## Production Seed with Kill Switch

Schemock supports one-time production seeding with secret validation and a kill switch to prevent re-seeding. This is useful for seeding default data like super admin users or default products.

### 1. Create Seed Data File

```typescript
// src/seed-data.ts
import { ref, lookup } from 'schemock/seed';

export const seedConfig = {
  secret: 'my-production-secret-123',
  data: {
    users: [
      { name: 'Super Admin', email: 'admin@example.com', role: 'admin' },
      { name: 'Default Editor', email: 'editor@example.com', role: 'user' },
    ],
    posts: [
      {
        title: 'Welcome Post',
        content: 'Hello world!',
        authorId: ref('users', 0),  // References first user's ID
        published: true,
      },
    ],
  },
};
```

### 2. Run Production Seed

```typescript
import { runProductionSeed, isSeeded, resetProductionSeed } from './generated/mock/seed';
// OR for PGlite:
import { runProductionSeed, isSeeded, resetProductionSeed } from './generated/pglite/seed';
import { seedConfig } from './seed-data';

// Run the seed (validates secret, checks kill switch)
const result = await runProductionSeed('my-production-secret-123', seedConfig);

if (result.success) {
  console.log('Seeded at:', result.seededAt);
} else if (result.error === 'ALREADY_SEEDED') {
  console.log('Already seeded at:', result.seededAt);
} else if (result.error === 'INVALID_SECRET') {
  console.error('Invalid secret key');
}
```

### Cross-Entity References (`ref` & `lookup`)

Use `ref()` and `lookup()` from `schemock/seed` to reference records created earlier in the seed, avoiding hardcoded IDs.

- **`ref(entity, index, field?)`** — Reference the N-th created record's field (default: `'id'`)
- **`lookup(entity, where, field?)`** — Find a record matching `where` conditions, extract field (default: `'id'`)

```typescript
import { ref, lookup } from 'schemock/seed';

export const seedConfig = {
  secret: 'my-secret',
  data: {
    users: [
      { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    ],
    permissions: [
      { key: 'projects:read:all', label: 'Read All Projects' },
    ],
    posts: [
      { title: 'Welcome', authorId: ref('users', 0) },
    ],
    rolePermissions: [
      {
        userId: lookup('users', { role: 'admin' }),
        permissionId: lookup('permissions', { key: 'projects:read:all' }),
      },
    ],
  },
};
```

Entities are inserted in dependency order (topologically sorted). Forward references throw descriptive errors. Existing seed data with hardcoded IDs continues to work unchanged.

### Available Functions

| Function | Mock Adapter | PGlite Adapter | Description |
|----------|--------------|----------------|-------------|
| `isSeeded()` | sync | async | Check if already seeded |
| `resetProductionSeed()` | sync | async | Clear kill switch for re-seeding |
| `getSeededAt()` | sync | async | Get timestamp when seeded |
| `runProductionSeed(secret, config)` | async | async | Run seed with validation |

### Seed Helpers (`schemock/seed`)

| Export | Description |
|--------|-------------|
| `ref(entity, index, field?)` | Reference N-th created record (default field: `'id'`) |
| `lookup(entity, where, field?)` | Find record by field match (default field: `'id'`) |
| `isSeedReference(value)` | Check if a value is a seed reference marker |
| `SEED_REF_BRAND` | Brand symbol used for runtime detection |

### Kill Switch Storage

| Adapter | Storage | Key/Table |
|---------|---------|-----------|
| Mock | `localStorage` | `_schemock_seeded` |
| PGlite | SQL table | `_schemock_meta` |

### Config Option

```typescript
// schemock.config.ts
export default defineConfig({
  // ... other config
  productionSeed: {
    dataPath: './src/seed-data.ts',  // Optional, defaults to this path
  },
});
```

---

## Inline Resolver Limitations (AI Agents: Read This)

When implementing custom endpoints with inline `mockResolver` functions:

### Functions That Will NOT Be Copied

1. **Transitive dependencies** - If `funcA()` calls `funcB()`, but only `funcA` is used in the resolver, `funcB` will NOT be copied
2. **Arrow functions without parens** - `const fn = x => x * 2` is NOT detected (use `const fn = (x) => x * 2`)
3. **Functions with complex nested type params** - May have edge cases

### Recommended Pattern

For resolvers with helper functions, always use **named exported functions**:

```typescript
// ✅ GOOD - Named function, all deps available
export async function searchResolver({ params, db }) {
  return processResults(db.user.findMany({ ... }));
}

export const SearchEndpoint = defineEndpoint('/api/search', {
  mockResolver: searchResolver  // Imported, not serialized
});

// ❌ AVOID - Inline with local helpers
function processResults(data) { ... }  // May not be copied!

export const SearchEndpoint = defineEndpoint('/api/search', {
  mockResolver: async ({ params, db }) => {
    return processResults(db.user.findMany({ ... }));  // Risk of missing function
  }
});
```

---

## Schema DSL Quick Reference

```typescript
import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user']).default('user'),
  avatar: field.url().nullable(),
  createdAt: field.date().readOnly(),

  // Relations are defined inline with fields
  posts: hasMany('post', { foreignKey: 'authorId' }),
});

export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  content: field.string(),
  authorId: field.uuid(),  // Foreign key field

  // Relations are defined inline with fields
  author: belongsTo('user', { foreignKey: 'authorId' }),
});
```

### Available Field Types

| Type | Description | Example |
|------|-------------|---------|
| `field.uuid()` | UUID primary key | `id: field.uuid()` |
| `field.string()` | Text string | `name: field.string()` |
| `field.email()` | Email address | `email: field.email()` |
| `field.url()` | URL string | `avatar: field.url()` |
| `field.number()` | Number | `age: field.number()` |
| `field.boolean()` | True/false | `active: field.boolean()` |
| `field.enum([...])` | Enum values | `status: field.enum(['draft', 'published'])` |
| `field.date()` | Date/time | `createdAt: field.date()` |
| `field.ref('entity')` | Semantic foreign key | `authorId: field.ref('user')` |
| `field.json()` | JSON object | `metadata: field.json()` |

### Field Modifiers

- `.nullable()` - Field can be null
- `.default(value)` - Default value
- `.unique()` - Must be unique
- `.index()` - Create database index

### Relations

Relations are defined **inline with field definitions**, not in a separate `relations` option object.

```typescript
import { defineData, field, hasMany, belongsTo, hasOne } from 'schemock/schema';

// One-to-many: User has many Posts
const User = defineData('user', {
  id: field.uuid(),
  posts: hasMany('post', { foreignKey: 'authorId' }),
});

// Many-to-one: Post belongs to User
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),  // Foreign key stored on this entity
  author: belongsTo('user', { foreignKey: 'authorId' }),
});

// One-to-one: User has one Profile
const UserWithProfile = defineData('user', {
  id: field.uuid(),
  profile: hasOne('userProfile', { foreignKey: 'userId' }),
});

// Many-to-many: User has many Followers (through junction table)
const UserWithFollowers = defineData('user', {
  id: field.uuid(),
  followers: hasMany('user', {
    through: 'follow',
    foreignKey: 'followingId',
    otherKey: 'followerId',
  }),
});
```

### Row-Level Security (RLS)

Add `rls` to schema options to enable row-level security:

**Scope-based (simple):**
```typescript
export const postSchema = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  title: field.string(),
}, {
  rls: {
    // field: row column, contextKey: JWT/context key
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    // Bypass for specific roles
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

**Custom filters (advanced):**
```typescript
export const postSchema = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  published: field.boolean(),
}, {
  rls: {
    select: (row, ctx) => row.published || row.authorId === ctx?.userId,
    insert: (row, ctx) => row.authorId === ctx?.userId,
    update: (row, ctx) => row.authorId === ctx?.userId,
    delete: (_row, ctx) => ctx?.role === 'admin',
  },
});
```

**RLS Context** comes from JWT token via `createClient` interceptor:
```typescript
const api = createClient({
  onRequest: (ctx) => {
    ctx.headers.Authorization = `Bearer ${token}`; // JWT with { userId, role }
    return ctx;
  }
});
```

### Common Tasks

| Task | What to do |
|------|------------|
| Add new entity | Create new schema file in `src/schemas/`, run `npx schemock generate` |
| Add field | Edit schema file, run `npx schemock generate` |
| Add relation | Add inline with field definitions, run `npx schemock generate` |
| Change field type | Edit schema file, run `npx schemock generate` |
| Fix generated code bug | **Report issue at GitHub, don't edit generated files** |

### CLI Commands

```bash
# Generate framework-agnostic code (types + client)
npx schemock generate

# Generate with React hooks and provider
npx schemock generate --framework react

# Generate for specific adapter
npx schemock generate --adapter supabase

# Generate SQL migrations
npx schemock generate:sql

# Dry run (show what would be generated)
npx schemock generate --dry-run
```

### Configuration (v1.0)

The new configuration format uses separate `frontend`, `backend`, and `middleware` sections:

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  // Frontend configuration
  frontend: {
    framework: 'react',     // react | vue | svelte | none
    adapter: 'supabase',    // mock | supabase | firebase | fetch | pglite
  },

  // Backend configuration
  backend: {
    framework: 'nextjs',    // node | nextjs | supabase-edge | neon
    output: './src/generated/api',
    database: {
      type: 'supabase',
      connectionEnvVar: 'SUPABASE_URL',
    },
  },

  // Unified middleware - applies to both frontend and backend
  middleware: {
    auth: { provider: 'supabase-auth', required: true },
    validation: true,
    logger: { level: 'info' },
    context: true,
    rls: true,
    // Custom middleware files
    custom: ['./src/middleware/tenant.ts'],
  },
});
```

**Custom Middleware** (using `defineMiddleware`):

```typescript
// src/middleware/tenant.ts
import { defineMiddleware, field } from 'schemock/schema';

export const tenantMiddleware = defineMiddleware('tenant', {
  config: {
    headerName: field.string().default('X-Tenant-ID'),
  },
  handler: async ({ ctx, config, next }) => {
    ctx.context.tenantId = ctx.headers[config.headerName];
    return next();
  },
  order: 'early',
});
```

**Legacy format** (`targets` array) is deprecated but still supported.

---

## Reporting Issues

If you encounter bugs in:
- Generated code → https://github.com/prajyot-tote/schemock/issues
- Schema DSL → https://github.com/prajyot-tote/schemock/issues
- CLI behavior → https://github.com/prajyot-tote/schemock/issues

Include in your report:
1. Schema definition (the `defineData` call)
2. Command used (`npx schemock generate --adapter X`)
3. Expected behavior
4. Actual behavior
5. Generated code snippet (if relevant)

<!-- SCHEMOCK:END -->
