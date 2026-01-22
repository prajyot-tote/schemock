# Schemock

> Schema-first mocking for frontend developers

**Define once. Mock instantly. Ship faster.**


## What is Schemock?

Schemock flips the traditional API development workflow. Instead of waiting for backend APIs, frontend developers define their data needs upfront and get:

- **Instant working mocks** - Full CRUD with pluggable storage: in-memory ([@mswjs/data](https://github.com/mswjs/data), Memory), persistent (LocalStorage, IndexedDB, OPFS), or PGlite/Postgres
- **Type-safe API client** - Generated TypeScript types, client, and React hooks
- **Multi-target generation** - Generate client SDKs, Next.js API routes, and Node.js handlers from one schema
- **Multiple adapters** - Switch between Mock, Supabase, Firebase, Fetch, or GraphQL
- **SQL generation** - Export PostgreSQL schemas with RLS, indexes, and functions
- **OpenAPI export** - Generate specs to hand off to backend teams
- **Zero production overhead** - Mock code can be eliminated at build time

---

## Storage Backends

Schemock supports multiple storage drivers for mock data, both in-memory and persistent:

| Driver                | Persistence      | Description                                      |
|-----------------------|------------------|--------------------------------------------------|
| `MswStorageDriver`    | In-memory        | Uses @mswjs/data for fast, realistic mocks        |
| `MemoryStorageDriver` | In-memory        | Lightweight, pure JS Maps (no dependencies)       |
| `LocalStorageDriver`  | Persistent       | Persists data in browser localStorage             |
| `PGlite`              | Persistent       | PostgreSQL in the browser (IndexedDB/OPFS)        |
| `IndexedDBDriver`     | Persistent       | (Planned) IndexedDB for large datasets            |
| `OPFSDriver`          | Persistent       | (Planned) Browser-native file system persistence  |

**You can choose the storage backend that fits your needs.**

### Example: Using Persistent Storage

```typescript
import { MockAdapter } from 'schemock/adapters';
import { LocalStorageDriver } from 'schemock/storage';

const driver = new LocalStorageDriver({ storageKey: 'myapp', autoSync: true });
await driver.initialize(schemas);

const adapter = new MockAdapter({ driver, schemas });
```

### Example: Using In-Memory Storage

```typescript
import { MockAdapter, MswStorageDriver } from 'schemock/adapters';

const driver = new MswStorageDriver();
await driver.initialize(schemas);

const adapter = new MockAdapter({ driver, schemas });
```

---

## Quick Start

```bash
npm install schemock
npx schemock init
```

This creates:
- `src/schemas/user.ts` - Example schema with User, Post, Comment
- `schemock.config.ts` - Configuration file
- `CLAUDE.md` - AI tool configuration (helps Claude Code, Cursor, etc.)

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
  authorId: field.uuid(),
  published: field.boolean().default(false),

  // Relations are defined inline with fields
  author: belongsTo('user', { foreignKey: 'authorId' }),
});
```

Generate code:

```bash
# Framework-agnostic (Angular, Vue, Svelte, vanilla JS)
npx schemock generate

# With React Query hooks
npx schemock generate --framework react
```

Use the generated client (works with any framework):

```typescript
import { api } from './generated';

// Full CRUD works instantly - no backend needed!
const users = await api.user.list();
const user = await api.user.create({ name: 'John', email: 'john@example.com' });
await api.user.update(user.data.id, { name: 'John Doe' });
await api.user.delete(user.data.id);
```

> **Important: Always use `api.*` in UI code**
>
> The `api` client is consistent across all adapters (Mock, PGlite, Supabase, Firebase, Fetch).
> The `db` layer is internal and has different APIs per adapter. Using `db.*` directly in UI code
> will require refactoring when switching adapters. See [API Layers](#api-layers-db-vs-api) for details.

Or with React hooks (when using `--framework react`):

```typescript
import { useUsers, useCreateUser, SchemockProvider, createClient } from './generated';

