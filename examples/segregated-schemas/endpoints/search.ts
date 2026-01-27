/**
 * Search endpoint - defined in endpoints/ directory
 *
 * Custom endpoint that queries BOTH User and Post entities.
 * Entities are defined in entities/ directory (different location).
 *
 * The mockResolver receives `db` which has access to ALL entities
 * because they are merged before generation.
 */
import { defineEndpoint, field } from 'schemock/schema';

export const SearchEndpoint = defineEndpoint('/api/search', {
  method: 'GET',
  description: 'Search across users and posts',
  params: {
    q: field.string(),
    type: field.enum(['user', 'post', 'all']).default('all'),
    limit: field.number({ min: 1, max: 100 }).default(20),
  },
  response: {
    users: field.array(field.object({
      id: field.uuid(),
      name: field.string(),
      email: field.email(),
    })),
    posts: field.array(field.object({
      id: field.uuid(),
      title: field.string(),
      authorName: field.string(),
    })),
    total: field.number({ min: 0 }),
  },
  mockResolver: async ({ params, db }) => {
    const results = { users: [] as any[], posts: [] as any[], total: 0 };
    const query = params.q?.toLowerCase() ?? '';

    if (params.type === 'all' || params.type === 'user') {
      // db.user is available even though User is in entities/user.ts
      const users = db.user.findMany({
        where: {
          name: { contains: query },
        },
        take: params.limit,
      });
      results.users = users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
      }));
    }

    if (params.type === 'all' || params.type === 'post') {
      // db.post is available even though Post is in entities/post.ts
      const posts = db.post.findMany({
        where: {
          title: { contains: query },
        },
        take: params.limit,
      });
      results.posts = posts.map((p: any) => {
        const author = db.user.findFirst({ where: { id: { equals: p.authorId } } });
        return {
          id: p.id,
          title: p.title,
          authorName: author?.name ?? 'Unknown',
        };
      });
    }

    results.total = results.users.length + results.posts.length;
    return results;
  },
});
