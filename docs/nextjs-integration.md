# Next.js App Router Integration

Schemock generates fully-typed Next.js App Router API routes from your schema definitions. This guide covers setup, configuration, and best practices.

## Quick Start

### 1. Configure the Target

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  targets: [
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
  ],

  adapters: {
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
  },
});
```

### 2. Generate Routes

```bash
npx schemock generate
```

### 3. Use the API

Your API routes are now available:

```
GET    /api/users        # List all users
POST   /api/users        # Create user
GET    /api/users/:id    # Get user by ID
PUT    /api/users/:id    # Update user
DELETE /api/users/:id    # Delete user
```

---

## Generated File Structure

```
src/app/api/
├── _lib/                    # Shared library code
│   ├── types.ts             # TypeScript types from schemas
│   ├── auth.ts              # Auth middleware
│   ├── validate.ts          # Validation middleware
│   ├── supabase.ts          # Supabase client
│   ├── chain.ts             # Middleware chain (v1.0 config)
│   ├── endpoint-types.ts    # Custom endpoint types
│   └── custom/              # Custom middleware files
│       └── tenant.ts
├── users/
│   ├── route.ts             # GET /api/users, POST /api/users
│   └── [id]/
│       └── route.ts         # GET/PUT/DELETE /api/users/:id
├── posts/
│   ├── route.ts
│   └── [id]/route.ts
├── search/                  # Custom endpoint routes
│   └── route.ts
└── _seed/                   # Production seed route (optional)
    └── route.ts
```

---

## Library Files (`_lib/`)

### types.ts

TypeScript types generated from your schemas:

```typescript
// Auto-generated - DO NOT EDIT
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role?: 'admin' | 'user' | 'guest';
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: 'admin' | 'user' | 'guest';
}

// ... more types
```

### auth.ts

Authentication middleware based on your config:

```typescript
// For supabase-auth provider
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
}

export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const supabase = createClient(/* ... */);
  const { data: { user }, error } = await supabase.auth.getUser(
    request.headers.get('Authorization')?.replace('Bearer ', '')
  );

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handler(request, {
    userId: user.id,
    email: user.email!,
    role: user.role || 'user',
  });
}
```

### validate.ts

Request validation generated from schema constraints:

```typescript
// Auto-generated validation
export function validateCreateUser(data: unknown): CreateUserInput {
  // Validates:
  // - email: required, email format
  // - name: required, string, min 1 char
  // - role: optional, enum ['admin', 'user', 'guest']
}

export function validateUpdateUser(data: unknown): UpdateUserInput {
  // Partial validation - all fields optional
}
```

### supabase.ts

Database client initialization:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type { Database } from './types';
```

---

## Route Handlers

### Collection Route (`route.ts`)

Handles list and create operations:

```typescript
// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../_lib/supabase';
import { withAuth } from '../_lib/auth';
import { validateCreateUser } from '../_lib/validate';

// GET /api/users - List all users
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  });
}

// POST /api/users - Create user
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validated = validateCreateUser(body);

    const { data, error } = await supabase
      .from('users')
      .insert(validated)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  });
}
```

### Dynamic Route (`[id]/route.ts`)

Handles single-entity operations:

```typescript
// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../_lib/supabase';
import { withAuth } from '../../_lib/auth';
import { validateUpdateUser } from '../../_lib/validate';

// GET /api/users/:id
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, ctx) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  });
}

// PUT /api/users/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validated = validateUpdateUser(body);

    const { data, error } = await supabase
      .from('users')
      .update(validated)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  });
}

// DELETE /api/users/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, ctx) => {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  });
}
```

---

## Middleware Configuration

### Auth Providers

Configure authentication based on your auth solution:

```typescript
middleware: {
  auth: {
    provider: 'supabase-auth',  // Use Supabase Auth
    required: true,              // All routes require auth
    skip: ['/api/health', '/api/public/*'],  // Skip these paths
  },
}
```

| Provider | Description | Config |
|----------|-------------|--------|
| `supabase-auth` | Supabase JWT tokens | Uses `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `jwt` | Standard JWT | Requires `secretEnvVar` |
| `nextauth` | NextAuth.js sessions | Uses NextAuth session |
| `clerk` | Clerk authentication | Uses Clerk SDK |
| `custom` | Custom handler | Requires `customHandler` path |

### JWT Configuration

```typescript
middleware: {
  auth: {
    provider: 'jwt',
    secretEnvVar: 'JWT_SECRET',
    required: true,
  },
}
```

### Custom Auth Handler

```typescript
middleware: {
  auth: {
    provider: 'custom',
    customHandler: './src/middleware/my-auth.ts',
  },
}
```

Your custom handler:

```typescript
// src/middleware/my-auth.ts
import { NextRequest, NextResponse } from 'next/server';

export interface AuthContext {
  userId: string;
  // Add your custom fields
}

export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  // Your auth logic here
  const token = request.headers.get('Authorization');
  // Validate token...

  return handler(request, { userId: 'validated-user-id' });
}
```

### Validation

Enable validation middleware to validate requests against schema constraints:

```typescript
middleware: {
  validation: true,
}
```

This generates validation functions from your field definitions:

```typescript
// Schema
const User = defineData('user', {
  email: field.email(),
  name: field.string().min(1).max(100),
  age: field.number({ min: 0, max: 150 }),
});

