/**
 * Bulk operations endpoints - defined in endpoints/ directory
 *
 * Multiple endpoints in one file, all operating on entities
 * defined in a different directory.
 */
import { defineEndpoint, field } from '../../../src/schema';

/**
 * Bulk delete posts
 */
export const BulkDeletePostsEndpoint = defineEndpoint('/api/posts/bulk-delete', {
  method: 'POST',
  description: 'Delete multiple posts at once',
  body: {
    ids: field.array(field.uuid()),
  },
  response: {
    deleted: field.number({ min: 0 }),
    failed: field.array(field.uuid()),
  },
  mockResolver: async ({ body, db }) => {
    let deleted = 0;
    const failed: string[] = [];

    for (const id of body.ids) {
      try {
        const result = db.post.delete({ where: { id: { equals: id } } });
        if (result) {
          deleted++;
        } else {
          failed.push(id);
        }
      } catch {
        failed.push(id);
      }
    }

    return { deleted, failed };
  },
});

/**
 * Bulk publish posts
 */
export const BulkPublishPostsEndpoint = defineEndpoint('/api/posts/bulk-publish', {
  method: 'POST',
  description: 'Publish multiple posts at once',
  body: {
    ids: field.array(field.uuid()),
    published: field.boolean().default(true),
  },
  response: {
    updated: field.number({ min: 0 }),
  },
  mockResolver: async ({ body, db }) => {
    let updated = 0;

    for (const id of body.ids) {
      const result = db.post.update({
        where: { id: { equals: id } },
        data: { published: body.published },
      });
      if (result) updated++;
    }

    return { updated };
  },
});

/**
 * Get user stats
 */
export const UserStatsEndpoint = defineEndpoint('/api/users/:userId/stats', {
  method: 'GET',
  description: 'Get statistics for a user',
  params: {
    userId: field.uuid(),
  },
  response: {
    postCount: field.number({ min: 0 }),
    commentCount: field.number({ min: 0 }),
    totalViews: field.number({ min: 0 }),
    publishedPosts: field.number({ min: 0 }),
  },
  mockResolver: async ({ params, db }) => {
    // Access user, post, and comment - all from different files
    const posts = db.post.findMany({
      where: { authorId: { equals: params.userId } },
    });

    const comments = db.comment.findMany({
      where: { userId: { equals: params.userId } },
    });

    return {
      postCount: posts.length,
      commentCount: comments.length,
      totalViews: posts.reduce((sum: number, p: any) => sum + (p.views || 0), 0),
      publishedPosts: posts.filter((p: any) => p.published).length,
    };
  },
});
