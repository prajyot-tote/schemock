# Schemock

> Schema-first mocking for frontend developers

**Define once. Mock instantly. Ship faster.**

## What is Schemock?

Schemock flips the traditional API development workflow. Instead of waiting for backend APIs, frontend developers define their data needs upfront and get:

- **Instant working mocks** - Full CRUD with persistence using [@mswjs/data](https://github.com/mswjs/data) or PGlite
- **Type-safe API client** - Generated TypeScript types, client, and React hooks
- **Multi-target generation** - Generate client SDKs, Next.js API routes, and Node.js handlers from one schema
- **Multiple adapters** - Switch between Mock, Supabase, Firebase, Fetch, or GraphQL
- **SQL generation** - Export PostgreSQL schemas with RLS, indexes, and functions
- **OpenAPI export** - Generate specs to hand off to backend teams
- **Zero production overhead** - Mock code can be eliminated at build time

## Quick Start

```bash
npm install schemock
npx schemock init
```

Define your schema:

```typescript
// src/schemas/user.ts
import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.person.fullName(),
  role: field.enum(['admin', 'user', 'guest']).default('user'),
  avatar: field.image.avatar().nullable(),
});

export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.lorem.sentence(),
  content: field.lorem.paragraphs(3),
  authorId: field.ref('user'),
  published: field.boolean().default(false),
}, {
  relations: {
    author: belongsTo('user', 'authorId'),
  },
});
```

Generate everything:

```bash
npx schemock generate
```

Use in your React app:

```typescript
import { useUsers, useCreateUser, useUser } from './generated';

function UserList() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();

  // Full CRUD works instantly - no backend needed!
}

function UserProfile({ userId }: { userId: string }) {
  // Fetch with relations
  const { data: user } = useUser(userId, { include: ['posts'] });
}
```

## CLI Commands

```bash
schemock <command> [options]
```

| Command | Description |
|---------|-------------|
| `init [--template <name>]` | Initialize a new Schemock project |
| `generate` | Generate TypeScript types, client, and hooks |
| `generate:sql` | Generate PostgreSQL schema with RLS |
| `generate:openapi` | Generate OpenAPI 3.0 specification |
| `generate:postman` | Generate Postman collection |

### Generate Options

```bash
npx schemock generate [options]

  --adapter, -a <type>    Adapter: mock|supabase|firebase|fetch|graphql|pglite
  --output, -o <dir>      Output directory (default: ./src/generated)
  --config, -c <file>     Config file path
  --only <entities>       Only generate for these entities (comma-separated)
  --exclude <entities>    Exclude these entities (comma-separated)
  --watch, -w             Watch mode - regenerate on changes
  --dry-run               Preview without writing files
  --verbose, -v           Verbose output
```

**Entity filtering examples:**
```bash
# Generate only User and Post entities
npx schemock generate --only user,post

# Generate everything except Audit logs
npx schemock generate --exclude audit

# Combine with other options
npx schemock generate --adapter supabase --only user,post --verbose
```

### SQL Generation

```bash
npx schemock generate:sql [options]

  --output, -o <dir>      Output directory (default: ./sql)
  --combined              Single schema.sql file
  --target <platform>     postgres|supabase|pglite
  --only <sections>       tables,foreign-keys,indexes,rls,functions,triggers
  --readme                Generate README documentation
```

## Schema DSL

### Field Types

```typescript
import { field } from 'schemock/schema';

// Primitives
field.uuid()              // UUID v4
field.string()            // Random string
field.number()            // Random number
field.boolean()           // Random boolean
field.date()              // Random date

// Semantic types
field.email()             // Email address
field.url()               // URL

// With constraints
field.number({ min: 0, max: 100 })
field.string().min(1).max(255)
field.number().int()

// Modifiers (chainable)
field.string().nullable()
field.email().unique()
field.date().readOnly()
field.enum(['a', 'b']).default('a')
```

### Faker Namespaces

Schemock provides namespaced field builders that map to [Faker.js](https://fakerjs.dev/) methods:

```typescript
// Person
field.person.fullName()
field.person.firstName()
field.person.lastName()
field.person.bio()
field.person.jobTitle()

// Internet
field.internet.email()
field.internet.url()
field.internet.avatar()
field.internet.userName()
field.internet.password()

// Lorem
field.lorem.word()
field.lorem.sentence()
field.lorem.paragraph()
field.lorem.paragraphs(3)

// Location
field.location.city()
field.location.country()
field.location.streetAddress()
field.location.zipCode()
field.location.latitude()
field.location.longitude()

// Phone
field.phone.number()

// Image
field.image.avatar()
field.image.url({ width: 800, height: 600 })

// Company
field.company.name()
field.company.catchPhrase()

// Commerce
field.commerce.productName()
field.commerce.price()
field.commerce.department()
```

### Complex Types

```typescript
// Enum
field.enum(['admin', 'user', 'guest']).default('user')

// Reference to another entity
field.ref('user')

// Array
field.array(field.string())
field.array(field.uuid()).length(5)

// Nested object
field.object({
  street: field.location.streetAddress(),
  city: field.location.city(),
  zip: field.location.zipCode(),
})

// Computed field
field.computed({
  mock: () => Math.floor(Math.random() * 100),
  resolve: (entity) => entity.firstName + ' ' + entity.lastName,
  dependsOn: ['firstName', 'lastName'],
})
```

### Relations

```typescript
import { defineData, field, hasOne, hasMany, belongsTo } from 'schemock/schema';

const User = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  // One-to-one: User has one Profile
  profile: hasOne('userProfile', { foreignKey: 'userId', eager: true }),
  // One-to-many: User has many Posts
  posts: hasMany('post', { foreignKey: 'authorId', orderBy: { createdAt: 'desc' } }),
  // Many-to-many through junction table
  followers: hasMany('user', {
    through: 'follow',
    foreignKey: 'followingId',
    otherKey: 'followerId',
  }),
});

const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.ref('user'),
  title: field.string(),
  // Inverse relation
  author: belongsTo('user', { foreignKey: 'authorId' }),
});
```

### Views

Define custom API endpoints with computed data:

```typescript
import { defineView, embed, pick, omit } from 'schemock/schema';

const UserFullView = defineView('user-full', {
  // Pick specific fields
  ...pick(User, ['id', 'name', 'email']),

  // Embed related data
  profile: embed(UserProfile),
  recentPosts: embed(Post, {
    limit: 5,
    orderBy: { createdAt: 'desc' }
  }),

  // Nested computed stats
  stats: {
    postCount: field.computed({
      mock: () => Math.floor(Math.random() * 50),
      resolve: (_, db, ctx) => db.post.count({
        where: { authorId: ctx.params.id }
      }),
    }),
  },
}, {
  endpoint: '/api/users/:id/full',
  params: ['id'],
});
```

### Custom Endpoints

Define arbitrary REST endpoints beyond CRUD:

```typescript
import { defineEndpoint, field } from 'schemock/schema';

// GET with query parameters
const SearchEndpoint = defineEndpoint('/api/search', {
  method: 'GET',
  params: {
    q: field.string(),
    type: field.enum(['user', 'post', 'all']).default('all'),
    limit: field.number({ int: true }).default(20),
  },
  response: {
    results: field.array(field.object({
      id: field.string(),
      title: field.string(),
    })),
    total: field.number({ int: true }),
  },
  mockResolver: async ({ params, db }) => {
    const users = db.user.findMany({
      where: { name: { contains: params.q } }
    });
    return { results: users, total: users.length };
  },
});

// POST with body
const BulkDeleteEndpoint = defineEndpoint('/api/posts/bulk-delete', {
  method: 'POST',
  body: {
    ids: field.array(field.string()),
  },
  response: {
    deleted: field.number({ int: true }),
  },
  mockResolver: async ({ body, db }) => {
    let deleted = 0;
    for (const id of body.ids) {
      const result = db.post.delete({ where: { id: { equals: id } } });
      if (result) deleted++;
    }
    return { deleted };
  },
});
```

### Row-Level Security (RLS)

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.ref('user'),
  title: field.string(),
  published: field.boolean().default(false),
}, {
  rls: {
    scope: [{ row: 'authorId', context: 'userId' }],
    select: (row, ctx) => row.published || row.authorId === ctx.userId,
    insert: (row, ctx) => row.authorId === ctx.userId,
    update: (row, ctx) => row.authorId === ctx.userId,
    delete: (row, ctx) => row.authorId === ctx.userId,
    bypass: [{ when: (ctx) => ctx.role === 'admin' }],
  },
});
```

### Indexes and RPCs

```typescript
const Post = defineData('post', {
  // ... fields
}, {
  indexes: [
    { fields: ['authorId', 'createdAt'], type: 'btree' },
    { fields: ['title'], type: 'gin', using: 'gin_trgm_ops' },
    { fields: ['status'], where: "status = 'published'" },
  ],
  rpc: [
    {
      name: 'get_user_post_count',
      args: [{ name: 'user_id', type: 'uuid' }],
      returns: 'number',
      sql: 'SELECT COUNT(*) FROM posts WHERE author_id = user_id',
    },
  ],
});
```

## Adapters

Schemock supports multiple backend adapters with a unified API:

| Adapter | Description |
|---------|-------------|
| `mock` | In-memory database using @mswjs/data (default) |
| `pglite` | Real PostgreSQL in the browser via PGlite |
| `supabase` | Supabase client integration |
| `firebase` | Firebase/Firestore client integration |
| `fetch` | Generic REST API client |
| `graphql` | Apollo Client integration |

```bash
# Generate for specific adapter
npx schemock generate --adapter supabase
npx schemock generate --adapter pglite
```

## Middleware

Chain middleware for cross-cutting concerns:

```typescript
import {
  createAuthMiddleware,
  createCacheMiddleware,
  createRetryMiddleware,
  createLoggerMiddleware,
  createRLSMiddleware,
  createContextMiddleware,
  MiddlewareChain,
} from 'schemock/middleware';

