/**
 * Comprehensive Schema Fixture for E2E Compilation Tests
 *
 * This schema includes all supported features to ensure generated code compiles:
 * - Various field types (string, number, boolean, date, enum, json)
 * - Relations (hasMany, belongsTo, hasOne)
 * - RLS (Row-Level Security) with scope and bypass
 * - Indexes
 * - Nullable fields
 * - Default values
 * - Unique constraints
 * - Read-only fields
 */

import { defineData, field, hasMany, belongsTo, hasOne } from 'schemock/schema';

/**
 * User entity - demonstrates core features
 */
export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user', 'moderator']).default('user'),
  avatar: field.url().nullable(),
  settings: field.json().nullable(),
  isActive: field.boolean().default(true),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  posts: hasMany('post', { foreignKey: 'authorId' }),
  profile: hasOne('profile', { foreignKey: 'userId' }),
  comments: hasMany('comment', { foreignKey: 'userId' }),
}, {
  tags: ['core', 'auth'],
  module: 'users',
  rls: {
    scope: [{ field: 'id', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['role'] },
    { fields: ['createdAt'] },
  ],
});

/**
 * Profile entity - demonstrates one-to-one relation
 */
export const profileSchema = defineData('profile', {
  id: field.uuid(),
  userId: field.uuid().unique(),
  bio: field.string().nullable(),
  website: field.url().nullable(),
  location: field.string().nullable(),
  birthdate: field.date().nullable(),
  socialLinks: field.json().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  user: belongsTo('user', { foreignKey: 'userId' }),
}, {
  tags: ['core'],
  module: 'users',
});

/**
 * Post entity - demonstrates hasMany and belongsTo
 */
export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  slug: field.string().unique(),
  content: field.string(),
  excerpt: field.string().nullable(),
  status: field.enum(['draft', 'published', 'archived']).default('draft'),
  authorId: field.uuid(),
  categoryId: field.uuid().nullable(),
  viewCount: field.number().default(0),
  metadata: field.json().nullable(),
  publishedAt: field.date().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  author: belongsTo('user', { foreignKey: 'authorId' }),
  category: belongsTo('category', { foreignKey: 'categoryId' }),
  comments: hasMany('comment', { foreignKey: 'postId' }),
  tags: hasMany('postTag', { foreignKey: 'postId' }),
}, {
  tags: ['content'],
  module: 'blog',
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin', 'moderator'] }],
  },
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['authorId'] },
    { fields: ['categoryId'] },
    { fields: ['status'] },
    { fields: ['publishedAt'] },
  ],
});

/**
 * Category entity - demonstrates hierarchical data
 */
export const categorySchema = defineData('category', {
  id: field.uuid(),
  name: field.string(),
  slug: field.string().unique(),
  description: field.string().nullable(),
  parentId: field.uuid().nullable(),
  sortOrder: field.number().default(0),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  parent: belongsTo('category', { foreignKey: 'parentId' }),
  children: hasMany('category', { foreignKey: 'parentId' }),
  posts: hasMany('post', { foreignKey: 'categoryId' }),
}, {
  tags: ['content'],
  module: 'blog',
});

/**
 * Comment entity - demonstrates nested relations
 */
export const commentSchema = defineData('comment', {
  id: field.uuid(),
  content: field.string(),
  userId: field.uuid(),
  postId: field.uuid(),
  parentId: field.uuid().nullable(),
  isApproved: field.boolean().default(false),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  author: belongsTo('user', { foreignKey: 'userId' }),
  post: belongsTo('post', { foreignKey: 'postId' }),
  parent: belongsTo('comment', { foreignKey: 'parentId' }),
  replies: hasMany('comment', { foreignKey: 'parentId' }),
}, {
  tags: ['content'],
  module: 'blog',
  rls: {
    scope: [{ field: 'userId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin', 'moderator'] }],
  },
});

/**
 * Tag entity - for many-to-many demonstration
 */
export const tagSchema = defineData('tag', {
  id: field.uuid(),
  name: field.string().unique(),
  slug: field.string().unique(),
  color: field.string().nullable(),
  createdAt: field.date().readOnly(),

  // Relations via junction table
  posts: hasMany('postTag', { foreignKey: 'tagId' }),
}, {
  tags: ['content'],
  module: 'blog',
});

/**
 * PostTag junction table - many-to-many relation
 */
export const postTagSchema = defineData('postTag', {
  id: field.uuid(),
  postId: field.uuid(),
  tagId: field.uuid(),
  createdAt: field.date().readOnly(),

  // Relations
  post: belongsTo('post', { foreignKey: 'postId' }),
  tag: belongsTo('tag', { foreignKey: 'tagId' }),
}, {
  tags: ['content'],
  module: 'blog',
  indexes: [
    { fields: ['postId', 'tagId'], unique: true },
  ],
});

/**
 * Organization entity - for multi-tenant scenarios
 */
