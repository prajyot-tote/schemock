# Core Architecture

## System Overview

Schemock uses a **code generation** architecture. The CLI reads schema files and generates
adapter-specific code. No Babel plugins or runtime transformations are needed.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SCHEMOCK ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         SCHEMA FILES                                  │ │
│  │                                                                       │ │
│  │   // schemas/user.ts                                                  │ │
│  │   export const User = defineData('user', {                            │ │
│  │     id: field.uuid(),                                                 │ │
│  │     name: field.person.fullName(),                                    │ │
│  │     email: field.internet.email(),                                    │ │
│  │     posts: hasMany('post'),                                           │ │
│  │   });                                                                 │ │
│  │                                                                       │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│                                  ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      CLI CODE GENERATOR                               │ │
│  │                                                                       │ │
│  │   npx schemock generate --adapter mock|supabase|firebase|fetch        │ │
│  │                                                                       │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│              ┌───────────────────┴───────────────────┐                     │
│              │                                       │                      │
│              ▼                                       ▼                      │
│  ┌─────────────────────────┐          ┌─────────────────────────┐         │
│  │     MOCK ADAPTER        │          │   PRODUCTION ADAPTER    │         │
│  │                         │          │                         │         │
│  │  Generated files:       │          │  Generated files:       │         │
│  │  ├── types.ts           │          │  ├── types.ts           │         │
│  │  ├── db.ts (@mswjs/data)│          │  ├── client.ts          │         │
│  │  ├── handlers.ts (MSW)  │          │  ├── hooks.ts           │         │
│  │  ├── client.ts          │          │  └── index.ts           │         │
│  │  ├── seed.ts            │          │                         │         │
│  │  ├── hooks.ts           │          │  NO faker, NO mswjs/data│         │
│  │  └── index.ts           │          │  Just API calls         │         │
│  │                         │          │                         │         │
│  │  Includes: faker,       │          │  Includes: supabase-js  │         │
│  │  @mswjs/data, MSW       │          │  or firebase or fetch   │         │
│  │                         │          │                         │         │
│  └─────────────────────────┘          └─────────────────────────┘         │
│                                                                             │
│  Bundle Reduction: Mock code is never generated for production adapters    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Insight: Generation-Time Adapter Selection

Unlike traditional approaches that use Babel to strip mock code at build time,
Schemock generates **completely different code** for each adapter:

```bash
# Development: generates code with @mswjs/data, faker, MSW handlers
npx schemock generate --adapter mock --output src/generated/mock

# Production: generates code with Supabase client, no mock dependencies
npx schemock generate --adapter supabase --output src/generated/prod
```

**Benefits of this approach:**
1. No Babel/Vite/Webpack plugins needed
2. Works with any bundler
3. Explicit control over what's generated
4. Full IntelliSense in generated code
5. Easy to inspect and debug

## Package Structure

