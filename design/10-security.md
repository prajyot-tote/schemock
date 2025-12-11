# Security Architecture

> **New from Session:** Security considerations and implementation patterns

## Security Principles

1. **Defense in Depth** - Multiple layers, not single point
2. **Fail Secure** - Default deny, explicit allow
3. **Least Privilege** - Minimum access needed
4. **Audit Everything** - Track who did what

---

## Security Flow

```
Request
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. VALIDATION                                                   │
│     - Schema validation (Zod)                                   │
│     - Input sanitization                                        │
│     - XSS prevention                                            │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. AUTHENTICATION                                               │
│     - Who is this user?                                         │
│     - Is their session valid?                                   │
│     - JWT verification                                          │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. AUTHORIZATION                                                │
│     - Can they do this action?                                  │
│     - RBAC: Role-based checks                                   │
│     - ABAC: Attribute-based checks                              │
│     - RLS: Row-level security                                   │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. RATE LIMITING                                                │
│     - Per-user limits                                           │
│     - Per-action limits                                         │
│     - Backoff strategies                                        │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. EXECUTION                                                    │
│     - Parameterized queries                                     │
│     - No SQL injection                                          │
│     - Proper error handling                                     │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. AUDIT                                                        │
│     - Log action                                                │
│     - Log user                                                  │
│     - Log result                                                │
│     - Redact sensitive data                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Extended Adapter Set for Security

In addition to the core adapters (Data, Auth, Storage, RPC), production-ready applications need:

### SecurityAdapter

```typescript
interface SecurityAdapter {
  // Validation
  validate<T>(schema: ZodSchema<T>, data: unknown): T;
  sanitize(input: string): string;
  sanitizeHTML(input: string): string;

  // Authorization
  can(action: Action, resource: Resource): boolean;
  canWithContext(action: Action, resource: Resource, context: any): boolean;

  // Rate limiting
  checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult>;
}
```

### AuditAdapter

```typescript
interface AuditAdapter {
  log(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
}

interface AuditEvent {
  id: string;
  type: 'AUTH' | 'DATA_READ' | 'DATA_WRITE' | 'PERMISSION' | 'SECURITY';
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  success: boolean;
  errorCode?: string;
}
```

### CacheAdapter

```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
}
```

---

## Row-Level Security (RLS)

### Schema Definition

```typescript
export const todoSchema = defineSchema('todo', {
  id: field.uuid(),
  title: field.string({ min: 1, max: 200 }),
  userId: field.ref('user'),
}, {
  rls: {
    select: (row, user) => row.userId === user?.id || user?.role === 'admin',
    insert: (row, user) => row.userId === user?.id,
    update: (row, user) => row.userId === user?.id,
    delete: (row, user) => row.userId === user?.id,
  },
});
```

### MockAdapter RLS Implementation

```typescript
class SchemockAdapter {
  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const rawResults = await this.db.query(this.buildSQL(table, options));

    // Apply RLS filter
    const policy = this.rlsPolicies[table]?.select;
    if (!policy) return rawResults.rows;

    return rawResults.rows.filter(row => policy(row, this.authContext));
  }
}
```

---

## Rate Limiting

### Schema Configuration

```typescript
export const todoSchema = defineSchema('todo', {
  // fields...
}, {
  rateLimit: {
    create: { max: 50, windowMs: 60000 },   // 50 creates per minute
    update: { max: 100, windowMs: 60000 },  // 100 updates per minute
    delete: { max: 20, windowMs: 60000 },   // 20 deletes per minute
  },
});
```

### Mock Implementation

```typescript
class MockSecurityAdapter implements SecurityAdapter {
  private rateLimits = new Map<string, { count: number; windowStart: number }>();

  async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.rateLimits.get(key);

    // New window or expired
    if (!entry || now - entry.windowStart > config.windowMs) {
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: config.max - 1 };
    }

    // Over limit
    if (entry.count >= config.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: config.windowMs - (now - entry.windowStart),
      };
    }

    // Increment
    entry.count++;
    return { allowed: true, remaining: config.max - entry.count };
  }
}
```

---

## Authorization Patterns

### Role-Based Access Control (RBAC)

```typescript
const permissions: PermissionConfig = {
  roles: {
    admin: {
      users: ['create', 'read', 'update', 'delete'],
      todos: ['create', 'read', 'update', 'delete'],
      settings: ['read', 'update'],
    },
    user: {
      users: ['read'],
      todos: ['create', 'read', 'update', 'delete'],
      settings: ['read'],
    },
    guest: {
      todos: ['read'],
    },
  },
};
```

### Attribute-Based Access Control (ABAC)

```typescript
const policies: Record<string, Record<string, ABACPolicy>> = {
  todos: {
    read: (user, todo) => todo.userId === user?.id || user?.role === 'admin',
    update: (user, todo) => todo.userId === user?.id || user?.role === 'admin',
    delete: (user, todo) => todo.userId === user?.id,  // Only owner can delete
  },
};
```

---

## Common Vulnerabilities & Prevention

### SQL Injection

```typescript
// BAD - Never do this
const sql = `SELECT * FROM users WHERE id = '${userId}'`;

// GOOD - Parameterized queries
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### XSS (Cross-Site Scripting)

```typescript
// Schema-level sanitization
export const commentSchema = defineSchema('comment', {
  content: field.string({ sanitize: 'html' }),  // Auto-sanitized
});
```

### Insecure Direct Object References

```typescript
// BAD - Trust client-provided user ID
const userId = request.body.userId;
const todos = await dataAdapter.query('todos', { where: { userId } });

// GOOD - Always use server-side user ID
const user = await authAdapter.getUser();
const todos = await dataAdapter.query('todos', { where: { userId: user.id } });
```

---

## Complete Security Schema Example

```typescript
export const todoSchema = defineSchema('todo', {
  // Fields
  id: field.uuid(),
  title: field.string({ min: 1, max: 200, sanitize: true }),
  description: field.string({ max: 2000, sanitize: 'html' }),
  completed: field.boolean({ default: false }),
  priority: field.enum(['low', 'medium', 'high']),
  userId: field.ref('user'),
  createdAt: field.timestamp({ auto: 'create' }),
  updatedAt: field.timestamp({ auto: 'update' }),
}, {
  // Validation
  validation: {
    create: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
    }),
    update: z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional(),
      completed: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
    }),
  },

  // Row-level security
  rls: {
    select: (row, user) => row.userId === user?.id || user?.role === 'admin',
    insert: (row, user) => row.userId === user?.id,
    update: (row, user) => row.userId === user?.id,
    delete: (row, user) => row.userId === user?.id,
  },

  // Rate limits
  rateLimit: {
    create: { max: 50, windowMs: 60000 },
    update: { max: 100, windowMs: 60000 },
    delete: { max: 20, windowMs: 60000 },
  },

  // Audit settings
  audit: {
    create: true,
    update: true,
    delete: true,
    read: false,  // Too noisy usually
  },
});
```

---

## Audit Logging

### What to Log

```typescript
const auditConfig = {
  todos: {
    create: true,
    read: false,   // Too noisy
    update: true,
    delete: true,
  },
  users: {
    create: true,
    read: false,
    update: true,
    delete: true,
  },
};
```

### Sensitive Data Redaction

```typescript
function redactSensitive(data: any): any {
  const sensitiveFields = ['password', 'ssn', 'creditCard', 'token', 'secret'];

  if (typeof data !== 'object' || data === null) return data;

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
        return [key, '[REDACTED]'];
      }
      if (typeof value === 'object') {
        return [key, redactSensitive(value)];
      }
      return [key, value];
    })
  );
}
```
