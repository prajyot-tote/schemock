# Schema DSL Specification

## Overview

The Schema DSL (Domain Specific Language) is the foundation of Schemock. It provides a declarative way to define data entities, their fields, relationships, and computed properties.

## Core Concepts

### Entity Definition

```typescript
import { defineData, field, hasOne, hasMany, belongsTo } from '@schemock/schema';

const User = defineData('user', {
  // Fields
  id: field.uuid(),
  name: field.person.fullName(),
  email: field.internet.email(),

  // Relations
  profile: hasOne('userProfile'),
  posts: hasMany('post'),

  // Computed
  postCount: field.computed({...}),
}, {
  // Options
  api: { basePath: '/api/users' },
});
```

### Field Types

```typescript
// String types
field.string()                          // Random string
field.string().min(1).max(100)          // With length constraints
field.string().pattern(/^[A-Z]+$/)      // With regex pattern

// Faker-based types
field.uuid()                            // UUID v4
field.person.fullName()                 // "John Doe"
field.person.firstName()                // "John"
field.person.lastName()                 // "Doe"
field.internet.email()                  // "john@example.com"
field.internet.url()                    // "https://example.com"
field.internet.avatar()                 // Avatar URL
field.image.avatar()                    // Same as above
field.lorem.sentence()                  // "Lorem ipsum dolor..."
field.lorem.paragraph()                 // Full paragraph
field.lorem.paragraphs(3)               // 3 paragraphs
field.location.city()                   // "New York"
field.location.country()                // "United States"
field.phone.number()                    // "+1-555-123-4567"

// Number types
field.number.int()                      // Random integer
field.number.int({ min: 0, max: 100 })  // Bounded integer
field.number.float()                    // Random float
field.number.float({ min: 0, max: 1, precision: 2 })

// Boolean
field.boolean()                         // Random true/false
field.boolean().default(true)           // With default

// Date types
field.date()                            // Random date
field.date.past()                       // Past date
field.date.future()                     // Future date
field.date.recent()                     // Recent date (last week)
field.date.between({ from: '2020-01-01', to: '2024-12-31' })

// Enum
field.enum(['admin', 'user', 'guest'])  // One of values
field.enum(['admin', 'user']).default('user')

// Array
field.array(field.string())             // Array of strings
field.array(field.uuid()).length(5)     // Fixed length
field.array(field.string()).min(1).max(10)  // Variable length

// Object (nested)
field.object({
  street: field.location.streetAddress(),
  city: field.location.city(),
  zip: field.location.zipCode(),
})

// Reference (to another entity)
field.ref('user')                       // Reference to User entity

// Nullable
field.string().nullable()               // Can be null
field.date().nullable()

// Unique
field.internet.email().unique()         // Unique constraint

// Read-only (excluded from Create/Update schemas)
field.date().readOnly()                 // e.g., createdAt

// Default value
field.enum(['active', 'inactive']).default('active')
field.number.int().default(0)
```

## Relations

### hasOne (One-to-One)

```typescript
const User = defineData('user', {
  id: field.uuid(),
  name: field.string(),

  // User has one profile
  profile: hasOne('userProfile', {
    foreignKey: 'userId',    // FK on userProfile
    eager: true,             // Always include in responses
  }),
});

const UserProfile = defineData('userProfile', {
  id: field.uuid(),
  userId: field.uuid(),      // Foreign key
  bio: field.lorem.paragraph(),
});
```

### hasMany (One-to-Many)

```typescript
const User = defineData('user', {
  id: field.uuid(),

  // User has many posts
  posts: hasMany('post', {
    foreignKey: 'authorId',  // FK on post
    eager: false,            // Only include when requested
    orderBy: { createdAt: 'desc' },
    limit: 10,               // Default limit
  }),
});

const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),    // Foreign key
  title: field.lorem.sentence(),
});
```

### belongsTo (Inverse of hasOne/hasMany)

```typescript
const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),

  // Post belongs to user
  author: belongsTo('user', {
    foreignKey: 'authorId',
    eager: true,
  }),
});
```

### Many-to-Many (through)

```typescript
const User = defineData('user', {
  id: field.uuid(),

  // User has many followers (other users) through follows
  followers: hasMany('user', {
    through: 'follow',
    foreignKey: 'followingId',
    otherKey: 'followerId',
  }),

  following: hasMany('user', {
    through: 'follow',
    foreignKey: 'followerId',
    otherKey: 'followingId',
  }),
});

const Follow = defineData('follow', {
  id: field.uuid(),
  followerId: field.uuid(),
  followingId: field.uuid(),
  createdAt: field.date(),
});
```