// Configure auth (optional)
const client = createClient({
  onRequest: (ctx) => {
    ctx.headers.Authorization = `Bearer ${getToken()}`;
    return ctx;
  }
});

// Wrap app with provider
<SchemockProvider client={client}>
  <App />
</SchemockProvider>

// Use hooks
function UserList() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  // ...
}
```

## API Layers: db vs api

Schemock generates two layers:

| Layer | Consistency | Use For |
|-------|-------------|---------|
| `api.*` | ✅ Same across all adapters | UI code, frontend components |
| `db.*` | ❌ Varies by adapter | Endpoint resolvers, seeding, tests |

**Always use `api.*` in your UI code.** This ensures zero refactoring when switching adapters.

```typescript
// ✅ CORRECT - Works with any adapter
import { api } from './generated';
await api.user.list();

// ❌ AVOID in UI - Requires refactoring when switching adapters
import { db } from './generated';
db.user.getAll(); // Only works with Mock adapter
```

For a detailed migration guide, see [docs/migration-db-to-api.md](docs/migration-db-to-api.md).

## CLI Commands

```bash
schemock <command> [options]
```

| Command | Description |
|---------|-------------|
| `init [--template <name>]` | Initialize a new Schemock project |
| `generate` | Generate TypeScript types and client (+ hooks with `--framework react`) |
| `generate:sql` | Generate PostgreSQL schema with RLS |
| `generate:openapi` | Generate OpenAPI 3.0 specification |
| `generate:postman` | Generate Postman collection |
| `setup:ai` | Generate CLAUDE.md for AI tool integration |

### Generate Options

```bash
npx schemock generate [options]

  --adapter, -a <type>    Adapter: mock|supabase|firebase|fetch|graphql|pglite
  --framework <type>      Framework: react|none (default: none)
                          react: Generate React Query hooks + SchemockProvider
                          none:  Framework-agnostic client only
  --output, -o <dir>      Output directory (default: ./src/generated)
  --config, -c <file>     Config file path
  --only <entities>       Only generate for these entities (comma-separated)
  --exclude <entities>    Exclude these entities (comma-separated)
  --with-form-schemas     Generate Zod validation, form defaults, and table columns
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

### Form Schema Generation

Add `--with-form-schemas` to generate Zod validation schemas, form defaults, and table column metadata:

```bash
npx schemock generate --with-form-schemas
```

This appends the following to `types.ts` for each entity:

```typescript
// Zod validation schema with constraints from field definitions
export const UserFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().min(1, 'Email is required'),
  role: z.enum(['admin', 'user', 'guest']),
  bio: z.string().max(500).nullable(),
});

// Default values for form initialization
export const UserFormDefaults: z.input<typeof UserFormSchema> = {
  name: '',
  email: '',
  role: 'user',
  bio: null,
};

// Inferred TypeScript type
export type UserFormData = z.infer<typeof UserFormSchema>;

// Table column metadata for building data tables
export const UserTableColumns: ColumnDef[] = [
  { key: 'name', label: 'Name', type: 'text', sortable: true, filterable: true },
  { key: 'email', label: 'Email', type: 'email', sortable: true, filterable: true },
  { key: 'role', label: 'Role', type: 'enum', sortable: true, filterable: true },
  { key: 'createdAt', label: 'Created At', type: 'date', sortable: true, filterable: true, hidden: true },
];

// Union type of valid column keys
export type UserColumnKey = 'name' | 'email' | 'role' | 'createdAt' | ...;
```

**Use with react-hook-form:**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserFormSchema, UserFormDefaults, UserFormData } from './generated';

function UserForm() {
  const form = useForm<UserFormData>({
    resolver: zodResolver(UserFormSchema),
    defaultValues: UserFormDefaults,
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register('name')} />
      {form.formState.errors.name && <span>{form.formState.errors.name.message}</span>}
      {/* ... */}
    </form>
  );
}
```

**Use table columns with any table library:**

```typescript
import { UserTableColumns } from './generated';

// With TanStack Table
const columns = UserTableColumns.filter(col => !col.hidden).map(col => ({
  accessorKey: col.key,
  header: col.label,
  enableSorting: col.sortable,
}));

