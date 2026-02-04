# Generation Targets

Schemock supports **multi-target generation** - generating multiple outputs from a single schema definition. This allows you to generate client SDKs, server API routes, and database handlers all at once.

## Target Categories

### Client Targets

Client targets generate code that runs in the browser or client-side applications:

| Target | Description | Use Case |
|--------|-------------|----------|
| `mock` | In-memory mock database with MSW handlers | Development, prototyping, offline-first apps |
| `supabase` | Supabase client SDK | Production with Supabase backend |
| `firebase` | Firebase/Firestore client | Production with Firebase backend |
| `fetch` | Generic REST client | Any REST API backend |
| `pglite` | PostgreSQL in the browser (PGlite) | Offline-first with real SQL |
| `graphql` | GraphQL client (Apollo) | GraphQL backends |

### Server Targets

Server targets generate API route handlers and server-side code:

| Target | Description | Use Case |
|--------|-------------|----------|
| `nextjs-api` | Next.js App Router API routes | Next.js 13+ applications |
| `nextjs-edge` | Next.js Edge Runtime | Edge-deployed Next.js APIs |
| `node-handlers` | Generic Node.js handlers | Express, Koa, Fastify |
| `express` | Express.js routes | Express applications |
| `hono` | Hono edge framework | Edge-first applications |
| `supabase-edge` | Supabase Edge Functions | Supabase serverless functions |
| `neon` | Neon serverless PostgreSQL | Neon database serverless |

---

## Basic Configuration

### Single Target (Legacy)

For simple projects with a single adapter:

```typescript
// schemock.config.ts
export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',  // Single target
});
```

### Multi-Target Configuration

Generate multiple outputs from one schema:

```typescript
// schemock.config.ts
export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',

  targets: [
    // Client SDK for frontend
    {
      name: 'client',
      type: 'supabase',
      output: './src/generated/supabase',
    },
    // Next.js API routes
    {
      name: 'api',
      type: 'nextjs-api',
      output: './src/app/api',
      backend: 'supabase',
      middleware: {
        auth: { provider: 'supabase-auth' },
        validation: true,
      },
    },
    // Mock for development
    {
      name: 'mock',
      type: 'mock',
      output: './src/generated/mock',
      framework: 'react',
    },
  ],
});
```

---

## Entity Filtering

Control which entities are generated for each target. This is useful for:
- Generating public APIs vs internal admin APIs
- Separating concerns by domain
- Reducing bundle size for specific targets

### Filtering Options

| Option | Type | Description |
|--------|------|-------------|
| `entities` | `string[]` | Only include these entities (by name) |
| `excludeEntities` | `string[]` | Exclude these entities |
| `tags` | `string[]` | Include entities with any of these tags (OR logic) |
| `excludeTags` | `string[]` | Exclude entities with any of these tags |
| `module` | `string` | Include only entities from this module |
| `group` | `string` | Include only entities from this group |

### Entity Filtering by Name

```typescript
targets: [
  // Public API - only User and Post
  {
    name: 'public-api',
    type: 'nextjs-api',
    output: './src/app/api/public',
    entities: ['user', 'post'],  // Only these entities
  },
  // Admin API - everything except audit logs
  {
    name: 'admin-api',
    type: 'node-handlers',
    output: './src/admin/api',
    excludeEntities: ['auditLog', 'systemLog'],
  },
]
```

### CLI Override

Filter entities at generation time:

```bash
# Only generate for specific entities
npx schemock generate --only user,post

# Exclude entities from generation
npx schemock generate --exclude audit,log

# Combine with target
npx schemock generate --adapter supabase --only user,post
```

---

## Tag-Based Filtering

Tags provide flexible, freeform categorization for entities. Unlike explicit entity lists, tags let you organize schemas by domain, access level, or any custom taxonomy.

### Adding Tags to Schemas

```typescript
import { defineData, field } from 'schemock/schema';

export const User = defineData('user', {
  id: field.uuid(),
  email: field.email(),
  name: field.string(),
}, {
  // Freeform tags for categorization
  tags: ['auth', 'public', 'core'],
  // Module grouping (exact match)
  module: 'identity',
  // Logical grouping
  group: 'public',
  // Custom metadata
  metadata: {
    owner: 'platform-team',
    pii: true,
  },
});

export const AuditLog = defineData('auditLog', {
  id: field.uuid(),
  action: field.string(),
  timestamp: field.date(),
}, {
  tags: ['internal', 'compliance', 'logging'],
  module: 'security',
  group: 'internal',
});
```

