# Schemock 🍀

> Schema-first mocking for frontend developers

**Define once. Mock instantly. Ship faster.**

## What is Schemock?

Schemock flips the traditional API development workflow. Instead of waiting for backend APIs, frontend developers define their data needs upfront and get:

- ✅ **Instant working mocks** - Full CRUD with persistence
- ✅ **Type-safe API client** - Generated from your schema
- ✅ **OpenAPI export** - Hand off to backend team
- ✅ **Zero production overhead** - 99.3% bundle reduction via compile-time elimination

## Quick Start

```bash
npm install schemock
npx schemock init
```

Define your schema:

```typescript
// src/schemas/index.ts
import { defineData, field, hasMany } from 'schemock/schema';

export const User = defineData('user', {
  id: field.uuid(),
  name: field.person.fullName(),
  email: field.internet.email(),
  posts: hasMany('post'),
});

export const Post = defineData('post', {
  id: field.uuid(),
  title: field.lorem.sentence(),
  authorId: field.ref('user'),
});
```

Generate everything:

```bash
npx schemock generate
```

Use in your app:

```typescript
import { useData, useMutate } from 'schemock/react';
import { User } from './schemas';

function UserList() {
  const { data: users, loading } = useData(User);
  const { create } = useMutate(User);

  // Full CRUD works instantly - no backend needed!
}
```

## Why Schemock?

| Traditional | With Schemock |
|-------------|---------------|
| Wait for backend API | Start building immediately |
| Write mock handlers manually | Auto-generated from schema |
| Mock code ships to production | Compile-time eliminated (99.3% reduction) |
| FE/BE contracts drift | Schema is single source of truth |

## Documentation

See the [design docs](./design/) for detailed architecture and implementation plans.

## Status

🚧 **In Development** - Not ready for production use yet.

## License

MIT