## Computed Fields

### Basic Computed

```typescript
const User = defineData('user', {
  firstName: field.person.firstName(),
  lastName: field.person.lastName(),

  // Computed from other fields
  fullName: field.computed({
    mock: () => faker.person.fullName(),
    resolve: (user) => `${user.firstName} ${user.lastName}`,
  }),
});
```

### Computed from Relations

```typescript
const User = defineData('user', {
  posts: hasMany('post'),

  // Count related entities
  postCount: field.computed({
    mock: () => faker.number.int({ min: 0, max: 100 }),
    resolve: (user, db) => db.post.count({
      where: { authorId: { equals: user.id } }
    }),
  }),

  // Aggregate related data
  totalViews: field.computed({
    mock: () => faker.number.int({ min: 0, max: 10000 }),
    resolve: (user, db) => {
      const posts = db.post.findMany({
        where: { authorId: { equals: user.id } }
      });
      return posts.reduce((sum, p) => sum + p.viewCount, 0);
    },
  }),
});
```

### Computed with Dependencies

```typescript
const User = defineData('user', {
  postCount: field.computed({...}),
  totalViews: field.computed({...}),

  // Depends on other computed fields
  avgViewsPerPost: field.computed({
    dependsOn: ['postCount', 'totalViews'],
    mock: () => faker.number.int({ min: 0, max: 500 }),
    resolve: (user) => user.postCount > 0
      ? Math.round(user.totalViews / user.postCount)
      : 0,
  }),
});
```

## Views (Aggregations)

```typescript
import { defineView, embed, pick } from '@schemock/schema';

const UserFullView = defineView('user-full', {
  // Pick specific fields from entity
  ...pick(User, ['id', 'name', 'email']),

  // Embed related entity
  profile: embed(UserProfile),

  // Embed with options
  recentPosts: embed(Post, {
    limit: 5,
    orderBy: { createdAt: 'desc' },
  }),

  // Nested computed
  stats: {
    postCount: field.computed({...}),
    totalViews: field.computed({...}),
    followerCount: field.computed({...}),
  },
}, {
  endpoint: '/api/users/:id/full',
  params: ['id'],
});
```

## Custom Endpoints

```typescript
import { defineEndpoint } from '@schemock/schema';

const SearchEndpoint = defineEndpoint('/api/search', {
  method: 'GET',

  params: {
    q: field.string().required(),
    type: field.enum(['user', 'post', 'all']).default('all'),
    limit: field.number.int().default(20),
  },

  response: {
    results: field.array(field.union([
      field.object({ type: field.literal('user'), ...pick(User, ['id', 'name']) }),
      field.object({ type: field.literal('post'), ...pick(Post, ['id', 'title']) }),
    ])),
    total: field.number.int(),
  },

  mockResolver: (db, params) => {
    const users = params.type !== 'post'
      ? db.user.findMany({ where: { name: { contains: params.q } } })
      : [];
    const posts = params.type !== 'user'
      ? db.post.findMany({ where: { title: { contains: params.q } } })
      : [];

    return {
      results: [
        ...users.map(u => ({ type: 'user', ...u })),
        ...posts.map(p => ({ type: 'post', ...p })),
      ].slice(0, params.limit),
      total: users.length + posts.length,
    };
  },
});
```

## API Configuration

```typescript
const User = defineData('user', {
  // ... fields
}, {
  api: {
    // Base path for all operations
    basePath: '/api/users',

    // Enable/disable operations
    operations: {
      list: true,              // GET /api/users
      get: true,               // GET /api/users/:id
      create: true,            // POST /api/users
      update: true,            // PUT /api/users/:id
      delete: true,            // DELETE /api/users/:id

      // Custom operations
      search: {
        method: 'GET',
        path: '/search',
        params: ['q', 'limit'],
      },
    },

    // Pagination config
    pagination: {
      style: 'offset',         // 'offset' | 'cursor'
      defaultLimit: 20,
      maxLimit: 100,
    },

    // Relationship endpoints
    relationships: {
      posts: {
        endpoint: true,        // GET /api/users/:id/posts
        operations: ['list'],  // Only list, not create/update/delete
      },
    },
  },
});
```