### Filtering by Tags

```typescript
targets: [
  // Public-facing API - only entities tagged 'public'
  {
    name: 'public-api',
    type: 'nextjs-api',
    output: './src/app/api/public',
    tags: ['public'],           // Include if has 'public' tag
    excludeTags: ['internal'],  // Exclude if has 'internal' tag
  },
  // Security module only
  {
    name: 'security-handlers',
    type: 'node-handlers',
    output: './src/security/handlers',
    module: 'security',  // Only entities in 'security' module
  },
  // Internal group with auth tag
  {
    name: 'internal-auth',
    type: 'node-handlers',
    output: './src/internal/auth',
    tags: ['auth'],
    group: 'internal',
  },
]
```

### Tag Matching Behavior

- **`tags`**: OR logic - entity must have at least one matching tag
- **`excludeTags`**: Any match excludes - entity is excluded if it has any excluded tag
- **`module`**: Exact match - entity module must equal target module
- **`group`**: Exact match - entity group must equal target group

### Common Tag Patterns

```typescript
// By access level
tags: ['public']       // External clients
tags: ['internal']     // Internal services only
tags: ['admin-only']   // Admin dashboard only

// By feature area
tags: ['auth']         // Authentication/authorization
tags: ['billing']      // Payment and subscriptions
tags: ['content']      // User-generated content

// By lifecycle
tags: ['stable']       // Production-ready
tags: ['experimental'] // Beta features
tags: ['deprecated']   // Scheduled for removal

// By team ownership
tags: ['team-platform']
tags: ['team-growth']
```

---

## Target Type Reference

### `mock`

