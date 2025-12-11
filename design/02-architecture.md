# Core Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MOCKDATA ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                           USER'S CODE                                 │ │
│  │                                                                       │ │
│  │   import { defineData, field } from '@schemock/schema';               │ │
│  │                                                                       │ │
│  │   const User = defineData('user', {                                   │ │
│  │     id: field.uuid(),                                                 │ │
│  │     name: field.person.fullName(),                                    │ │
│  │   });                                                                 │ │
│  │                                                                       │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│                                  ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         GENERATOR (CLI/Build)                         │ │
│  │                                                                       │ │
│  │   npx schemock generate                                               │ │
│  │                                                                       │ │
│  │   Reads schema → Outputs:                                             │ │
│  │   ├── types.ts        (TypeScript interfaces)                         │ │
│  │   ├── db.ts           (@mswjs/data factory)                           │ │
│  │   ├── handlers.ts     (MSW request handlers)                          │ │
│  │   ├── hooks.ts        (React Query hooks)                             │ │
│  │   ├── openapi.yaml    (OpenAPI 3.0 spec)                              │ │
│  │   └── postman.json    (Postman collection)                            │ │
│  │                                                                       │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                     │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│       ┌────────────┐      ┌────────────┐      ┌────────────┐              │
│       │ @mswjs/data│      │    MSW     │      │  faker.js  │              │
│       │            │      │            │      │            │              │
│       │ Persistence│      │ Intercept  │      │ Generate   │              │
│       └────────────┘      └────────────┘      └────────────┘              │
│              │                   │                   │                      │
│              └───────────────────┼───────────────────┘                     │
│                                  │                                          │
│                                  ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         DEVELOPMENT MODE                              │ │
│  │                                                                       │ │
│  │   fetch('/api/users')                                                 │ │
│  │         │                                                             │ │
│  │         ▼                                                             │ │
│  │   MSW intercepts → @mswjs/data returns → faker.js generated           │ │
│  │                                                                       │ │
│  │   Full CRUD, persistence, relationships - NO BACKEND NEEDED           │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                  │                                          │
│                                  │ Babel Transform (Production Build)       │
│                                  ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         PRODUCTION MODE                               │ │
│  │                                                                       │ │
│  │   fetch('/api/users')                                                 │ │
│  │         │                                                             │ │
│  │         ▼                                                             │ │
│  │   Middleware Chain → Adapter → Real Backend                           │ │
│  │                                                                       │ │
│  │   NO MSW, NO @mswjs/data, NO faker.js in bundle                       │ │
│  │   (Compile-time eliminated by Babel plugin)                           │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
@schemock/
├── schema/                  # FE-first schema DSL
│   ├── index.ts            # Public exports
│   ├── define-data.ts      # defineData() function
│   ├── define-view.ts      # defineView() function
│   ├── define-endpoint.ts  # defineEndpoint() function
│   ├── field.ts            # Field type builders
│   └── relations.ts        # hasOne, hasMany, belongsTo
│
├── runtime/                # Development runtime
│   ├── resolver/           # Data resolution layer
│   │   ├── index.ts       # Main resolver engine
│   │   ├── registry.ts    # Schema metadata registry
│   │   ├── relation.ts    # Relation resolution
│   │   ├── computed.ts    # Computed field resolution
│   │   └── view.ts        # View/aggregation resolution
│   ├── db.ts              # @mswjs/data wrapper
│   ├── handlers.ts        # MSW handler generator
│   ├── setup.ts           # Dev mode initialization
│   ├── seed.ts            # Data seeding utilities
│   └── prod.ts            # Production-only runtime
│
├── adapters/              # Backend adapters
│   ├── types.ts           # Adapter interface
│   ├── fetch.ts           # Default fetch adapter
│   ├── supabase.ts        # Supabase adapter
│   ├── firebase.ts        # Firebase/Firestore adapter
│   ├── graphql.ts         # GraphQL/Apollo adapter
│   └── axios.ts           # Axios adapter
│
├── middleware/            # Middleware system
│   ├── types.ts           # Middleware interface
│   ├── chain.ts           # Middleware chain executor
│   ├── auth.ts            # Authentication middleware
│   ├── retry.ts           # Retry with backoff
│   ├── cache.ts           # Response caching
│   └── logger.ts          # Request/response logging
│
├── generator/             # Code generators
│   ├── types.ts           # TypeScript type generator
│   ├── db.ts              # @mswjs/data factory generator
│   ├── handlers.ts        # MSW handler generator
│   ├── hooks.ts           # React hooks generator
│   ├── openapi.ts         # OpenAPI spec generator
│   └── postman.ts         # Postman collection generator
│
├── build/                 # Build-time tools
│   ├── babel-plugin.ts    # Compile-time elimination
│   ├── vite-plugin.ts     # Vite integration
│   └── webpack-plugin.ts  # Webpack integration
│
├── react/                 # React bindings
│   ├── provider.tsx       # DataLayerProvider
│   ├── hooks.ts           # useData, useMutate, useView
│   └── devtools.tsx       # Development tools panel
│
├── config.ts              # Global configuration
└── cli.ts                 # CLI entry point
```

## Component Interactions

### Development Flow

```
┌──────────┐    ┌───────────┐    ┌────────────┐    ┌──────────┐
│  Schema  │───▶│ Generator │───▶│  Runtime   │───▶│   UI     │
│  (user)  │    │           │    │            │    │Component │
└──────────┘    └───────────┘    └────────────┘    └──────────┘
     │                │                │                 │
     │                ▼                ▼                 │
     │         ┌───────────┐    ┌────────────┐          │
     │         │  types.ts │    │    MSW     │          │
     │         │   db.ts   │    │ intercepts │          │
     │         │handlers.ts│    │  requests  │          │
     │         └───────────┘    └────────────┘          │
     │                                │                  │
     │                                ▼                  │
     │                         ┌────────────┐           │
     │                         │@mswjs/data │           │
     │                         │ in-memory  │           │
     │                         │  database  │           │
     │                         └────────────┘           │
     │                                │                  │
     └────────────────────────────────┴──────────────────┘
                              Schema defines
                            everything else