// Auth middleware
const auth = createAuthMiddleware({
  getToken: () => localStorage.getItem('token'),
  validateToken: async (token) => { /* ... */ },
});

// Cache middleware
const cache = createCacheMiddleware({
  ttl: 60000, // 1 minute
  storage: new MemoryCacheStorage(),
});

// Retry middleware
const retry = createRetryMiddleware({
  maxRetries: 3,
  backoff: 'exponential',
});

// Logger middleware
const logger = createLoggerMiddleware({
  level: 'debug',
});

// RLS middleware
const rls = createRLSMiddleware({
  filters: {
    post: (ctx) => ({ authorId: ctx.userId }),
  },
});

// Chain them together
const chain = new MiddlewareChain([auth, cache, retry, logger, rls]);
```

### Middleware Presets

```typescript
import {
  MOCK_MIDDLEWARE_PRESET,
  PRODUCTION_MIDDLEWARE_PRESET,
  TEST_MIDDLEWARE_PRESET,
} from 'schemock/middleware';
```

## React Hooks

Generated hooks provide type-safe data fetching with React Query:

```typescript
// Generated per entity (e.g., for User schema)
import {
  useUsers,           // Fetch list
  useUser,            // Fetch single by ID
  useUserWithPosts,   // Fetch with relation
  useCreateUser,      // Create mutation
  useUpdateUser,      // Update mutation
  useDeleteUser,      // Delete mutation
} from './generated';

