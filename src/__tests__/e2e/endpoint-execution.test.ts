/**
 * E2E Custom Endpoint Execution Tests
 *
 * Validates that custom endpoints with resolvers execute correctly at runtime.
 * Tests parameter parsing, body handling, and resolver execution.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { factory, primaryKey, nullable } from '@mswjs/data';
import { faker } from '@faker-js/faker';
import { createMockJwt, createAuthHeaders } from './utils/test-helpers';

// Create database
const db = factory({
  user: {
    id: primaryKey(() => faker.string.uuid()),
    email: () => faker.internet.email(),
    name: () => faker.person.fullName(),
    role: () => 'user' as const,
  },
  post: {
    id: primaryKey(() => faker.string.uuid()),
    title: () => faker.lorem.sentence(),
    content: () => faker.lorem.paragraphs(),
    authorId: () => faker.string.uuid(),
    published: () => false,
    viewCount: () => 0,
  },
  comment: {
    id: primaryKey(() => faker.string.uuid()),
    content: () => faker.lorem.sentence(),
    postId: () => faker.string.uuid(),
    userId: () => faker.string.uuid(),
  },
});

// Context type
interface MiddlewareContext {
  userId?: string;
  role?: string;
}

// Search endpoint resolver
async function searchResolver(params: {
  q: string;
  limit?: number;
  type?: 'user' | 'post' | 'all';
}): Promise<{ results: Array<{ id: string; title: string; type: string }>; total: number; query: string }> {
  const q = params.q?.toLowerCase() ?? '';
  const limit = params.limit ?? 20;
  const type = params.type ?? 'all';

  let results: Array<{ id: string; title: string; type: string }> = [];

  if (type === 'post' || type === 'all') {
    const posts = db.post.getAll().filter((p) =>
      p.title.toLowerCase().includes(q)
    );
    results = results.concat(posts.map((p) => ({ id: p.id, title: p.title, type: 'post' })));
  }

  if (type === 'user' || type === 'all') {
    const users = db.user.getAll().filter((u) =>
      u.name.toLowerCase().includes(q)
    );
    results = results.concat(users.map((u) => ({ id: u.id, title: u.name, type: 'user' })));
  }

  return {
    results: results.slice(0, limit),
    total: results.length,
    query: q,
  };
}

// User stats endpoint resolver
async function userStatsResolver(params: { userId: string }): Promise<{ postCount: number; commentCount: number }> {
  const posts = db.post.getAll().filter((p) => p.authorId === params.userId);
  const comments = db.comment.getAll().filter((c) => c.userId === params.userId);

  return {
    postCount: posts.length,
    commentCount: comments.length,
  };
}

// Bulk update endpoint resolver
async function bulkUpdateResolver(body: {
  ids: string[];
  data: { published?: boolean };
}): Promise<{ updated: number; ids: string[] }> {
  const { ids, data } = body;
  const updatedIds: string[] = [];

  for (const id of ids) {
    const post = db.post.update({
      where: { id: { equals: id } },
      data,
    });
    if (post) {
      updatedIds.push(id);
    }
  }

  return {
    updated: updatedIds.length,
    ids: updatedIds,
  };
}

// Handlers
const handlers = [
  // Search endpoint (GET with query params)
  http.get('http://localhost/api/search', async ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');

    if (!q) {
      return HttpResponse.json(
        { error: 'Missing required parameter: q' },
        { status: 400 }
      );
    }

    const params = {
      q,
      limit: url.searchParams.get('limit')
        ? parseInt(url.searchParams.get('limit')!)
        : undefined,
      type: url.searchParams.get('type') as 'user' | 'post' | 'all' | undefined,
    };

    const result = await searchResolver(params);
    return HttpResponse.json(result);
  }),

  // User stats endpoint (GET with path param)
  http.get('http://localhost/api/users/:userId/stats', async ({ params }) => {
    const result = await userStatsResolver({ userId: params.userId as string });
    return HttpResponse.json(result);
  }),

  // Bulk update endpoint (POST with body)
  http.post('http://localhost/api/posts/bulk-update', async ({ request }) => {
    const body = await request.json() as { ids: string[]; data: { published?: boolean } };

    if (!body.ids || !Array.isArray(body.ids)) {
      return HttpResponse.json(
        { error: 'Missing required field: ids' },
        { status: 400 }
      );
    }

    const result = await bulkUpdateResolver(body);
    return HttpResponse.json(result);
  }),

  // Protected endpoint (requires auth)
  http.post('http://localhost/api/protected/action', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Decode JWT to get context
    const token = authHeader.slice(7);
    let ctx: MiddlewareContext = {};
    try {
      const parts = token.split('.');
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      ctx = { userId: parsed.sub, role: parsed.role };
    } catch {
      return HttpResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json() as { action: string };

    return HttpResponse.json({
      success: true,
      action: body.action,
      executedBy: ctx.userId,
      role: ctx.role,
    });
  }),

  // Endpoint with complex response
  http.get('http://localhost/api/dashboard/summary', async () => {
    const users = db.user.getAll();
    const posts = db.post.getAll();
    const comments = db.comment.getAll();

    const publishedPosts = posts.filter((p) => p.published);
    const totalViews = posts.reduce((sum, p) => sum + p.viewCount, 0);

    return HttpResponse.json({
      stats: {
        users: users.length,
        posts: posts.length,
        comments: comments.length,
        publishedPosts: publishedPosts.length,
        totalViews,
      },
      recentPosts: posts.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title,
        published: p.published,
      })),
    });
  }),
];

const server = setupServer(...handlers);

describe('E2E: Endpoint Execution', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    // Clear database
    db.user.getAll().forEach((u) => db.user.delete({ where: { id: { equals: u.id } } }));
    db.post.getAll().forEach((p) => db.post.delete({ where: { id: { equals: p.id } } }));
    db.comment.getAll().forEach((c) => db.comment.delete({ where: { id: { equals: c.id } } }));
  });

  describe('Search endpoint (GET with query params)', () => {
    it('receives params from query string', async () => {
      db.post.create({ title: 'Test Post One', content: 'Content', authorId: 'user-1' });
      db.post.create({ title: 'Test Post Two', content: 'Content', authorId: 'user-1' });
      db.post.create({ title: 'Other Post', content: 'Content', authorId: 'user-2' });

      const response = await fetch('http://localhost/api/search?q=test');
      const json = await response.json() as { results: unknown[]; total: number; query: string };

      expect(response.status).toBe(200);
      expect(json.query).toBe('test');
      expect(json.results).toHaveLength(2);
      expect(json.total).toBe(2);
    });

    it('applies limit parameter', async () => {
      for (let i = 1; i <= 10; i++) {
        db.post.create({ title: `Test Post ${i}`, content: 'Content', authorId: 'user-1' });
      }

      const response = await fetch('http://localhost/api/search?q=test&limit=3');
      const json = await response.json() as { results: unknown[] };

      expect(response.status).toBe(200);
      expect(json.results).toHaveLength(3);
    });

    it('filters by type parameter', async () => {
      db.post.create({ title: 'Test Post', content: 'Content', authorId: 'user-1' });
      db.user.create({ name: 'Test User', email: 'test@test.com' });

      const response = await fetch('http://localhost/api/search?q=test&type=user');
      const json = await response.json() as { results: Array<{ type: string }> };

      expect(response.status).toBe(200);
      expect(json.results).toHaveLength(1);
      expect(json.results[0].type).toBe('user');
    });

    it('returns error for missing required param', async () => {
      const response = await fetch('http://localhost/api/search');
      const json = await response.json() as { error: string };

      expect(response.status).toBe(400);
      expect(json.error).toContain('q');
    });
  });

  describe('User stats endpoint (GET with path param)', () => {
    it('receives userId from path', async () => {
      const userId = 'target-user-uuid';

      db.post.create({ title: 'Post 1', content: 'Content', authorId: userId });
      db.post.create({ title: 'Post 2', content: 'Content', authorId: userId });
      db.comment.create({ content: 'Comment 1', postId: 'post-1', userId });
      db.comment.create({ content: 'Comment 2', postId: 'post-2', userId });
      db.comment.create({ content: 'Comment 3', postId: 'post-3', userId });

      const response = await fetch(`http://localhost/api/users/${userId}/stats`);
      const json = await response.json() as { postCount: number; commentCount: number };

      expect(response.status).toBe(200);
      expect(json.postCount).toBe(2);
      expect(json.commentCount).toBe(3);
    });

    it('returns zero counts for user with no content', async () => {
      const response = await fetch('http://localhost/api/users/no-content-user/stats');
      const json = await response.json() as { postCount: number; commentCount: number };

      expect(response.status).toBe(200);
      expect(json.postCount).toBe(0);
      expect(json.commentCount).toBe(0);
    });
  });

  describe('Bulk update endpoint (POST with body)', () => {
    it('receives body and updates records', async () => {
      const post1 = db.post.create({ title: 'Post 1', content: 'Content', authorId: 'user', published: false });
      const post2 = db.post.create({ title: 'Post 2', content: 'Content', authorId: 'user', published: false });
      const post3 = db.post.create({ title: 'Post 3', content: 'Content', authorId: 'user', published: false });

      const response = await fetch('http://localhost/api/posts/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [post1.id, post2.id],
          data: { published: true },
        }),
      });
      const json = await response.json() as { updated: number; ids: string[] };

      expect(response.status).toBe(200);
      expect(json.updated).toBe(2);
      expect(json.ids).toHaveLength(2);

      // Verify updates
      const updated1 = db.post.findFirst({ where: { id: { equals: post1.id } } });
      const updated2 = db.post.findFirst({ where: { id: { equals: post2.id } } });
      const unchanged3 = db.post.findFirst({ where: { id: { equals: post3.id } } });

      expect(updated1?.published).toBe(true);
      expect(updated2?.published).toBe(true);
      expect(unchanged3?.published).toBe(false);
    });

    it('handles non-existent IDs gracefully', async () => {
      const response = await fetch('http://localhost/api/posts/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['non-existent-1', 'non-existent-2'],
          data: { published: true },
        }),
      });
      const json = await response.json() as { updated: number; ids: string[] };

      expect(response.status).toBe(200);
      expect(json.updated).toBe(0);
      expect(json.ids).toHaveLength(0);
    });

    it('returns error for missing body fields', async () => {
      const response = await fetch('http://localhost/api/posts/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { published: true } }),
      });
      const json = await response.json() as { error: string };

      expect(response.status).toBe(400);
      expect(json.error).toContain('ids');
    });
  });

  describe('Protected endpoint (with middleware)', () => {
    it('applies auth middleware and receives context', async () => {
      const userId = 'auth-user-uuid';
      const token = createMockJwt({ sub: userId, role: 'user' });

      const response = await fetch('http://localhost/api/protected/action', {
        method: 'POST',
        headers: createAuthHeaders(token),
        body: JSON.stringify({ action: 'do-something' }),
      });
      const json = await response.json() as { success: boolean; executedBy: string; role: string };

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.executedBy).toBe(userId);
      expect(json.role).toBe('user');
    });

    it('rejects request without auth', async () => {
      const response = await fetch('http://localhost/api/protected/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'do-something' }),
      });
      const json = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(json.error).toBe('Authentication required');
    });
  });

  describe('Dashboard endpoint (complex response)', () => {
    it('resolves with complex nested response', async () => {
      // Seed data
      db.user.create({ name: 'User 1', email: 'user1@test.com' });
      db.user.create({ name: 'User 2', email: 'user2@test.com' });

      db.post.create({ title: 'Published Post', content: 'Content', authorId: 'user-1', published: true, viewCount: 100 });
      db.post.create({ title: 'Draft Post', content: 'Content', authorId: 'user-1', published: false, viewCount: 0 });

      db.comment.create({ content: 'Comment 1', postId: 'post-1', userId: 'user-2' });

      const response = await fetch('http://localhost/api/dashboard/summary');
      const json = await response.json() as {
        stats: {
          users: number;
          posts: number;
          comments: number;
          publishedPosts: number;
          totalViews: number;
        };
        recentPosts: Array<{ id: string; title: string; published: boolean }>;
      };

      expect(response.status).toBe(200);
      expect(json.stats.users).toBe(2);
      expect(json.stats.posts).toBe(2);
      expect(json.stats.comments).toBe(1);
      expect(json.stats.publishedPosts).toBe(1);
      expect(json.stats.totalViews).toBe(100);
      expect(json.recentPosts).toHaveLength(2);
    });
  });

  describe('Resolver db access', () => {
    it('resolver can query database', async () => {
      // This is implicitly tested in search endpoint
      db.post.create({ title: 'Searchable', content: 'Content', authorId: 'user' });

      const response = await fetch('http://localhost/api/search?q=searchable');
      const json = await response.json() as { results: unknown[] };

      expect(response.status).toBe(200);
      expect(json.results).toHaveLength(1);
    });

    it('resolver can write to database', async () => {
      const post = db.post.create({
        title: 'Original',
        content: 'Content',
        authorId: 'user',
        published: false,
      });

      await fetch('http://localhost/api/posts/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [post.id],
          data: { published: true },
        }),
      });

      // Verify write persisted
      const updated = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(updated?.published).toBe(true);
    });
  });
});
