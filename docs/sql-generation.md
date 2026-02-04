# SQL Generation

Schemock can generate PostgreSQL schema files from your entity definitions, including tables, foreign keys, indexes, RLS policies, functions, and triggers.

## Quick Start

```bash
# Generate SQL schema
npx schemock generate:sql

# Generate combined single file
npx schemock generate:sql --combined

# Generate for Supabase
npx schemock generate:sql --target supabase

# Preview without writing files
npx schemock generate:sql --dry-run
```

---

## Command Options

```bash
npx schemock generate:sql [options]

Options:
  --output, -o <dir>      Output directory (default: ./sql)
  --combined              Generate single schema.sql file
  --target <platform>     Target platform: postgres | supabase | pglite
  --only <sections>       Generate only specific sections (comma-separated)
  --readme                Generate README documentation
  --dry-run               Preview without writing files
  --verbose, -v           Verbose output
  --config, -c <file>     Config file path
```

---

## Output Files

### Separate Files (Default)

By default, SQL is organized into separate files for easier management:

```
sql/
├── 001_tables.sql        # CREATE TABLE statements
├── 002_foreign_keys.sql  # ALTER TABLE ADD FOREIGN KEY
├── 003_indexes.sql       # CREATE INDEX statements
├── 004_rls.sql           # Row-Level Security policies
├── 005_functions.sql     # CREATE FUNCTION (RPCs)
├── 006_triggers.sql      # Triggers (updated_at, etc.)
└── README.md             # Documentation (with --readme)
```

### Combined File

With `--combined`, everything goes into a single file:

```
sql/
├── schema.sql            # All SQL in one file
└── README.md             # Documentation (with --readme)
```

---

## Target Platforms

### PostgreSQL (Default)

Standard PostgreSQL syntax:

```bash
npx schemock generate:sql --target postgres
```

### Supabase

Includes Supabase-specific features:

```bash
npx schemock generate:sql --target supabase
```

- Uses `auth.uid()` for RLS policies
- Includes storage bucket policies if needed
- Generates Supabase-compatible migration format

### PGlite

Optimized for browser-based PGlite:

```bash
npx schemock generate:sql --target pglite
```

- Uses `current_setting()` for context instead of session variables
- Optimized for in-browser execution

---

## Section Filtering

Generate only specific sections:

```bash
# Only tables and indexes
npx schemock generate:sql --only tables,indexes

# Only RLS policies
npx schemock generate:sql --only rls

# Tables and foreign keys
npx schemock generate:sql --only tables,foreign-keys
```

Available sections:
- `tables` - CREATE TABLE statements
- `foreign-keys` - Foreign key constraints
- `indexes` - Database indexes
- `rls` - Row-Level Security policies
- `functions` - Stored procedures (RPCs)
- `triggers` - Database triggers

---

## Generated SQL Examples

### Tables

From your schema:

```typescript
const User = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user', 'guest']).default('user'),
  bio: field.string().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),
});
```

Generated SQL:

```sql
-- 001_tables.sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'guest')),
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Foreign Keys

From relations:

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  authorId: field.uuid(),
  author: belongsTo('user', { foreignKey: 'authorId' }),
});
```

Generated SQL:

```sql
-- 002_foreign_keys.sql
ALTER TABLE posts
  ADD CONSTRAINT posts_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES users(id)
  ON DELETE CASCADE;
```

### Indexes

From schema options:

```typescript
const Post = defineData('post', {
  // ... fields
}, {
  indexes: [
    { fields: ['authorId', 'createdAt'], type: 'btree' },
    { fields: ['title'], type: 'gin', using: 'gin_trgm_ops' },
    { fields: ['status'], where: "status = 'published'" },
  ],
});
```

Generated SQL:

```sql
-- 003_indexes.sql
-- User-defined indexes
CREATE INDEX IF NOT EXISTS idx_posts_author_id_created_at
  ON posts USING btree (author_id, created_at);

CREATE INDEX IF NOT EXISTS idx_posts_title_gin
  ON posts USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_posts_status_partial
  ON posts (status)
  WHERE status = 'published';

-- Auto-generated indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_posts_author_id
  ON posts (author_id);
```

### Row-Level Security

From RLS config:

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  published: field.boolean().default(false),
}, {
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});
```

Generated SQL (PostgreSQL):

```sql
-- 004_rls.sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Select policy
CREATE POLICY posts_select_policy ON posts
  FOR SELECT
  USING (
    author_id = current_setting('app.userId', true)::uuid
    OR current_setting('app.role', true) = 'admin'
  );