```

### Production Flow

```
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐
│   UI     │───▶│ Middleware │───▶│  Adapter   │───▶│ Backend  │
│Component │    │   Chain    │    │            │    │   API    │
└──────────┘    └────────────┘    └────────────┘    └──────────┘
     │                │                 │                 │
     │                ▼                 ▼                 │
     │         ┌───────────┐    ┌────────────┐           │
     │         │   Auth    │    │   Fetch    │           │
     │         │   Cache   │    │  Supabase  │           │
     │         │   Retry   │    │  Firebase  │           │
     │         │   Logger  │    │  GraphQL   │           │
     │         └───────────┘    └────────────┘           │
     │                                                    │
     └────────────────────────────────────────────────────┘
                    Same useData() hook,
                  different implementation
```

## Data Flow

### Read Operation (findOne)

```
useData(User, { id: '123', include: ['profile', 'posts'] })
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     RESOLVER ENGINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Parse options                                           │
│     - id: '123'                                             │
│     - include: ['profile', 'posts']                         │
│                                                             │
│  2. Fetch base entity                                       │
│     db.user.findFirst({ where: { id: { equals: '123' } } }) │
│                                                             │
│  3. Resolve relations                                       │
│     ├── profile (hasOne, eager)                             │
│     │   db.userProfile.findFirst({ where: { userId: '123' }})│
│     └── posts (hasMany)                                     │
│         db.post.findMany({ where: { authorId: '123' } })    │
│                                                             │
│  4. Resolve computed fields                                 │
│     ├── postCount = db.post.count(...)                      │
│     └── totalViews = posts.reduce(sum, viewCount)           │
│                                                             │
│  5. Return assembled entity                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
{
  id: '123',
  name: 'John Doe',
  email: 'john@example.com',
  profile: { bio: '...', avatar: '...' },
  posts: [{ id: '1', title: '...' }, ...],
  postCount: 5,
  totalViews: 1234
}
```

### Write Operation (create)

```
useMutate(User).create({ name: 'Jane', email: 'jane@example.com' })
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     MIDDLEWARE CHAIN                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Auth Middleware]                                          │
│    ├── Get token from storage                               │
│    └── Add Authorization header                             │
│                                                             │
│  [Logger Middleware]                                        │
│    └── Log request start                                    │
│                                                             │
│  [Retry Middleware]                                         │
│    └── Initialize retry counter                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                       ADAPTER                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Development: Mock Adapter]                                │
│    db.user.create({ name: 'Jane', email: 'jane@...' })      │
│                                                             │
│  [Production: Real Adapter]                                 │
│    fetch('/api/users', { method: 'POST', body: {...} })     │
│    OR                                                       │
│    supabase.from('users').insert({...})                     │
│    OR                                                       │
│    apolloClient.mutate({ mutation: CREATE_USER, ... })      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                 MIDDLEWARE CHAIN (Response)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Logger Middleware]                                        │
│    └── Log response, duration                               │
│                                                             │
│  [Cache Middleware]                                         │
│    └── Invalidate user list cache                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
{ id: 'new-uuid', name: 'Jane', email: 'jane@example.com' }
```

## Build Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                      SOURCE CODE                             │
│                                                             │
│  import { defineData, field } from '@schemock/schema';       │
│  import { faker } from '@faker-js/faker';                    │
│                                                             │
│  const User = defineData('user', {                           │
│    id: field.uuid(),                                         │
│    postCount: field.computed({                               │
│      mock: () => faker.number.int({ min: 0, max: 100 }),     │
│      resolve: (user, db) => db.post.count({...}),            │
│    }),                                                       │
│  });                                                         │
│                                                             │
│  const { data } = useData(User, { id: '123' });              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    │ Babel/SWC Transform
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTION CODE                           │
│                                                             │
│  // All mock imports REMOVED                                 │
│  // defineData replaced with minimal config                  │
│                                                             │
│  const User = {                                              │
│    __entity: 'user',                                         │
│    __endpoint: '/api/users',                                 │
│  };                                                          │
│                                                             │
│  // useData transformed to production hook                   │
│  const { data } = __useDataProd(User, { id: '123' });        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Beyond MSW: Custom Mock Runtime

> **New from Session:** The adapter pattern enables going beyond MSW limitations.

### Why Not MSW-Only?

MSW intercepts at network level, but with the adapter pattern we can do better:

```
MSW Approach:
  api.todos.list() → fetch('/api/todos') → Service Worker → MSW Handler → Response

