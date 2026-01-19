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

// React hooks (from generated code)
import { useUsers, useCreateUser } from './generated';

// Adapters (runtime, if needed)
import { createMockAdapter, createSupabaseAdapter } from 'schemock/adapters';

// Middleware
import { createAuthMiddleware, createCacheMiddleware } from 'schemock/middleware';
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

## Mock Client - Interceptor Pattern

The generated mock client uses a production-ready interceptor pattern for centralized auth and error handling.

### Usage with React Hooks (Recommended)

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

### Direct API Usage (Without Hooks)

```typescript
import { createClient } from './generated/client';

const api = createClient({
  onRequest: (ctx) => {
    ctx.headers.Authorization = `Bearer ${getToken()}`;
    return ctx;
  },
  onError: (error) => {
    if (error.status === 401) window.location.href = '/login';
    if (error.status === 403) toast.error('Access denied');
  }
});

// Use anywhere - auth is automatic
const posts = await api.post.list();
```

### Exported Types (Public API)

| Export | Purpose |
|--------|---------|
| `createClient(config?)` | Factory to create configured client |
| `SchemockProvider` | React provider for client injection into hooks |
| `useSchemockClient()` | Hook to access configured client from context |
| `ClientConfig` | Type for interceptor configuration |
| `RequestContext` | Type for onRequest hook |
| `ApiError` | Error class with status codes |
| `api` | Default client (no config) |

### Internal Types (Not Exported - Mock Only)

These simulate backend behavior and are **not** part of the public API:
- `RLSContext` - Internal RLS simulation
- `decodeJwtPayload()` - JWT decoding
- `extractContextFromHeaders()` - Context extraction
- `rlsEntitySelect/Insert/Update/Delete` - RLS filters

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