// List with filtering, pagination, ordering
const { data: users } = useUsers({
  where: { role: 'admin' },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  offset: 0,
});

// Single entity with relations
const { data: user } = useUser(userId, {
  include: ['posts', 'profile'],
});

// Mutations
const createUser = useCreateUser();
await createUser.mutateAsync({ name: 'John', email: 'john@example.com' });
```

### Generic Hooks

Also available for dynamic use:

```typescript
import { useData, useMutate, useView, usePrefetch } from 'schemock/react';

const { data } = useData(userSchema, { id: '123', include: ['posts'] });
const { create, update, remove } = useMutate(userSchema);
const { data: fullUser } = useView(userFullView, { params: { id: '123' } });
```

## Configuration

Create `schemock.config.ts` in your project root:

```typescript
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  // Schema discovery pattern
  schemas: './src/schemas/**/*.ts',

  // Output directory
  output: './src/generated',

  // Default adapter
  adapter: 'mock',

  // API prefix for endpoints
  apiPrefix: '/api',

  // Custom pluralization
  pluralization: {
    custom: { 'person': 'people' },
  },

  // Adapter-specific configuration
  adapters: {
    mock: {
      seed: { user: 5, post: 20 },  // Default seed counts
      delay: 100,                    // Simulated latency (ms)
      fakerSeed: 12345,             // Reproducible data
      persist: true,                 // localStorage persistence
    },
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
    firebase: {
      collectionMap: { user: 'users' },
    },
    fetch: {
      baseUrl: 'https://api.example.com',
    },
    pglite: {
      persistence: 'indexeddb',
      dataDir: 'idb://myapp',
    },
  },
});
```

## Multi-Target Generation

Generate multiple outputs from a single schema - client SDKs, API routes, and server handlers all at once:

```typescript
// schemock.config.ts
export default {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',

  targets: [
    // Supabase client for direct database access
    {
      name: 'supabase-client',
      type: 'supabase',
      output: './src/generated/supabase',
    },
    // Next.js API routes (App Router)
    {
      name: 'nextjs-api',
      type: 'nextjs-api',
      output: './src/app/api',
      backend: 'supabase',
      middleware: {
        auth: { provider: 'supabase-auth' },
        validation: true,
      },
    },
    // Node.js/Express handlers
    {
      name: 'node-server',
      type: 'node-handlers',
      output: './src/generated/node',
      backend: 'supabase',
      middleware: {
        auth: { provider: 'jwt', secretEnvVar: 'JWT_SECRET' },
        validation: true,
      },
    },
  ],
};
```

### Available Target Types

| Type | Description | Output |
|------|-------------|--------|
| `mock` | In-memory mock database | Client, handlers, hooks |
| `supabase` | Supabase client SDK | Client, types, hooks |
| `firebase` | Firebase/Firestore client | Client, types, hooks |
| `fetch` | Generic REST client | Client, types, hooks |
| `pglite` | PGlite browser database | Client, db, seed |
| `nextjs-api` | Next.js App Router routes | Route handlers, middleware |
| `node-handlers` | Express-compatible handlers | Handlers, router, middleware |

### Entity Filtering

Control which entities are generated per target:

```typescript
targets: [
  {
    name: 'public-api',
    type: 'nextjs-api',
    output: './src/app/api',
    // Only generate routes for these entities
    entities: ['user', 'post'],
  },
  {
    name: 'admin-api',
    type: 'node-handlers',
    output: './src/admin/api',
    // Generate all entities except these
    excludeEntities: ['audit', 'log'],
  },
]
```

CLI overrides for quick filtering:

```bash
# Only generate for specific entities (applies to all targets)
npx schemock generate --only user,post

