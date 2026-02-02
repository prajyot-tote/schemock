/**
 * Test Schemas for E2E Runtime Tests
 *
 * Defines schemas with various configurations including:
 * - Basic CRUD entities
 * - RLS-enabled entities with scope and bypass
 * - Relations between entities
 */

import { defineData, field, belongsTo, hasMany } from '../../../schema';
import type { EntitySchema } from '../../../schema/types';

/**
 * User schema - basic entity with no RLS
 */
export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user', 'moderator']).default('user'),
  avatar: field.url().nullable(),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  posts: hasMany('post', { foreignKey: 'authorId' }),
});

/**
 * Post schema - entity with RLS based on authorId
 */
export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  content: field.string(),
  authorId: field.uuid(),
  published: field.boolean().default(false),
  viewCount: field.number().default(0),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  author: belongsTo('user', { foreignKey: 'authorId' }),
  comments: hasMany('comment', { foreignKey: 'postId' }),
}, {
  rls: {
    scope: [{ field: 'authorId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});

/**
 * Comment schema - entity with RLS based on userId
 */
export const commentSchema = defineData('comment', {
  id: field.uuid(),
  content: field.string(),
  postId: field.uuid(),
  userId: field.uuid(),
  createdAt: field.date().readOnly(),

  // Relations
  post: belongsTo('post', { foreignKey: 'postId' }),
  author: belongsTo('user', { foreignKey: 'userId' }),
}, {
  rls: {
    scope: [{ field: 'userId', contextKey: 'userId' }],
    bypass: [{ contextKey: 'role', values: ['admin', 'moderator'] }],
  },
});

/**
 * Organization schema - multi-tenant entity
 */
export const organizationSchema = defineData('organization', {
  id: field.uuid(),
  name: field.string(),
  slug: field.string().unique(),
  createdAt: field.date().readOnly(),

  // Relations
  projects: hasMany('project', { foreignKey: 'organizationId' }),
});

/**
 * Project schema - entity with tenant-based RLS
 */
export const projectSchema = defineData('project', {
  id: field.uuid(),
  name: field.string(),
  description: field.string().nullable(),
  organizationId: field.uuid(),
  ownerId: field.uuid(),
  status: field.enum(['active', 'archived', 'draft']).default('draft'),
  createdAt: field.date().readOnly(),
  updatedAt: field.date().readOnly(),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organizationId' }),
}, {
  rls: {
    scope: [
      { field: 'organizationId', contextKey: 'tenantId' },
    ],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
});

/**
 * Get all test schemas as an array
 */
export function getTestSchemas(): EntitySchema[] {
  return [
    userSchema,
    postSchema,
    commentSchema,
    organizationSchema,
    projectSchema,
  ];
}

/**
 * Get schemas with RLS enabled
 */
export function getRLSSchemas(): EntitySchema[] {
  return [postSchema, commentSchema, projectSchema];
}

/**
 * Get schemas without RLS
 */
export function getNonRLSSchemas(): EntitySchema[] {
  return [userSchema, organizationSchema];
}