export const organizationSchema = defineData('organization', {
  id: field.uuid(),
  name: field.string(),
  slug: field.string().unique(),
  description: field.string().nullable(),
  logoUrl: field.url().nullable(),
  plan: field.enum(['free', 'pro', 'enterprise']).default('free'),
  maxUsers: field.number().default(5),
  settings: field.json().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  members: hasMany('organizationMember', { foreignKey: 'organizationId' }),
}, {
  tags: ['core', 'billing'],
  module: 'organizations',
});

/**
 * OrganizationMember - demonstrates organization membership
 */
export const organizationMemberSchema = defineData('organizationMember', {
  id: field.uuid(),
  organizationId: field.uuid(),
  userId: field.uuid(),
  role: field.enum(['owner', 'admin', 'member']).default('member'),
  invitedBy: field.uuid().nullable(),
  joinedAt: field.date().readOnly(),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organizationId' }),
  user: belongsTo('user', { foreignKey: 'userId' }),
  inviter: belongsTo('user', { foreignKey: 'invitedBy' }),
}, {
  tags: ['core'],
  module: 'organizations',
  rls: {
    scope: [{ field: 'organizationId', contextKey: 'organizationId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
  indexes: [
    { fields: ['organizationId', 'userId'], unique: true },
  ],
});

/**
 * AuditLog entity - demonstrates read-only entity
 */
export const auditLogSchema = defineData('auditLog', {
  id: field.uuid(),
  action: field.enum(['create', 'update', 'delete', 'login', 'logout']),
  entityType: field.string(),
  entityId: field.uuid().nullable(),
  userId: field.uuid().nullable(),
  organizationId: field.uuid().nullable(),
  metadata: field.json().nullable(),
  ipAddress: field.string().nullable(),
  userAgent: field.string().nullable(),
  createdAt: field.date().readOnly(),

  // Relations
  user: belongsTo('user', { foreignKey: 'userId' }),
  organization: belongsTo('organization', { foreignKey: 'organizationId' }),
}, {
  tags: ['system', 'audit'],
  module: 'system',
});

/**
 * Product entity - for e-commerce scenarios
 */
export const productSchema = defineData('product', {
  id: field.uuid(),
  name: field.string(),
  slug: field.string().unique(),
  description: field.string().nullable(),
  price: field.number(),
  compareAtPrice: field.number().nullable(),
  sku: field.string().unique().nullable(),
  barcode: field.string().nullable(),
  quantity: field.number().default(0),
  status: field.enum(['active', 'draft', 'archived']).default('draft'),
  images: field.json().nullable(),
  variants: field.json().nullable(),
  organizationId: field.uuid(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organizationId' }),
  orderItems: hasMany('orderItem', { foreignKey: 'productId' }),
}, {
  tags: ['commerce'],
  module: 'commerce',
  rls: {
    scope: [{ field: 'organizationId', contextKey: 'organizationId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});

/**
 * Order entity - demonstrates complex e-commerce entity
 */
export const orderSchema = defineData('order', {
  id: field.uuid(),
  orderNumber: field.string().unique(),
  userId: field.uuid(),
  organizationId: field.uuid(),
  status: field.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending'),
  subtotal: field.number(),
  tax: field.number().default(0),
  shipping: field.number().default(0),
  total: field.number(),
  currency: field.string().default('USD'),
  shippingAddress: field.json().nullable(),
  billingAddress: field.json().nullable(),
  notes: field.string().nullable(),
  paidAt: field.date().nullable(),
  shippedAt: field.date().nullable(),
  deliveredAt: field.date().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  customer: belongsTo('user', { foreignKey: 'userId' }),
  organization: belongsTo('organization', { foreignKey: 'organizationId' }),
  items: hasMany('orderItem', { foreignKey: 'orderId' }),
}, {
  tags: ['commerce'],
  module: 'commerce',
  rls: {
    scope: [
      { field: 'userId', contextKey: 'userId' },
      { field: 'organizationId', contextKey: 'organizationId' },
    ],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});

/**
 * OrderItem entity - demonstrates order line items
 */
export const orderItemSchema = defineData('orderItem', {
  id: field.uuid(),
  orderId: field.uuid(),
  productId: field.uuid(),
  quantity: field.number(),
  unitPrice: field.number(),
  totalPrice: field.number(),
  metadata: field.json().nullable(),
  createdAt: field.date().readOnly(),

  // Relations
  order: belongsTo('order', { foreignKey: 'orderId' }),
  product: belongsTo('product', { foreignKey: 'productId' }),
}, {
  tags: ['commerce'],
  module: 'commerce',
});

// Export all schemas
export const schemas = [
  userSchema,
  profileSchema,
  postSchema,
  categorySchema,
  commentSchema,
  tagSchema,
  postTagSchema,
  organizationSchema,
  organizationMemberSchema,
  auditLogSchema,
  productSchema,
  orderSchema,
  orderItemSchema,
];