// Generated validation
// - email: valid email format
// - name: 1-100 characters
// - age: 0-150 range
```

### Rate Limiting

```typescript
middleware: {
  rateLimit: {
    max: 100,        // Max requests
    windowMs: 60000, // Per minute
    keyGenerator: 'ip',  // 'ip' | 'user' | 'custom'
  },
}
```

### Complete Middleware Chain

```typescript
middleware: {
  // Execution order
  chain: ['auth', 'rateLimit', 'logger', 'context', 'validation', 'rls'],

  auth: {
    provider: 'supabase-auth',
    required: true,
  },

  rateLimit: {
    max: 100,
    windowMs: 60000,
  },

  logger: {
    level: 'info',
    redactFields: ['password', 'token'],
  },

  context: true,  // Extract context from JWT

  validation: true,

  rls: true,  // Enable RLS filtering

  // Custom middleware files
  custom: ['./src/middleware/tenant.ts'],
}
```

---

## Custom Endpoints

Custom endpoints defined with `defineEndpoint` are also generated as routes:

```typescript
// src/schemas/endpoints.ts
import { defineEndpoint, field } from 'schemock/schema';

export const SearchEndpoint = defineEndpoint('/api/search', {
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
      type: field.string(),
    })),
    total: field.number({ int: true }),
  },
  mockResolver: async ({ params, db }) => {
    // Mock implementation
    return { results: [], total: 0 };
  },
});
```

Generated route:

```typescript
// src/app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';
  const limit = parseInt(searchParams.get('limit') || '20');

  // Implementation based on your resolver
  const results = await performSearch({ q, type, limit });

  return NextResponse.json(results);
}
```

---

## Production Seed Route

If `productionSeed` is configured, a `/_seed` route is generated:

```typescript
// schemock.config.ts
export default defineConfig({
  // ...
  productionSeed: {
    dataPath: './src/seed-data.ts',
  },
});
```

```typescript
// src/seed-data.ts
import { ref } from 'schemock/seed';

export const seedConfig = {
  secret: process.env.SEED_SECRET,
  data: {
    users: [
      { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    ],
    posts: [
      { title: 'Welcome', authorId: ref('users', 0) },
    ],
  },
};
```

Generated route at `POST /api/_seed`:

```typescript
// Requires secret in request body
await fetch('/api/_seed', {
  method: 'POST',
  body: JSON.stringify({ secret: 'your-seed-secret' }),
});
```

---

## Backend Options

### Supabase Backend

```typescript
{
  type: 'nextjs-api',
  backend: 'supabase',
}

// Config
adapters: {
  supabase: {
    envPrefix: 'NEXT_PUBLIC_SUPABASE',
    // Uses: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  },
}
```

### Firebase Backend

```typescript
{
  type: 'nextjs-api',
  backend: 'firebase',
}
```

### PGlite Backend

```typescript
{
  type: 'nextjs-api',
  backend: 'pglite',
}
```

---

## Environment Variables

Required environment variables based on backend:

### Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### JWT Auth

```env
JWT_SECRET=your-secret-key
```

### Production Seed

```env
SEED_SECRET=your-seed-secret
```

---

## Entity Filtering

Generate routes for specific entities only:

```typescript
{
  type: 'nextjs-api',
  output: './src/app/api',

  // By entity name
  entities: ['user', 'post'],
  excludeEntities: ['auditLog'],

  // By tags
  tags: ['public'],
  excludeTags: ['internal'],

  // By module
  module: 'auth',
}
```

**Note:** Types are always generated for all entities to preserve relations. Only routes are filtered.

---

## Full Configuration Example

```typescript
// schemock.config.ts
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  apiPrefix: '/api',

  targets: [
    // Next.js API routes
    {
      name: 'api',
      type: 'nextjs-api',
      output: './src/app/api',
      backend: 'supabase',

      // Entity filtering
      excludeEntities: ['systemLog'],
      excludeTags: ['internal'],

      // Middleware
      middleware: {
        chain: ['auth', 'rateLimit', 'logger', 'validation'],

        auth: {
          provider: 'supabase-auth',
          required: true,
          skip: ['/api/health', '/api/public/*'],
        },

        rateLimit: {
          max: 100,
          windowMs: 60000,
        },

        logger: {
          level: 'info',
          includeBody: false,
          redactFields: ['password', 'token', 'secret'],
        },

        validation: true,

        custom: ['./src/middleware/tenant.ts'],
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

  adapters: {
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
    mock: {
      seed: { user: 10, post: 50 },
      delay: 100,
    },
  },

  productionSeed: {
    dataPath: './src/seed-data.ts',
  },
});
```

---

## Related Documentation

- [Generation Targets](./targets.md) - All available targets
- [Middleware Reference](./middleware/README.md) - Detailed middleware docs
- [Custom Endpoints](../README.md#custom-endpoints) - Defining custom API endpoints
