/**
 * User profile view - defined in views/ directory
 *
 * Views combine data from multiple entities.
 * All referenced entities are in entities/ directory.
 */
import { defineView, field, embed, pick } from '../../../src/schema';

// Note: We can't directly import User/Post here because that would
// create a runtime dependency. Views use entity names as strings.

export const UserProfileView = defineView('user-profile', {
  // Pick fields from User entity (referenced by name)
  id: field.uuid(),
  name: field.string(),
  email: field.email(),
  avatar: field.string().nullable(),
  role: field.enum(['admin', 'user', 'guest']),

  // Computed stats
  stats: field.object({
    postCount: field.number(),
    commentCount: field.number(),
    totalViews: field.number(),
  }),

  // Recent posts (embedded)
  recentPosts: field.array(field.object({
    id: field.uuid(),
    title: field.string(),
    published: field.boolean(),
    createdAt: field.date(),
  })),
}, {
  endpoint: '/api/users/:id/profile',
  params: ['id'],
  description: 'Full user profile with stats and recent posts',
});

export const PostDetailView = defineView('post-detail', {
  id: field.uuid(),
  title: field.string(),
  content: field.string(),
  published: field.boolean(),
  views: field.number(),
  createdAt: field.date(),

  // Author info (from User entity)
  author: field.object({
    id: field.uuid(),
    name: field.string(),
    avatar: field.string().nullable(),
  }),

  // Comments with authors
  comments: field.array(field.object({
    id: field.uuid(),
    content: field.string(),
    createdAt: field.date(),
    author: field.object({
      id: field.uuid(),
      name: field.string(),
    }),
  })),

  commentCount: field.number(),
}, {
  endpoint: '/api/posts/:id/detail',
  params: ['id'],
  description: 'Full post detail with author and comments',
});