-- Insert policy
CREATE POLICY posts_insert_policy ON posts
  FOR INSERT
  WITH CHECK (
    author_id = current_setting('app.userId', true)::uuid
    OR current_setting('app.role', true) = 'admin'
  );

-- Update policy
CREATE POLICY posts_update_policy ON posts
  FOR UPDATE
  USING (
    author_id = current_setting('app.userId', true)::uuid
    OR current_setting('app.role', true) = 'admin'
  );

-- Delete policy
CREATE POLICY posts_delete_policy ON posts
  FOR DELETE
  USING (
    author_id = current_setting('app.userId', true)::uuid
    OR current_setting('app.role', true) = 'admin'
  );
```

Generated SQL (Supabase):

```sql
-- 004_rls.sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_select_policy ON posts
  FOR SELECT
  USING (
    author_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
  );
```

### Custom RLS Policies

With raw SQL policies:

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  published: field.boolean(),
}, {
  rls: {
    sql: {
      select: "published = true OR author_id = current_setting('app.userId')::uuid",
      insert: "author_id = current_setting('app.userId')::uuid",
      update: "author_id = current_setting('app.userId')::uuid",
      delete: "current_setting('app.role') = 'admin'",
    },
  },
});
```

### Functions (RPCs)

From RPC definitions:

```typescript
const Post = defineData('post', {
  // ... fields
}, {
  rpc: [
    {
      name: 'get_user_post_count',
      args: [{ name: 'user_id', type: 'uuid' }],
      returns: 'number',
      sql: 'SELECT COUNT(*) FROM posts WHERE author_id = user_id',
    },
    {
      name: 'get_recent_posts',
      args: [
        { name: 'limit_count', type: 'number', default: '10' },
      ],
      returns: 'post[]',
      sql: `
        SELECT * FROM posts
        WHERE published = true
        ORDER BY created_at DESC
        LIMIT limit_count
      `,
    },
  ],
});
```

Generated SQL:

```sql
-- 005_functions.sql
CREATE OR REPLACE FUNCTION get_user_post_count(user_id UUID)
RETURNS BIGINT
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT COUNT(*) FROM posts WHERE author_id = user_id
$$;

CREATE OR REPLACE FUNCTION get_recent_posts(limit_count INTEGER DEFAULT 10)
RETURNS SETOF posts
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT * FROM posts
  WHERE published = true
  ORDER BY created_at DESC
  LIMIT limit_count
$$;
```

### Triggers

Auto-generated `updated_at` trigger:

```sql
-- 006_triggers.sql
-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at column
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## README Documentation

With `--readme`, a documentation file is generated:

```bash
npx schemock generate:sql --readme
```

The README includes:
- List of all tables with columns
- Foreign key relationships
- Index definitions
- RLS policy summaries
- Function signatures
- Usage instructions

---

## Usage After Generation

### PostgreSQL

```bash
# Apply schema
psql -d your_database -f sql/schema.sql

# Or apply individually
psql -d your_database -f sql/001_tables.sql
psql -d your_database -f sql/002_foreign_keys.sql
# ... etc
```

### Supabase

```bash
# Create migration
supabase migration new schema_setup

# Copy schema to migration file
cp sql/schema.sql supabase/migrations/YYYYMMDDHHMMSS_schema_setup.sql

# Apply migration
supabase db push
```

### PGlite

```typescript
// Import schema
import schemaSQL from './sql/schema.sql?raw';
import { PGlite } from '@electric-sql/pglite';

// Initialize database
const db = new PGlite('idb://myapp');
await db.exec(schemaSQL);
```

---

## Integration with Code Generation

SQL generation is separate from code generation. Typical workflow:

```bash
# 1. Generate SQL schema for database
npx schemock generate:sql --target supabase --combined

# 2. Apply to database
supabase db push

# 3. Generate TypeScript code
npx schemock generate
```

---

## Summary Output

After generation, a summary is displayed:

```
📊 Summary:
   Tables:        8
   Foreign Keys:  12
   Indexes:       15
   RLS Policies:  24
   Functions:     3
   Triggers:      8

✅ SQL schema generated in ./sql
```

---

## Related Documentation

- [Generation Targets](./targets.md) - Code generation targets
- [Schema DSL](../README.md#schema-dsl) - Field types and modifiers
- [Row-Level Security](../README.md#row-level-security-rls) - RLS configuration