// With any custom table
function UserTable({ users }) {
  return (
    <table>
      <thead>
        <tr>
          {UserTableColumns.filter(c => !c.hidden).map(col => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      {/* ... */}
    </table>
  );
}
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

### AI Tool Integration

Schemock can generate configuration files that help AI coding assistants (like Claude Code, Cursor, etc.) understand your project and avoid modifying auto-generated code.

**Automatic setup (recommended):**

When you run `schemock init`, a `CLAUDE.md` file is automatically created with:
- List of generated directories that AI should not modify
- Schema DSL reference for AI assistance
- Common tasks and CLI commands

**Manual setup for existing projects:**

```bash
# Generate/update CLAUDE.md
npx schemock setup:ai

# Also generate .cursorrules for Cursor IDE
npx schemock setup:ai --cursor

# Preview without writing files
npx schemock setup:ai --dry-run
```

**What the AI configuration includes:**
- **Generated files warning** - Tells AI which directories contain auto-generated code
- **Schema DSL reference** - Helps AI write correct schema definitions
- **Common tasks** - Guides AI on how to add fields, entities, relations
- **CLI commands** - Reference for generation commands

**Safe merging:** If you already have a `CLAUDE.md`, Schemock appends its section without overwriting your existing content. Clear markers (`<!-- SCHEMOCK:START -->` / `<!-- SCHEMOCK:END -->`) identify the auto-generated portion.

**Options:**

```bash
npx schemock setup:ai [options]

  --cursor                Also generate .cursorrules for Cursor IDE
  --force                 Overwrite existing .cursorrules even if not created by Schemock
  --dry-run               Preview without writing files
  --output, -o <dir>      Output directory (default: current directory)
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
  authorId: field.uuid(),  // Foreign key field
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

### External Resolver Functions

When generating mock endpoints, Schemock handles resolver functions in two ways:

**Named functions** are imported from your source file:

```typescript
// src/schemas/endpoints.ts

// Named function - will be IMPORTED in generated code
export async function searchResolver({ params, db }) {
  const users = db.user.findMany({
    where: { name: { contains: params.q } }
  });
  return { results: users, total: users.length };
}

export const SearchEndpoint = defineEndpoint('/api/search', {
  method: 'GET',
  params: { q: field.string() },
  mockResolver: searchResolver,  // ✅ Imported, not serialized
});
```

Generated output:
```typescript
// src/generated/mock/endpoints.ts
import { searchResolver } from '../../schemas/endpoints';

// Uses imported function directly
{ path: '/api/search', resolver: searchResolver }
```

**Anonymous/inline functions** are serialized into the generated code:

```typescript
export const HealthEndpoint = defineEndpoint('/api/health', {
  method: 'GET',
  mockResolver: async () => ({ status: 'ok' }),  // Serialized inline
});
```

**Benefits of named functions:**
- Proper IDE support (go-to-definition, refactoring)
- Full TypeScript type checking
- Easier debugging with meaningful stack traces
- Cleaner generated code

### Inline Resolver Limitations

When using inline `mockResolver` functions with local helper functions, be aware of these limitations:

#### 1. Only Directly-Used Functions Are Copied

Local functions are only copied if they are **directly called** in a resolver. Transitive dependencies (functions called by other functions) are not automatically detected.

```typescript
// ❌ Problem: innerHelper won't be copied
function innerHelper(x: string) { return x.toUpperCase(); }
function outerHelper(x: string) { return innerHelper(x); }

export const MyEndpoint = defineEndpoint('/api/test', {
  mockResolver: async ({ body }) => ({
    result: outerHelper(body.input)  // Only outerHelper is detected
  })
});

// ✅ Solution: Use named exported function
export async function myResolver({ body, db }) {
  return { result: outerHelper(body.input) };
}

export const MyEndpoint = defineEndpoint('/api/test', {
  mockResolver: myResolver  // Function is imported, not serialized
});
```

#### 2. Arrow Functions Need Parentheses

Arrow functions without parentheses around parameters are not detected:

```typescript
// ❌ Not detected
const double = x => x * 2;

// ✅ Detected
const double = (x) => x * 2;
```

#### 3. Recommended: Use Named Functions for Complex Logic

For resolvers with helper functions, use named exported functions instead of inline resolvers:

```typescript
// Recommended approach
export async function loginResolver({ body, db }) {
  const user = db.user.findFirst({ where: { email: { equals: body.email } } });
  if (!verifyPassword(body.password, user.hash)) {
    throw new Error('Invalid credentials');
  }
  return { token: generateToken(user.id), user };
}

export const LoginEndpoint = defineEndpoint('/api/auth/login', {
  mockResolver: loginResolver  // ✅ Imported directly, full IDE support
});
```

Benefits of named functions:
- All dependencies are available (no serialization)
- Full IDE support (go-to-definition, refactoring)
- Better stack traces for debugging

### Row-Level Security (RLS)

**Scope-based RLS (simple - recommended):**

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  tenantId: field.uuid(),
  title: field.string(),
}, {
  rls: {
    // Rows filtered by field matching context key
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    // Bypass RLS for admins
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

**Custom filter functions (advanced):**

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  published: field.boolean().default(false),
}, {
  rls: {
    // Custom logic per operation
    select: (row, ctx) => row.published || row.authorId === ctx?.userId,
    insert: (row, ctx) => row.authorId === ctx?.userId,
    update: (row, ctx) => row.authorId === ctx?.userId,
    delete: (_row, ctx) => ctx?.role === 'admin',
  },
});
```

**Raw SQL policies (for PGlite/Supabase):**

```typescript
const Post = defineData('post', { /* ... */ }, {
  rls: {
    sql: {
      select: "author_id = current_setting('app.userId')::uuid OR published = true",
      insert: "author_id = current_setting('app.userId')::uuid",
    },
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

Schemock supports multiple backend adapters with a unified API. The `mock` adapter is highly flexible and supports both in-memory and persistent storage backends (see above). You can configure which storage driver to use for mocks in your config or at runtime.

| Adapter    | Description                                                      |
|------------|------------------------------------------------------------------|
| `mock`     | Mock database with pluggable storage (in-memory or persistent)    |
| `pglite`   | Real PostgreSQL in the browser via PGlite (IndexedDB/OPFS)       |
| `supabase` | Supabase client with interceptor pattern for auth & error handling |
| `firebase` | Firebase/Firestore client integration                            |
| `fetch`    | Generic REST API client                                          |
| `graphql`  | Apollo Client integration                                        |

```bash
# Generate for specific adapter
npx schemock generate --adapter supabase
npx schemock generate --adapter pglite
```

### Supabase Interceptor Pattern

The Supabase adapter generates a `createClient()` factory with interceptors for centralized auth and error handling:

```typescript
import { createClient, ApiError } from './generated/supabase';

const api = createClient({
  // Add auth headers to every request
  onRequest: (ctx) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      ctx.headers.Authorization = `Bearer ${token}`;
    }
    return ctx;
  },
  // Centralized error handling
  onError: (error: ApiError) => {
    if (error.status === 401) {
      window.location.href = '/login';
    }
    // error.code contains PostgreSQL/PostgREST error codes
    // error.operation contains the operation name (e.g., 'users.get')
  }
});

