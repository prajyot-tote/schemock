# Segregated Schemas Example

This example demonstrates that Schemock supports **file segregation** out of the box.

## Directory Structure

```
segregated-schemas/
├── entities/           # Database entities (defineData)
│   ├── user.ts         # User entity with hasMany relations
│   ├── post.ts         # Post entity with belongsTo/hasMany
│   └── comment.ts      # Comment entity with multiple FKs
│
├── endpoints/          # Custom API endpoints (defineEndpoint)
│   ├── search.ts       # Search across users and posts
│   └── bulk-operations.ts  # Bulk delete, publish, stats
│
├── views/              # Composite views (defineView)
│   └── user-profile.ts # User profile with stats
│
├── schemock.config.ts  # Configuration
└── README.md           # This file
```

## How It Works

1. **Single Glob Pattern**: The config uses `./examples/segregated-schemas/**/*.ts` which catches ALL files in all subdirectories.

2. **Discovery**: The CLI scans all matched files and extracts:
   - `EntitySchema` exports (from entities/)
   - `EndpointSchema` exports (from endpoints/)
   - `ViewSchema` exports (from views/)

3. **Merging**: All schemas are merged into single arrays BEFORE analysis.

4. **Analysis**: Relations are resolved by NAME (strings), not imports:
   - `belongsTo('user')` finds User schema regardless of file location
   - `hasMany('post')` finds Post schema regardless of file location

5. **Generation**: All generators receive the merged, analyzed schemas.

## Cross-File References

```typescript
// entities/post.ts
export const Post = defineData('post', {
  authorId: field.ref('user'),  // ← String reference to 'user'
}, {
  relations: {
    author: belongsTo('user'),  // ← String reference, NOT import
  }
});

// endpoints/search.ts
mockResolver: async ({ db }) => {
  // db.user exists because ALL entities are merged
  // db.post exists because ALL entities are merged
  const users = db.user.findMany(...);
  const posts = db.post.findMany(...);
}
```

## Running the Example

```bash
# From project root
npx tsx src/cli.ts generate --config examples/segregated-schemas/schemock.config.ts

# Or with verbose output
npx tsx src/cli.ts generate --config examples/segregated-schemas/schemock.config.ts --verbose
```

## Generated Output

After running generate, you'll have:

```
generated/
├── types.ts          # User, Post, Comment types
├── db.ts             # @mswjs/data factory with ALL entities
├── handlers.ts       # MSW handlers for CRUD
├── client.ts         # API client
├── hooks.ts          # React Query hooks
├── endpoints.ts      # Custom endpoint clients
├── endpoint-handlers.ts  # Custom endpoint handlers
└── index.ts          # Barrel exports
```

## Key Takeaway

**File organization is YOUR choice.** Schemock doesn't care where you put files as long as:
1. They match the glob pattern in config
2. They export `EntitySchema`, `EndpointSchema`, or `ViewSchema`
3. Cross-references use string names (which they already do)