```
schemock/
├── src/
│   ├── schema/                  # Schema DSL (input)
│   │   ├── index.ts            # Public exports
│   │   ├── define-data.ts      # defineData() function
│   │   ├── define-view.ts      # defineView() function
│   │   ├── define-endpoint.ts  # defineEndpoint() function
│   │   ├── field.ts            # Field type builders
│   │   └── relations.ts        # hasOne, hasMany, belongsTo
│   │
│   ├── cli/                     # Code generation CLI
│   │   ├── index.ts            # CLI entry point
│   │   ├── commands/           # CLI commands
│   │   │   └── generate.ts     # Main generate command
│   │   ├── generators/         # Adapter-specific generators
│   │   │   ├── types.ts        # TypeScript types generator
│   │   │   ├── hooks.ts        # React hooks generator
│   │   │   ├── mock/           # Mock adapter generators
│   │   │   │   ├── client.ts   # API client with @mswjs/data
│   │   │   │   ├── db.ts       # Database factory
│   │   │   │   ├── handlers.ts # MSW handlers
│   │   │   │   └── seed.ts     # Seeding utilities
│   │   │   ├── supabase/       # Supabase adapter generators
│   │   │   │   └── client.ts   # Supabase API client
│   │   │   ├── firebase/       # Firebase adapter generators
│   │   │   │   └── client.ts   # Firebase API client
│   │   │   ├── fetch/          # Fetch adapter generators
│   │   │   │   └── client.ts   # Plain fetch API client
│   │   │   └── pglite/         # PGlite adapter generators
│   │   │       ├── client.ts   # SQL-based client
│   │   │       └── db.ts       # PGlite database setup
│   │   └── utils/              # CLI utilities
│   │
│   ├── adapters/               # Runtime adapters (optional use)
│   │   ├── types.ts            # Adapter interface
│   │   ├── mock/               # Mock adapter runtime
│   │   ├── fetch.ts            # Fetch adapter
│   │   ├── supabase.ts         # Supabase adapter
│   │   ├── firebase.ts         # Firebase adapter
│   │   └── graphql.ts          # GraphQL adapter
│   │
│   ├── middleware/             # Middleware system
│   │   ├── types.ts            # Middleware interface
│   │   ├── chain.ts            # Middleware chain executor
│   │   ├── auth.ts             # Authentication middleware
│   │   ├── retry.ts            # Retry with backoff
│   │   ├── cache.ts            # Response caching
│   │   └── logger.ts           # Request/response logging
│   │
│   ├── react/                  # React bindings
│   │   ├── context.ts          # DataLayerProvider
│   │   ├── hooks.ts            # Base hook utilities
│   │   └── index.ts            # Public exports
│   │
│   ├── security/               # Security features
│   │   ├── rls.ts              # Row-level security
│   │   ├── rate-limit.ts       # Rate limiting
│   │   └── audit.ts            # Audit logging
│   │
│   └── storage/                # Storage drivers
│       ├── drivers/            # Storage implementations
│       │   ├── memory.ts       # In-memory storage
│       │   ├── localStorage.ts # Browser localStorage
│       │   └── msw.ts          # MSW-based storage
│       └── types.ts            # Storage interfaces
│
├── cli.ts                      # CLI entry point
└── index.ts                    # Main package exports
```

## Generated Code Structure

When you run `schemock generate`, the output depends on the adapter:

### Mock Adapter Output

```
src/generated/
├── types.ts          # TypeScript interfaces (User, UserCreate, UserUpdate, etc.)
├── db.ts             # @mswjs/data factory with all entities
├── handlers.ts       # MSW request handlers for CRUD operations
├── all-handlers.ts   # Combined handlers export
├── client.ts         # API client that reads/writes to @mswjs/data
├── seed.ts           # Seeding utilities with faker
├── hooks.ts          # React Query hooks (useUsers, useCreateUser, etc.)
└── index.ts          # Barrel export
```

### Supabase Adapter Output

```
src/generated/
├── types.ts          # TypeScript interfaces (same as mock)
├── client.ts         # Supabase client with typed queries
├── hooks.ts          # React Query hooks using Supabase client
└── index.ts          # Barrel export
```

**Note:** No faker, no @mswjs/data, no MSW in production output.

## Data Flow

### Development (Mock Adapter)

```
┌──────────┐     ┌────────────────┐     ┌────────────────┐     ┌────────────┐
│   App    │────▶│ Generated Hook │────▶│ Generated API  │────▶│ @mswjs/data│
│          │     │ useUsers()     │     │ api.user.list()│     │ in-memory  │
└──────────┘     └────────────────┘     └────────────────┘     └────────────┘
                                                │
                                                ▼
                                        ┌────────────────┐
                                        │  RLS Filters   │
                                        │ (generated)    │
                                        └────────────────┘
```

### Production (Supabase Adapter)

```
┌──────────┐     ┌────────────────┐     ┌────────────────┐     ┌────────────┐
│   App    │────▶│ Generated Hook │────▶│ Generated API  │────▶│  Supabase  │
│          │     │ useUsers()     │     │ api.user.list()│     │  Database  │
└──────────┘     └────────────────┘     └────────────────┘     └────────────┘
                                                │
                                                ▼
                                        ┌────────────────┐
                                        │  Supabase RLS  │
                                        │ (server-side)  │
                                        └────────────────┘
```

### Key Difference

- **Mock:** RLS logic is generated into client.ts, runs in browser
- **Production:** RLS is handled by Supabase/Firebase/backend, not in client code

## Multi-Target Generation

For projects that need both mock and production code:

```typescript
// schemock.config.ts
export default {
  schemas: './schemas/**/*.ts',
  targets: [
    {
      name: 'mock',
      adapter: 'mock',
      output: './src/generated/mock',
    },
    {
      name: 'supabase',
      adapter: 'supabase',
      output: './src/generated/supabase',
    },
  ],
};
```