// Auth is automatic for all operations
const users = await api.users.list();
const user = await api.users.get('123');
```

> **Note:** The `mock` adapter is not limited to in-memory mocks. You can enable persistence (e.g., localStorage) by configuring the storage driver.

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
      persistence: 'localStorage',   // 'localStorage' or 'memory'
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

### Advanced Configuration (v1.0)

For more control over code generation, use the new unified configuration format with separate frontend/backend/middleware sections:

```typescript
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  // Frontend configuration
  frontend: {
    framework: 'react',     // react | vue | svelte | none
    adapter: 'mock',        // mock | supabase | firebase | fetch | pglite
    output: './src/generated/client',  // Optional: override output
  },

  // Backend configuration
  backend: {
    framework: 'node',      // node | nextjs | supabase-edge | neon
    output: './src/generated/server',
    database: {
      type: 'supabase',     // postgres | supabase | neon
      connectionEnvVar: 'DATABASE_URL',
    },
  },

  // Unified middleware - applies to both frontend and backend
  middleware: {
    // Middleware execution order (default: auth -> logger -> context -> rls -> cache)
    chain: ['auth', 'logger', 'context', 'rls', 'cache'],

    // Authentication
    auth: {
      provider: 'jwt',      // jwt | supabase-auth | nextauth | clerk | custom
      required: true,
      secretEnvVar: 'JWT_SECRET',
      skip: ['/api/health', '/api/public/*'],  // Routes to skip auth
    },

    // Rate limiting
    rateLimit: {
      max: 100,
      windowMs: 60000,      // 1 minute
      keyGenerator: 'ip',   // ip | user | custom
    },

    // Response caching
    cache: {
      ttl: 300000,          // 5 minutes
      operations: ['findOne', 'findMany'],
      storage: 'memory',    // memory | redis
    },

    // Request/response logging
    logger: {
      level: 'info',        // debug | info | warn | error
      includeBody: false,
      redactFields: ['password', 'token'],
    },

    // Enable context extraction from JWT/headers
    context: true,

    // Enable row-level security middleware
    rls: true,

    // Enable validation middleware from schema constraints
    validation: true,

    // Custom middleware files (using defineMiddleware)
    custom: [
      './src/middleware/tenant.ts',
      './src/middleware/audit.ts',
    ],
  },
});
```

### Custom Middleware Definition

Define custom middleware using the `defineMiddleware` API:

```typescript
// src/middleware/tenant.ts
import { defineMiddleware, field } from 'schemock/schema';