# Exclude entities from generation
npx schemock generate --exclude audit,log
```

**Note:** Types always include all entities to preserve relations (e.g., `User.posts`). Only CRUD operations/routes are filtered.

### Generated Server Files

**Next.js API Routes** (`nextjs-api` target):
```
src/app/api/
├── _lib/
│   ├── types.ts      # TypeScript types
│   ├── auth.ts       # Auth middleware (Supabase Auth)
│   ├── validate.ts   # Validation middleware
│   └── supabase.ts   # Supabase client
├── users/
│   ├── route.ts      # GET /api/users, POST /api/users
│   └── [id]/
│       └── route.ts  # GET/PUT/DELETE /api/users/:id
└── posts/
    ├── route.ts
    └── [id]/route.ts
```

**Node.js Handlers** (`node-handlers` target):
```
src/generated/node/
├── types.ts           # TypeScript types
├── db.ts              # Database client
├── router.ts          # Express router with all routes
├── index.ts           # Barrel exports
├── middleware/
│   ├── auth.ts        # JWT authentication
│   └── validate.ts    # Request validation
└── handlers/
    ├── users.ts       # User CRUD handlers
    └── posts.ts       # Post CRUD handlers
```

### Using Generated Node Handlers

```typescript
import express from 'express';
import { router } from './generated/node';