```bash
npx schemock generate
# Generates both targets
```

Then in your app:

```typescript
// Use mock in development
import { api, handlers } from './generated/mock';

// Use supabase in production
import { api } from './generated/supabase';

// Or switch based on environment
const { api } = process.env.NODE_ENV === 'development'
  ? await import('./generated/mock')
  : await import('./generated/supabase');
```

## Beyond MSW: Direct In-Memory Operations

The mock adapter can work in two modes:

### 1. MSW Mode (Network Interception)

```
fetch('/api/users') → MSW Service Worker → Handler → @mswjs/data → Response
```

Use when:
- Testing network behavior
- Want realistic network delays
- Need to see requests in DevTools

### 2. Direct Mode (No Network)

```
api.user.list() → @mswjs/data → Response
```

Use when:
- Faster development iteration
- Unit testing
- SSR/Node.js environments

## PGlite Option

For accurate SQL behavior in development:

```typescript
// schemock.config.ts
export default {
  targets: [
    {
      name: 'mock',
      adapter: 'pglite',  // Real PostgreSQL in browser/Node
      output: './src/generated/mock',
    },
  ],
};
```

Benefits:
- Real SQL execution (joins, aggregations, constraints)
- Identical query patterns to production PostgreSQL
- Accurate error messages for constraint violations

## Dependency Graph

```
schemock (main package)
       │
       ├── CLI (code generation)
       │   └── Reads schemas, outputs adapter-specific code
       │
       ├── Schema DSL (no runtime deps)
       │   └── defineData, field.*, relations
       │
       ├── Generated Mock Code
       │   ├── @mswjs/data (peer)
       │   ├── @faker-js/faker (peer)
       │   └── msw (peer, optional)
       │
       ├── Generated Supabase Code
       │   └── @supabase/supabase-js (peer)
       │
       ├── Generated Firebase Code
       │   └── firebase (peer)
       │
       └── Generated React Hooks
           └── @tanstack/react-query (peer)
```

**Note:** Production adapters have NO dependency on faker, @mswjs/data, or MSW.

## Configuration

### schemock.config.ts

```typescript
import { defineConfig } from 'schemock';

export default defineConfig({
  // Schema discovery
  schemas: './schemas/**/*.ts',

  // Default adapter (can be overridden via CLI)
  adapter: 'mock',

  // Output directory
  output: './src/generated',

  // API prefix for generated routes
  apiPrefix: '/api',

  // Adapter-specific configuration
  adapters: {
    mock: {
      // Seed counts per entity
      seed: {
        user: 10,
        post: 50,
      },
    },
    supabase: {
      // Environment variable prefix
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
    firebase: {
      // Collection name mapping
      collectionMap: {
        user: 'users',
        post: 'posts',
      },
    },
  },

  // Multi-target generation
  targets: [
    { name: 'mock', adapter: 'mock', output: './src/generated/mock' },
    { name: 'prod', adapter: 'supabase', output: './src/generated/prod' },
  ],
});
```

## Error Handling

Generated clients include proper error handling:

```typescript
// Generated mock client
export const api = {
  user: {
    get: async (id: string) => {
      const item = db.user.findFirst({ where: { id: { equals: id } } });
      if (!item) throw new Error('User not found');

      // RLS check (generated from schema)
      const ctx = getContext();
      if (!rlsUserSelect(item, ctx)) {
        throw new RLSError('select', 'User');
      }

      return { data: item };
    },
  },
};

// Generated Supabase client
export const api = {
  user: {
    get: async (id: string) => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return { data };
    },
  },
};
```

## Runtime Adapters (Advanced Use)

For cases where code generation doesn't fit, runtime adapters are still available:

```typescript
import { createMockAdapter, createSupabaseAdapter } from 'schemock/adapters';
import { MiddlewareChain } from 'schemock/middleware';

// Create adapter at runtime
const adapter = process.env.NODE_ENV === 'development'
  ? createMockAdapter({ schema })
  : createSupabaseAdapter({ client: supabase });

// Use with middleware chain
const chain = new MiddlewareChain(adapter);
chain.use(createAuthMiddleware({ getToken: () => localStorage.token }));
chain.use(createRetryMiddleware({ maxRetries: 3 }));

const result = await chain.execute('findMany', { entity: 'user' });
```

**Note:** Most users should prefer the generated code approach.