export const tenantMiddleware = defineMiddleware('tenant', {
  // Configuration schema (optional)
  config: {
    headerName: field.string().default('X-Tenant-ID'),
    required: field.boolean().default(true),
  },

  // Handler function - works across all backends
  handler: async ({ ctx, config, next }) => {
    const tenantId = ctx.headers[config.headerName];
    if (config.required && !tenantId) {
      throw new Error('Tenant ID required');
    }
    ctx.context.tenantId = tenantId;
    return next();
  },

  // Execution order hint
  order: 'early',  // early | normal | late
});
```

### Legacy Configuration (targets)

The `targets` array format is still supported but deprecated:

```typescript
// Deprecated - use frontend/backend/middleware instead
export default {
  targets: [
    { name: 'client', type: 'supabase', output: './src/generated/supabase' },
    { name: 'api', type: 'nextjs-api', output: './src/app/api', backend: 'supabase' },
  ],
};
```

## File Organization

Schemock supports organizing schemas across multiple files and directories. The CLI discovers all schemas via glob patterns and merges them before generation - **no code changes needed**.

### Recommended Structure

```
src/schemas/
├── entities/           # Entity definitions (defineData)
│   ├── user.ts
│   ├── post.ts
│   └── comment.ts
├── endpoints/          # Custom API endpoints (defineEndpoint)
│   ├── search.ts
│   └── bulk-operations.ts
├── views/              # Composite views (defineView)
│   └── user-profile.ts
└── index.ts            # Optional barrel exports
```

Or organize by domain:

```
src/schemas/
├── auth/
│   ├── user.ts
│   ├── session.ts
│   └── auth-endpoints.ts
├── content/
│   ├── post.ts
│   ├── comment.ts
│   └── search-endpoint.ts
└── billing/
    ├── subscription.ts
    └── payment.ts
