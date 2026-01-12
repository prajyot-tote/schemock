/**
 * Blog schema fixture for integration testing
 * Tests: relations, computed fields, timestamps
 */
import { defineData, field, hasMany, belongsTo, hasOne } from '../../../../schema';

/**
 * User entity with profile relation
 */
export const User = defineData('user', {
  id: field.uuid(),
  name: field.person.fullName(),
  email: field.internet.email().unique(),
  role: field.enum(['admin', 'editor', 'author'] as const).default('author'),

  // Relations
  posts: hasMany('post', { foreignKey: 'authorId' }),
  profile: hasOne('userProfile', { foreignKey: 'userId' }),

  // Computed
  postCount: field.computed({
    mock: () => Math.floor(Math.random() * 100),
    resolve: (user) => (user.posts as unknown[])?.length ?? 0,
    dependsOn: ['posts'],
  }),
}, {
  timestamps: true,
});

/**
 * Post entity with author relation
 */
export const Post = defineData('post', {
  id: field.uuid(),
  title: field.lorem.sentence(),
  content: field.lorem.paragraphs(3).nullable(),
  status: field.enum(['draft', 'published', 'archived'] as const).default('draft'),
  authorId: field.uuid(),

  author: belongsTo('user', { foreignKey: 'authorId' }),
  comments: hasMany('comment', { foreignKey: 'postId' }),
}, {
  timestamps: true,
});

/**
 * Comment entity
 */
export const Comment = defineData('comment', {
  id: field.uuid(),
  content: field.lorem.paragraph(),
  postId: field.uuid(),
  authorId: field.uuid(),

  post: belongsTo('post', { foreignKey: 'postId' }),
  author: belongsTo('user', { foreignKey: 'authorId' }),
}, {
  timestamps: true,
});

/**
 * UserProfile entity (1:1 with User)
 */
export const UserProfile = defineData('userProfile', {
  id: field.uuid(),
  userId: field.uuid(),
  bio: field.lorem.paragraph().nullable(),
  avatarUrl: field.image.avatar().nullable(),

  user: belongsTo('user', { foreignKey: 'userId' }),
}, {
  timestamps: true,
});

export const schemas = [User, Post, Comment, UserProfile];