const app = express();
app.use('/api', router);
app.listen(3000);
```

### Auto-Generated Middleware

**Authentication** (from target config):
- `supabase-auth`: Validates Supabase JWT tokens
- `jwt`: Standard JWT validation with configurable secret
- `nextauth`: NextAuth.js session validation
- `clerk`: Clerk authentication

**Validation** (from schema field definitions):
```typescript
// Schema
field.string({ min: 2, max: 100 })
field.email()
field.enum(['admin', 'user'])

// Generated validation
function validateUser(data) {
  if (name.length < 2 || name.length > 100) { /* error */ }
  if (!isValidEmail(email)) { /* error */ }
  if (!['admin', 'user'].includes(role)) { /* error */ }
}
```

## Generated Files

Running `npx schemock generate` produces:

```
src/generated/
├── types.ts          # TypeScript types (Entity, Create, Update, Filter)
├── db.ts             # @mswjs/data factory with all entities
├── handlers.ts       # MSW request handlers
├── client.ts         # API client with CRUD operations
├── hooks.ts          # React Query hooks per entity
├── seed.ts           # Seed/reset utilities
├── routes.ts         # Route definitions
├── all-handlers.ts   # Combined handlers export
└── index.ts          # Barrel exports
```

For custom endpoints:
```
├── endpoints.ts          # Custom endpoint client methods
├── endpoint-handlers.ts  # MSW handlers for custom endpoints
└── endpoint-resolvers.ts # Mock resolvers
```

## Package Exports

```typescript
// Schema definition
import { defineData, defineView, defineEndpoint, field, hasMany, belongsTo } from 'schemock/schema';

// React hooks
import { useData, useMutate, useView, DataLayerProvider } from 'schemock/react';

// Adapters
import { createMockAdapter, createSupabaseAdapter, createFetchAdapter } from 'schemock/adapters';

// Middleware
import { createAuthMiddleware, createCacheMiddleware, MiddlewareChain } from 'schemock/middleware';

// Runtime
import { setup, seed, reset, createHandlers } from 'schemock/runtime';

// CLI utilities
import { defineConfig } from 'schemock/cli';
```

## Why Schemock?

| Traditional Workflow | With Schemock |
|---------------------|---------------|
| Wait for backend API | Start building immediately |
| Write mock handlers manually | Auto-generated from schema |
| Mock code ships to production | Eliminated at build time |
| FE/BE contracts drift | Schema is single source of truth |
| Separate tools for mocking | Unified: types, client, hooks, handlers |

## Tech Stack

| Component | Library |
|-----------|---------|
| In-memory DB | [@mswjs/data](https://github.com/mswjs/data) |
| Browser SQL | [PGlite](https://pglite.dev/) |
| Fake data | [@faker-js/faker](https://fakerjs.dev/) |
| Validation | [zod](https://zod.dev/) |
| React hooks | [@tanstack/react-query](https://tanstack.com/query) |
| API mocking | [MSW](https://mswjs.io/) |
| Build | [tsup](https://tsup.egoist.dev/) |

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## Status

🚧 **In Development** - This project is under active development. APIs may change.

## License

MIT