## Validation

```typescript
const User = defineData('user', {
  name: field.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long'),

  email: field.internet.email()
    .unique('Email already exists'),

  age: field.number.int()
    .min(0, 'Age must be positive')
    .max(150, 'Invalid age'),

  website: field.internet.url()
    .nullable()
    .pattern(/^https:\/\//, 'Must be HTTPS'),
});
```

## Type Inference

The schema automatically infers TypeScript types:

```typescript
const User = defineData('user', {
  id: field.uuid(),
  name: field.string(),
  email: field.internet.email(),
  age: field.number.int().nullable(),
  role: field.enum(['admin', 'user']),
  profile: hasOne('userProfile'),
  posts: hasMany('post'),
  postCount: field.computed({...}),
});

// Inferred type:
type User = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  role: 'admin' | 'user';
  profile?: UserProfile;
  posts?: Post[];
  postCount: number;
};

// Create type (excludes id, readOnly, computed):
type UserCreate = {
  name: string;
  email: string;
  age?: number | null;
  role?: 'admin' | 'user';
};

// Update type (all optional):
type UserUpdate = {
  name?: string;
  email?: string;
  age?: number | null;
  role?: 'admin' | 'user';
};
```

## Complete Example

```typescript
// schemas/index.ts
import { defineData, defineView, field, hasOne, hasMany, belongsTo, embed, pick } from '@schemock/schema';
import { faker } from '@faker-js/faker';

// User Profile
export const UserProfile = defineData('userProfile', {
  id: field.uuid(),
  userId: field.uuid(),
  bio: field.lorem.paragraph(),
  avatar: field.image.avatar(),
  website: field.internet.url().nullable(),
  location: field.location.city(),
  createdAt: field.date.past().readOnly(),
});

// Post
export const Post = defineData('post', {
  id: field.uuid(),
  authorId: field.uuid(),
  title: field.lorem.sentence(),
  body: field.lorem.paragraphs(3),
  published: field.boolean().default(false),
  viewCount: field.number.int({ min: 0, max: 10000 }).default(0),
  tags: field.array(field.string()).min(0).max(5),
  createdAt: field.date.past().readOnly(),
  updatedAt: field.date.recent().readOnly(),

  author: belongsTo('user', { foreignKey: 'authorId', eager: true }),
});

// User
export const User = defineData('user', {
  id: field.uuid(),
  name: field.person.fullName(),
  email: field.internet.email().unique(),
  role: field.enum(['admin', 'user', 'guest']).default('user'),
  active: field.boolean().default(true),
  createdAt: field.date.past().readOnly(),

  // Relations
  profile: hasOne('userProfile', { foreignKey: 'userId', eager: true }),
  posts: hasMany('post', { foreignKey: 'authorId', orderBy: { createdAt: 'desc' } }),

  // Computed
  postCount: field.computed({
    mock: () => faker.number.int({ min: 0, max: 50 }),
    resolve: (user, db) => db.post.count({ where: { authorId: { equals: user.id } } }),
  }),

  totalViews: field.computed({
    mock: () => faker.number.int({ min: 0, max: 50000 }),
    resolve: (user, db) => {
      const posts = db.post.findMany({ where: { authorId: { equals: user.id } } });
      return posts.reduce((sum, p) => sum + p.viewCount, 0);
    },
  }),
}, {
  api: {
    basePath: '/api/users',
    pagination: { defaultLimit: 20, maxLimit: 100 },
    relationships: {
      posts: { endpoint: true },
    },
  },
});

// User Full View
export const UserFullView = defineView('user-full', {
  ...pick(User, ['id', 'name', 'email', 'role', 'createdAt']),
  profile: embed(UserProfile),
  recentPosts: embed(Post, { limit: 5, orderBy: { createdAt: 'desc' } }),
  stats: {
    postCount: field.computed({
      mock: () => faker.number.int({ min: 0, max: 50 }),
      resolve: (_, db, ctx) => db.post.count({ where: { authorId: { equals: ctx.params.id } } }),
    }),
    totalViews: field.computed({
      mock: () => faker.number.int({ min: 0, max: 50000 }),
      resolve: (data) => data.recentPosts?.reduce((sum, p) => sum + p.viewCount, 0) ?? 0,
    }),
  },
}, {
  endpoint: '/api/users/:id/full',
  params: ['id'],
});
```
