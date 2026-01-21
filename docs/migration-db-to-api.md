# Migration Guide: db.* to api.*

This guide helps you migrate from using the internal `db` layer to the public `api` client.

## Version Applicability

| Version | Status |
|---------|--------|
| **v0.1.0+** | This guide applies. Both `db.*` and `api.*` are available. |
| **v0.0.x (alpha)** | `api.*` client may not be fully available in all adapters. Check your generated code. |

**Recommendation:** Starting with v0.1.0, always use `api.*` in UI code for adapter portability.

## Why Migrate?

The `db` layer has different APIs depending on the adapter:
- Mock: `db.user.create()`, `db.user.getAll()` (@mswjs/data)
- PGlite: `db.query('SELECT...')` (raw SQL)
- Supabase: Not generated

The `api` client is **identical** across all adapters, so your UI code works without changes.

## Quick Migration Table

| Before (db.*) | After (api.*) |
|---------------|---------------|
| `db.user.getAll()` | `await api.user.list()` |
| `db.user.findFirst({ where: { id } })` | `await api.user.get(id)` |
| `db.user.create(data)` | `await api.user.create(data)` |
| `db.user.update({ where: { id }, data })` | `await api.user.update(id, data)` |
| `db.user.delete({ where: { id } })` | `await api.user.delete(id)` |
| `db.user.findMany({ where })` | `await api.user.list({ where })` |

## Step-by-Step Migration

### 1. Update Imports

```typescript
// Before
import { db } from './generated';

// After
import { api } from './generated';
// OR with config
import { createClient } from './generated';
const api = createClient({ onRequest, onError });
```

### 2. Update Read Operations

```typescript
// Before
const users = db.user.getAll();
const user = db.user.findFirst({ where: { id: { equals: userId } } });

// After
const { data: users } = await api.user.list();
const { data: user } = await api.user.get(userId);
```

### 3. Update Write Operations

```typescript
// Before
const newUser = db.user.create({ name: 'John', email: 'john@example.com' });

// After
const { data: newUser } = await api.user.create({ name: 'John', email: 'john@example.com' });
```

### 4. Update Filtered Queries

```typescript
// Before
const admins = db.user.findMany({ where: { role: { equals: 'admin' } } });

// After
const { data: admins } = await api.user.list({ where: { role: { equals: 'admin' } } });
```

### 5. Handle Async (Important!)

The `api` client is **async** while `db` methods were sync. Wrap in async functions:

```typescript
// Before (sync)
function loadUsers() {
  const users = db.user.getAll();
  setUsers(users);
}

// After (async)
async function loadUsers() {
  const { data: users } = await api.user.list();
  setUsers(users);
}
```

### 6. With React Hooks (Easiest)

If using React, the generated hooks handle everything:

```typescript
// Before
import { db } from './generated';
function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(() => { setUsers(db.user.getAll()); }, []);
  // ...
}

// After
import { useUsers } from './generated';
function UserList() {
  const { data, isLoading } = useUsers();
  // data?.data contains users array
  // ...
}
```

## Response Format

The `api` client returns standardized responses:

```typescript
// List response
{ data: User[], meta: { total, limit, offset, hasMore } }

// Item response
{ data: User }
```

## When db.* is Still Appropriate

Keep using `db.*` for:
- Custom endpoint `mockResolver` functions (they receive `db` as argument)
- Seed scripts
- Unit tests that need direct data manipulation