```

### How It Works

1. **Discovery is file-agnostic** - The glob pattern `./src/schemas/**/*.ts` catches all files
2. **References are string-based** - Relations use entity names, not imports:
   ```typescript
   // entities/post.ts
   belongsTo('user', { foreignKey: 'authorId' })  // References 'user' by name, not import
   field.ref('user')  // Same - string reference (for semantic foreign keys)
   ```
3. **Merging happens before analysis** - All schemas are combined, so cross-file references resolve correctly
4. **Endpoints access all entities** - `mockResolver` receives `db` with every entity:
   ```typescript
   // endpoints/search.ts
   mockResolver: async ({ db }) => {
     const users = db.user.findMany(...);  // Works!
     const posts = db.post.findMany(...);  // Works!
   }
   ```

### Configuration

A single glob pattern discovers everything:

```typescript
// schemock.config.ts
export default {
  schemas: './src/schemas/**/*.ts',  // Catches all subdirectories
  output: './src/generated',
  // ...
};
```

### Cross-File Example

```typescript
// entities/user.ts
export const User = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  // Relations are defined inline with fields
  posts: hasMany('post', { foreignKey: 'authorId' }),
});

// entities/post.ts (separate file)
export const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),  // Foreign key field
  // Relations are defined inline with fields
  author: belongsTo('user', { foreignKey: 'authorId' }),
});

// endpoints/stats.ts (separate file)
export const StatsEndpoint = defineEndpoint('/api/stats', {
  mockResolver: async ({ db }) => ({
    userCount: db.user.count(),   // Access User entity
    postCount: db.post.count(),   // Access Post entity
  }),
});
```

All three files are discovered, merged, and work together seamlessly.

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

### Entity Tagging

Tags provide flexible, freeform categorization for filtering entities across targets. Unlike `entities`/`excludeEntities` which use explicit names, tags let you organize schemas by domain, access level, or any custom taxonomy.

**Adding tags to schemas:**

```typescript
const User = defineData('user', {
  id: field.uuid(),
  email: field.email(),
}, {
  tags: ['auth', 'public', 'core'],
  module: 'identity',
  group: 'public',
});

const AuditLog = defineData('auditLog', {
  id: field.uuid(),
  action: field.string(),
}, {
  tags: ['internal', 'compliance'],
  module: 'security',
  group: 'internal',
});
```

**Filtering by tags in targets:**

```typescript
targets: [
  {
    name: 'public-api',
    type: 'nextjs-api',
    output: './src/app/api/public',
    tags: ['public'],           // Include entities with 'public' tag
    excludeTags: ['internal'],  // Exclude entities with 'internal' tag
  },
  {
    name: 'admin-dashboard',
    type: 'mock',
    output: './src/generated/admin',
    module: 'security',         // Only entities in 'security' module
  },
  {
    name: 'auth-service',
    type: 'node-handlers',
    output: './src/auth/handlers',
    tags: ['auth'],
    group: 'public',
  },
]
```

#### Common Tagging Patterns

Tags are freeform strings - use whatever fits your project. Here are patterns others find useful:

**By access level:**
```typescript
tags: ['public']      // Exposed to external clients
tags: ['internal']    // Internal services only
tags: ['admin-only']  // Admin dashboard only
```

**By feature area:**
```typescript
tags: ['auth']        // Authentication/authorization
tags: ['billing']     // Payment and subscriptions
tags: ['content']     // User-generated content
tags: ['analytics']   // Metrics and reporting
```

**By lifecycle:**
```typescript
tags: ['stable']       // Production-ready
tags: ['experimental'] // Beta features
tags: ['deprecated']   // Scheduled for removal
```

**By team ownership:**
```typescript
tags: ['team-platform']  // Platform team owns this
tags: ['team-growth']    // Growth team owns this
```

**Combined example:**
```typescript
const Payment = defineData('payment', { /* ... */ }, {
  tags: ['billing', 'internal', 'stable'],
  module: 'billing',
  group: 'internal',
  metadata: {
    owner: 'payments-team',
    pii: true,
  },
});
```

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

### ⚠️ Warning: Do Not Modify Generated Files

**NEVER edit files in `src/generated/` directly.** These files are auto-generated and will be overwritten on next `npx schemock generate`.

To make changes:
1. Edit your schema files in `src/schemas/`
2. Run `npx schemock generate`
3. Your changes will be reflected in the regenerated output

If you find a bug in generated code, please [report it](https://github.com/prajyot-tote/schemock/issues) rather than editing the output directly.

## Mock Client - Authentication & Error Handling

The generated mock client uses a production-ready **interceptor pattern** for centralized auth and error handling - just like axios interceptors or fetch wrappers in real applications.

### Setup (Configure Once)

```typescript
import { createClient } from './generated/client';
import { createMockJwt } from 'schemock/middleware';