Adapter Approach (Development):
  api.todos.list() → MockAdapter.query('todos') → In-Memory Database → Response

Adapter Approach (Production):
  api.todos.list() → SupabaseAdapter.query('todos') → Real Database → Response
```

### Benefits of Direct In-Memory Calls

| Aspect | MSW | Direct Adapter |
|--------|-----|----------------|
| **Network** | Fake round-trip | No network at all |
| **Realtime** | Hard (WebSocket mocking) | Easy (in-memory pub/sub) |
| **RLS** | Manual per-handler | Policy-based filtering |
| **Setup** | Service Worker registration | Direct instantiation |
| **Debugging** | Network tab shows fake calls | Direct function calls |

### PGlite Option

For accurate SQL behavior in development, consider PGlite (PostgreSQL compiled to WASM):

```typescript
class SchemockAdapter {
  private db: PGlite;  // Real PostgreSQL in browser

  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    // Real SQL execution, not simulated
    const sql = this.buildSQL(table, options);
    const result = await this.db.query(sql);

    // Apply RLS filtering
    return this.rlsEngine.filter(table, result.rows, 'SELECT');
  }
}
```

Benefits:
- Accurate SQL behavior (joins, aggregations, etc.)
- Real constraint enforcement
- Identical query patterns to production

### When to Use What

| Scenario | Recommendation |
|----------|---------------|
| Quick prototyping | @mswjs/data (simpler) |
| Complex queries | PGlite (accurate SQL) |
| Testing edge cases | PGlite (real constraints) |
| CI/CD | @mswjs/data (faster, lighter) |

---

## Adapter Pattern Philosophy

> **New from Session:** Why adapters instead of conditionals.

### Bad Pattern (doesn't scale)

```typescript
const api = {
  todos: {
    list: async () => {
      if (isDev) {
        return mockRuntime.query('todos');
      } else if (isSupabase) {
        return supabase.from('todos').select('*');
      } else if (isMongo) {
        return mongo.collection('todos').find().toArray();
      }
      // ... grows forever
    }
  }
};
```

### Good Pattern (adapter)

```typescript
// One interface, many implementations
const api = {
  todos: {
    list: async (options) => adapter.query('todos', options),
  }
};