In-memory mock database using [@mswjs/data](https://github.com/mswjs/data).

**Generated Files:**
- `types.ts` - TypeScript types
- `db.ts` - @mswjs/data factory
- `client.ts` - API client with interceptor pattern
- `handlers.ts` - MSW request handlers
- `seed.ts` - Seed and reset utilities
- `hooks.ts` (with `framework: 'react'`)
- `provider.tsx` (with `framework: 'react'`)

**Options:**
```typescript
{
  type: 'mock',
  framework: 'react',  // Generate React hooks
}
```

### `supabase`

Supabase client with type-safe operations.

**Generated Files:**
- `types.ts` - TypeScript types
- `client.ts` - Supabase client with interceptor pattern
- `endpoints.ts` (if custom endpoints defined)

**Options:**
```typescript
{
  type: 'supabase',
  // Adapter config from adapters.supabase
}
```

### `pglite`

Real PostgreSQL in the browser using [PGlite](https://pglite.dev/).

**Generated Files:**
- `types.ts` - TypeScript types
- `db.ts` - PGlite database setup
- `client.ts` - API client
- `handlers.ts` - MSW handlers
- `seed.ts` - Seed utilities

**Options:**
```typescript
{
  type: 'pglite',
  // Uses adapters.pglite config
}
```

### `nextjs-api`

Next.js App Router API routes. See [Next.js Integration](./nextjs-integration.md) for details.

**Generated Files:**
```
output/
├── _lib/
│   ├── types.ts      # TypeScript types
│   ├── auth.ts       # Auth middleware
│   ├── validate.ts   # Validation middleware
│   └── supabase.ts   # Database client
├── users/
│   ├── route.ts      # GET /api/users, POST /api/users
│   └── [id]/
│       └── route.ts  # GET/PUT/DELETE /api/users/:id
└── posts/
    ├── route.ts
    └── [id]/route.ts
```

**Options:**
```typescript
{
  type: 'nextjs-api',
  backend: 'supabase',  // Database backend
  middleware: {
    auth: { provider: 'supabase-auth' },
    validation: true,
    rateLimit: { max: 100, windowMs: 60000 },
  },
}
```

### `node-handlers`

Generic Node.js handlers compatible with Express, Koa, Fastify.

**Generated Files:**
```
output/
├── types.ts         # TypeScript types
├── db.ts            # Database client
├── router.ts        # Express-compatible router
├── index.ts         # Barrel exports
├── middleware/
│   ├── auth.ts      # JWT authentication
│   └── validate.ts  # Request validation
└── handlers/
    ├── users.ts     # User CRUD handlers
    └── posts.ts     # Post CRUD handlers
```

**Options:**
```typescript
{
  type: 'node-handlers',
  backend: 'supabase',
  middleware: {
    auth: { provider: 'jwt', secretEnvVar: 'JWT_SECRET' },
    validation: true,
  },
}
```

### `supabase-edge`

Supabase Edge Functions for serverless deployment.

**Generated Files:**
```
output/
├── _shared/
│   ├── types.ts     # TypeScript types
│   ├── db.ts        # Supabase client
│   └── middleware.ts
├── users/
│   └── index.ts     # User function
└── posts/
    └── index.ts     # Post function
```

### `neon`

Neon serverless PostgreSQL handlers.

**Generated Files:**
- Handler files optimized for Neon's serverless driver
- Connection pooling configuration

---

## Framework Option

The `framework` option controls whether React-specific files are generated:

| Value | Output |
|-------|--------|
| `none` (default) | `types.ts`, `client.ts`, `db.ts` |
| `react` | Above + `hooks.ts`, `provider.tsx` |

```typescript
targets: [
  {
    name: 'react-app',
    type: 'mock',
    output: './src/generated/mock',
    framework: 'react',  // Generates hooks and provider
  },
  {
    name: 'vanilla-client',
    type: 'supabase',
    output: './src/generated/supabase',
    framework: 'none',   // No React files
  },
]
```

Or via CLI:

```bash
# With React hooks
npx schemock generate --framework react

# Framework-agnostic (default)
npx schemock generate
```

---

## Middleware Configuration

Server targets can include middleware for authentication, validation, rate limiting, and more:

```typescript
{
  type: 'nextjs-api',
  middleware: {
    // Auth middleware
    auth: {
      provider: 'supabase-auth',  // or 'jwt', 'nextauth', 'clerk'
      required: true,
      skip: ['/api/health', '/api/public/*'],
    },

    // Validation from schema constraints
    validation: true,

    // Rate limiting
    rateLimit: {
      max: 100,
      windowMs: 60000,
    },

    // Middleware chain order
    chain: ['auth', 'logger', 'context', 'rls', 'cache'],
  },
}
```

### Auth Providers

| Provider | Description |
|----------|-------------|
| `supabase-auth` | Supabase JWT validation |
| `jwt` | Standard JWT with secret |
| `nextauth` | NextAuth.js sessions |
| `clerk` | Clerk authentication |
| `custom` | Custom handler file |

---

## Complete Example

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  targets: [
    // Frontend mock for development
    {
      name: 'dev-mock',
      type: 'mock',
      output: './src/generated/mock',
      framework: 'react',
    },

    // Production Supabase client
    {
      name: 'supabase-client',
      type: 'supabase',
      output: './src/generated/supabase',
    },

    // Public API (only public entities)
    {
      name: 'public-api',
      type: 'nextjs-api',
      output: './src/app/api',
      backend: 'supabase',
      tags: ['public'],
      excludeTags: ['internal', 'admin'],
      middleware: {
        auth: { provider: 'supabase-auth', required: false },
        validation: true,
        rateLimit: { max: 60, windowMs: 60000 },
      },
    },

    // Admin API (internal entities)
    {
      name: 'admin-api',
      type: 'node-handlers',
      output: './src/admin/handlers',
      backend: 'supabase',
      tags: ['admin', 'internal'],
      middleware: {
        auth: { provider: 'jwt', secretEnvVar: 'ADMIN_JWT_SECRET' },
        validation: true,
      },
    },
  ],

  adapters: {
    mock: {
      seed: { user: 10, post: 50 },
      delay: 100,
    },
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
  },
});
```

---

## Related Documentation

- [Next.js Integration](./nextjs-integration.md) - Detailed guide for Next.js API generation
- [SQL Generation](./sql-generation.md) - Generate PostgreSQL schemas
- [Middleware](./middleware/README.md) - Middleware configuration reference