// Configure at app startup (e.g., in _app.tsx or main.tsx)
export const api = createClient({
  // Runs before every API call - add auth headers here
  onRequest: (ctx) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      ctx.headers.Authorization = `Bearer ${token}`;
    }
    return ctx;
  },

  // Centralized error handling
  onError: (error) => {
    if (error.status === 401) {
      // Token expired - redirect to login
      window.location.href = '/login';
    }
    if (error.status === 403) {
      // Access denied - show notification
      toast.error('Access denied');
    }
    if (error.status === 404) {
      // Not found
      toast.error('Resource not found');
    }
  }
});
```

### Usage (Auth is Automatic)

```typescript
// Auth headers are automatically added to every request
const posts = await api.post.list();
const user = await api.user.get('123');
await api.post.create({ title: 'Hello', authorId: '123' });
```

### Using with React Hooks (SchemockProvider)

To use the configured client with generated React hooks, wrap your app with `SchemockProvider`:

```tsx
import { SchemockProvider, createClient, useUsers, useCreateUser } from './generated';

// 1. Create configured client
const api = createClient({
  onRequest: (ctx) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      ctx.headers.Authorization = `Bearer ${token}`;
    }
    return ctx;
  },
  onError: (error) => {
    if (error.status === 401) window.location.href = '/login';
  }
});

// 2. Wrap your app
function App() {
  return (
    <SchemockProvider client={api}>
      <UserList />
    </SchemockProvider>
  );
}

// 3. Hooks automatically use the configured client
function UserList() {
  const { data, isLoading } = useUsers();
  const createUser = useCreateUser();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {data?.data.map(user => <div key={user.id}>{user.name}</div>)}
      <button onClick={() => createUser.mutate({ name: 'New User' })}>
        Add User
      </button>
    </div>
  );
}
```

Without `SchemockProvider`, hooks use the default unconfigured client (no auth).

### Creating Mock JWT Tokens

For testing different user contexts:

```typescript
import { createMockJwt } from 'schemock/middleware';

// Create a token for a regular user
const userToken = createMockJwt({ userId: 'user-123', role: 'user' });

// Create a token for an admin (bypasses RLS)
const adminToken = createMockJwt({ userId: 'admin-1', role: 'admin' });

// Set in localStorage or pass directly
localStorage.setItem('authToken', userToken);
```

### API Error Handling

The `ApiError` class provides HTTP-like status codes:

```typescript
import { ApiError } from './generated/client';

try {
  await api.post.get('non-existent-id');
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.status);    // 404
    console.log(error.code);      // "NOT_FOUND"
    console.log(error.operation); // "post.get"
    console.log(error.message);   // "Post not found: non-existent-id"
  }
}
```

| Status | Code | When |
|--------|------|------|
| 403 | `RLS_DENIED` | Row-level security blocked the operation |
| 404 | `NOT_FOUND` | Entity not found |
| 500 | `INTERNAL_ERROR` | Unexpected error |

### Simple Usage (No Auth)

For quick prototyping without auth, use the default client:

```typescript
import { api } from './generated/client';

// Works immediately - no configuration needed
const users = await api.user.list();
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

## Reporting Issues

Found a bug or have a feature request?

**GitHub Issues**: https://github.com/prajyot-tote/schemock/issues

When reporting bugs, please include:
1. Your schema definition (`defineData` calls)
2. The command you ran (`npx schemock generate --adapter X`)
3. Expected vs actual behavior
4. Relevant generated code snippet

**Important**: If you find a bug in generated code, please report it rather than editing the generated files directly. The fix needs to be in the generator.

## License

MIT