// Adapter determined at startup
const adapter = createAdapter(config);
```

### Why This Matters

1. **No scattered conditionals** - Backend logic centralized in adapter
2. **Runtime switchable** - Swap backends without rebuilding
3. **Each backend optimized** - Use best tools for each
4. **Mock = living documentation** - Same interface as production

---

## Dependency Graph

```
@schemock/schema (no deps)
       │
       ▼
@schemock/runtime ─────────────────────┐
       │                               │
       ├── @mswjs/data (peer)          │
       ├── msw (peer)                  │
       └── @faker-js/faker (peer)      │
                                       │
@schemock/adapters ◄───────────────────┤
       │                               │
       └── (optional peer deps)        │
           ├── @supabase/supabase-js   │
           ├── firebase                │
           └── @apollo/client          │
                                       │
@schemock/middleware ◄─────────────────┤
       │                               │
       └── (no deps)                   │
                                       │
@schemock/react ◄──────────────────────┘
       │
       └── @tanstack/react-query (peer)

@schemock/build (dev dep only)
       │
       └── @babel/core
```

## Configuration Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    CONFIGURATION HIERARCHY                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Global Config (app-wide defaults)                       │
│     configureDataLayer({                                    │
│       adapter: createFetchAdapter({ baseUrl: '...' }),      │
│       middleware: [auth, logger],                           │
│     })                                                      │
│                                                             │
│  2. Entity Config (per-entity overrides)                    │
│     configureDataLayer({                                    │
│       adapters: {                                           │
│         user: createSupabaseAdapter({...}),                 │
│       },                                                    │
│       entityMiddleware: {                                   │
│         post: [cacheMiddleware],                            │
│       },                                                    │
│     })                                                      │
│                                                             │
│  3. Operation Config (per-call overrides)                   │
│     useData(User, {                                         │
│       id: '123',                                            │
│       adapter: customAdapter,  // Override for this call    │
│       skipCache: true,                                      │
│     })                                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│                      ERROR FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  useData() call                                             │
│       │                                                     │
│       ▼                                                     │
│  Middleware Chain                                           │
│       │                                                     │
│       ▼                                                     │
│  Adapter throws error ──────────────────┐                   │
│                                         │                   │
│                                         ▼                   │
│  Middleware.onError() handlers ◄────────┤                   │
│       │                                 │                   │
│       ├── Auth: 401? → Refresh token    │                   │
│       │              → Retry            │                   │
│       │                                 │                   │
│       ├── Retry: Retryable? → Wait      │                   │
│       │                    → Retry      │                   │
│       │                                 │                   │
│       └── Logger: Log error             │                   │
│                                         │                   │
│  Max retries exceeded? ─────────────────┘                   │
│       │                                                     │
│       ▼                                                     │
│  Error bubbles to useData()                                 │
│       │                                                     │
│       ▼                                                     │
│  { error: AdapterError, data: null }                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
