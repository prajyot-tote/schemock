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
# Generate mock adapter code (development)
npx schemock generate --adapter mock

# Generate Supabase adapter code (production)
npx schemock generate --adapter supabase

# Generate for multiple targets
npx schemock generate  # uses schemock.config.ts targets
```

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

### Generated Files - DO NOT MODIFY

The following directories contain auto-generated code. **NEVER edit these files directly.**
Changes will be overwritten on next `npx schemock generate`.

- `./src/generated/**/*`
- `./src/generated/api/**/*`
- `./src/generated/node/**/*`
- `./src/generated/supabase/**/*`

### How to Make Changes

To modify generated types, hooks, or clients:

1. **Edit schema files** in `./src/schemas/`
2. **Run generation**: `npx schemock generate`
3. **Import from generated directory**

### Schema DSL Quick Reference

```typescript
import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user']).default('user'),
  avatar: field.url().nullable(),
  createdAt: field.timestamp().default(new Date()),
});

export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  content: field.text(),
  authorId: field.ref('user'),
}, {
  relations: {
    author: belongsTo('user', 'authorId'),
  },
});
```

### Available Field Types

| Type | Description | Example |
|------|-------------|---------|
| `field.uuid()` | UUID primary key | `id: field.uuid()` |
| `field.string()` | Text string | `name: field.string()` |
| `field.text()` | Long text | `content: field.text()` |
| `field.email()` | Email address | `email: field.email()` |
| `field.url()` | URL string | `avatar: field.url()` |
| `field.int()` | Integer number | `age: field.int()` |
| `field.float()` | Decimal number | `price: field.float()` |
| `field.boolean()` | True/false | `active: field.boolean()` |
| `field.enum([...])` | Enum values | `status: field.enum(['draft', 'published'])` |
| `field.timestamp()` | Date/time | `createdAt: field.timestamp()` |
| `field.date()` | Date only | `birthDate: field.date()` |
| `field.ref('entity')` | Foreign key | `authorId: field.ref('user')` |
| `field.json()` | JSON object | `metadata: field.json()` |

### Field Modifiers

- `.nullable()` - Field can be null
- `.default(value)` - Default value
- `.unique()` - Must be unique
- `.index()` - Create database index

### Relations

```typescript
import { hasMany, belongsTo, hasOne, manyToMany } from 'schemock/schema';

// One-to-many: User has many Posts
hasMany('post', 'authorId')

// Many-to-one: Post belongs to User
belongsTo('user', 'authorId')

// One-to-one: User has one Profile
hasOne('profile', 'userId')

// Many-to-many: Post has many Tags
manyToMany('tag', 'post_tags')
```

### Common Tasks

| Task | What to do |
|------|------------|
| Add new entity | Create new schema file in `src/schemas/`, run `npx schemock generate` |
| Add field | Edit schema file, run `npx schemock generate` |
| Add relation | Add to schema `relations` object, run `npx schemock generate` |
| Change field type | Edit schema file, run `npx schemock generate` |
| Fix generated code bug | Report issue, don't edit generated files |

### CLI Commands

```bash
# Generate all code from schemas
npx schemock generate

# Generate for specific adapter
npx schemock generate --adapter supabase

# Generate SQL migrations
npx schemock generate:sql

# Dry run (show what would be generated)
npx schemock generate --dry-run
```

<!-- SCHEMOCK:END -->
