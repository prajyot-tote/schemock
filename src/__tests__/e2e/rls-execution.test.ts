/**
 * E2E RLS Execution Tests
 *
 * Validates that Row-Level Security filtering works at runtime.
 * Tests scope-based filtering and bypass conditions.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { factory, primaryKey, nullable } from '@mswjs/data';
import { faker } from '@faker-js/faker';
import { createMockJwt, createAuthHeaders } from './utils/test-helpers';

// Create database with RLS-enabled entities
const db = factory({
  user: {
    id: primaryKey(() => faker.string.uuid()),
    email: () => faker.internet.email(),
    name: () => faker.person.fullName(),
    role: () => 'user' as const,
    createdAt: () => new Date(),
  },
  post: {
    id: primaryKey(() => faker.string.uuid()),
    title: () => faker.lorem.sentence(),
    content: () => faker.lorem.paragraphs(),
    authorId: () => faker.string.uuid(),
    published: () => false,
    createdAt: () => new Date(),
  },
  project: {
    id: primaryKey(() => faker.string.uuid()),
    name: () => faker.company.name(),
    description: nullable(() => faker.lorem.sentence()),
    tenantId: () => faker.string.uuid(),
    ownerId: () => faker.string.uuid(),
    createdAt: () => new Date(),
  },
});

// RLS types
interface RLSContext {
  userId?: string;
  role?: string;
  tenantId?: string;
}

// JWT decoder for mock testing
function decodeJwtPayload(token: string): RLSContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Extract context from headers
function extractContextFromHeaders(headers: Headers): RLSContext {
  const ctx: RLSContext = {};
  const authHeader = headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = decodeJwtPayload(token);
    if (payload) {
      ctx.userId = payload.sub as string ?? payload.userId;
      ctx.role = payload.role;
      ctx.tenantId = payload.tenant_id as string ?? payload.tenantId;
    }
  }
  return ctx;
}

// RLS check helper for posts (authorId-based)
function checkPostRLS(post: { authorId: string }, ctx: RLSContext): boolean {
  // Admin bypass
  if (ctx.role === 'admin') return true;
  // Scope check
  return post.authorId === ctx.userId;
}

// RLS check helper for projects (tenantId-based)
function checkProjectRLS(project: { tenantId: string }, ctx: RLSContext): boolean {
  // Admin bypass
  if (ctx.role === 'admin') return true;
  // Scope check
  return project.tenantId === ctx.tenantId;
}

// Handlers with RLS enforcement
const handlers = [
  // Posts with RLS (authorId scope)
  http.get('http://localhost/api/posts', async ({ request }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let posts = db.post.getAll();

    // Apply RLS filter
    posts = posts.filter((p) => checkPostRLS(p, ctx));

    return HttpResponse.json({
      data: posts.slice(0, limit),
      meta: { total: posts.length },
    });
  }),

  http.get('http://localhost/api/posts/:id', async ({ request, params }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const post = db.post.findFirst({ where: { id: { equals: params.id as string } } });

    if (!post) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // RLS check - return 404 for security (don't reveal existence)
    if (!checkPostRLS(post, ctx)) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: post });
  }),

  http.post('http://localhost/api/posts', async ({ request }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const body = await request.json() as { title: string; content: string };

    // Inject authorId from context
    const post = db.post.create({
      title: body.title,
      content: body.content,
      authorId: ctx.userId || 'unknown',
    });

    return HttpResponse.json({ data: post }, { status: 201 });
  }),

  http.put('http://localhost/api/posts/:id', async ({ request, params }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const body = await request.json() as { title?: string; content?: string };
    const post = db.post.findFirst({ where: { id: { equals: params.id as string } } });

    if (!post) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // RLS check
    if (!checkPostRLS(post, ctx)) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const updated = db.post.update({
      where: { id: { equals: params.id as string } },
      data: body,
    });

    return HttpResponse.json({ data: updated });
  }),

  http.delete('http://localhost/api/posts/:id', async ({ request, params }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const post = db.post.findFirst({ where: { id: { equals: params.id as string } } });

    if (!post) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // RLS check
    if (!checkPostRLS(post, ctx)) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    db.post.delete({ where: { id: { equals: params.id as string } } });
    return new HttpResponse(null, { status: 204 });
  }),

  // Projects with RLS (tenantId scope)
  http.get('http://localhost/api/projects', async ({ request }) => {
    const ctx = extractContextFromHeaders(request.headers);
    let projects = db.project.getAll();

    // Apply RLS filter
    projects = projects.filter((p) => checkProjectRLS(p, ctx));

    return HttpResponse.json({
      data: projects,
      meta: { total: projects.length },
    });
  }),

  http.get('http://localhost/api/projects/:id', async ({ request, params }) => {
    const ctx = extractContextFromHeaders(request.headers);
    const project = db.project.findFirst({ where: { id: { equals: params.id as string } } });

    if (!project) {
      return HttpResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // RLS check
    if (!checkProjectRLS(project, ctx)) {
      return HttpResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: project });
  }),
];

const server = setupServer(...handlers);

describe('E2E: RLS Execution', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    // Clear database
    db.post.getAll().forEach((p) => db.post.delete({ where: { id: { equals: p.id } } }));
    db.project.getAll().forEach((p) => db.project.delete({ where: { id: { equals: p.id } } }));
    db.user.getAll().forEach((u) => db.user.delete({ where: { id: { equals: u.id } } }));
  });

  describe('User-scoped RLS (posts by authorId)', () => {
    it('filters list to only show user\'s own posts', async () => {
      const user1Id = 'user-1-uuid';
      const user2Id = 'user-2-uuid';

      // Create posts for different users
      db.post.create({ title: 'User 1 Post 1', content: 'Content', authorId: user1Id });
      db.post.create({ title: 'User 1 Post 2', content: 'Content', authorId: user1Id });
      db.post.create({ title: 'User 2 Post 1', content: 'Content', authorId: user2Id });

      // Request as user 1
      const token = createMockJwt({ sub: user1Id, role: 'user' });
      const response = await fetch('http://localhost/api/posts', {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: { title: string }[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.meta.total).toBe(2);
      expect(json.data.every((p) => p.title.startsWith('User 1'))).toBe(true);
    });

    it('returns 404 when accessing another user\'s post', async () => {
      const user1Id = 'user-1-uuid';
      const user2Id = 'user-2-uuid';

      // Create post for user 2
      const post = db.post.create({
        title: 'User 2 Post',
        content: 'Content',
        authorId: user2Id,
      });

      // Request as user 1
      const token = createMockJwt({ sub: user1Id, role: 'user' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        headers: createAuthHeaders(token),
      });

      // Should return 404 (not 403) for security
      expect(response.status).toBe(404);
    });

    it('injects authorId from context on create', async () => {
      const userId = 'creating-user-uuid';
      const token = createMockJwt({ sub: userId, role: 'user' });

      const response = await fetch('http://localhost/api/posts', {
        method: 'POST',
        headers: createAuthHeaders(token),
        body: JSON.stringify({
          title: 'My New Post',
          content: 'Created by me',
        }),
      });
      const json = await response.json() as { data: { authorId: string } };

      expect(response.status).toBe(201);
      expect(json.data.authorId).toBe(userId);
    });

    it('blocks update on another user\'s post', async () => {
      const user1Id = 'user-1-uuid';
      const user2Id = 'user-2-uuid';

      const post = db.post.create({
        title: 'Original Title',
        content: 'Content',
        authorId: user2Id,
      });

      // Try to update as user 1
      const token = createMockJwt({ sub: user1Id, role: 'user' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        method: 'PUT',
        headers: createAuthHeaders(token),
        body: JSON.stringify({ title: 'Hacked Title' }),
      });

      expect(response.status).toBe(404);

      // Verify post unchanged
      const unchanged = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(unchanged?.title).toBe('Original Title');
    });

    it('blocks delete on another user\'s post', async () => {
      const user1Id = 'user-1-uuid';
      const user2Id = 'user-2-uuid';

      const post = db.post.create({
        title: 'Protected Post',
        content: 'Content',
        authorId: user2Id,
      });

      // Try to delete as user 1
      const token = createMockJwt({ sub: user1Id, role: 'user' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        method: 'DELETE',
        headers: createAuthHeaders(token),
      });

      expect(response.status).toBe(404);

      // Verify post still exists
      const stillExists = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(stillExists).toBeDefined();
    });
  });

  describe('Admin bypass', () => {
    it('admin can list all posts regardless of author', async () => {
      const user1Id = 'user-1-uuid';
      const user2Id = 'user-2-uuid';

      db.post.create({ title: 'User 1 Post', content: 'Content', authorId: user1Id });
      db.post.create({ title: 'User 2 Post', content: 'Content', authorId: user2Id });

      // Request as admin
      const token = createMockJwt({ sub: 'admin-uuid', role: 'admin' });
      const response = await fetch('http://localhost/api/posts', {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: unknown[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.meta.total).toBe(2);
    });

    it('admin can access any user\'s post', async () => {
      const userId = 'regular-user-uuid';

      const post = db.post.create({
        title: 'User Post',
        content: 'Content',
        authorId: userId,
      });

      // Request as admin
      const token = createMockJwt({ sub: 'admin-uuid', role: 'admin' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: { id: string } };

      expect(response.status).toBe(200);
      expect(json.data.id).toBe(post.id);
    });

    it('admin can update any user\'s post', async () => {
      const userId = 'regular-user-uuid';

      const post = db.post.create({
        title: 'Original',
        content: 'Content',
        authorId: userId,
      });

      const token = createMockJwt({ sub: 'admin-uuid', role: 'admin' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        method: 'PUT',
        headers: createAuthHeaders(token),
        body: JSON.stringify({ title: 'Admin Edited' }),
      });
      const json = await response.json() as { data: { title: string } };

      expect(response.status).toBe(200);
      expect(json.data.title).toBe('Admin Edited');
    });

    it('admin can delete any user\'s post', async () => {
      const userId = 'regular-user-uuid';

      const post = db.post.create({
        title: 'To Delete',
        content: 'Content',
        authorId: userId,
      });

      const token = createMockJwt({ sub: 'admin-uuid', role: 'admin' });
      const response = await fetch(`http://localhost/api/posts/${post.id}`, {
        method: 'DELETE',
        headers: createAuthHeaders(token),
      });

      expect(response.status).toBe(204);

      const deleted = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(deleted).toBeNull();
    });
  });

  describe('Tenant-scoped RLS (projects by tenantId)', () => {
    it('filters list to only show tenant\'s projects', async () => {
      const tenant1 = 'tenant-1-uuid';
      const tenant2 = 'tenant-2-uuid';

      db.project.create({ name: 'Tenant 1 Project A', tenantId: tenant1, ownerId: 'owner-1' });
      db.project.create({ name: 'Tenant 1 Project B', tenantId: tenant1, ownerId: 'owner-1' });
      db.project.create({ name: 'Tenant 2 Project', tenantId: tenant2, ownerId: 'owner-2' });

      // Request as tenant 1
      const token = createMockJwt({ sub: 'user-uuid', tenantId: tenant1, role: 'user' });
      const response = await fetch('http://localhost/api/projects', {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: { name: string }[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.data.every((p) => p.name.startsWith('Tenant 1'))).toBe(true);
    });

    it('returns 404 when accessing another tenant\'s project', async () => {
      const tenant1 = 'tenant-1-uuid';
      const tenant2 = 'tenant-2-uuid';

      const project = db.project.create({
        name: 'Tenant 2 Project',
        tenantId: tenant2,
        ownerId: 'owner-2',
      });

      // Request as tenant 1
      const token = createMockJwt({ sub: 'user-uuid', tenantId: tenant1, role: 'user' });
      const response = await fetch(`http://localhost/api/projects/${project.id}`, {
        headers: createAuthHeaders(token),
      });

      expect(response.status).toBe(404);
    });

    it('admin bypasses tenant restriction', async () => {
      const tenant1 = 'tenant-1-uuid';
      const tenant2 = 'tenant-2-uuid';

      db.project.create({ name: 'Tenant 1 Project', tenantId: tenant1, ownerId: 'owner' });
      db.project.create({ name: 'Tenant 2 Project', tenantId: tenant2, ownerId: 'owner' });

      // Request as admin (no tenant restriction)
      const token = createMockJwt({ sub: 'admin-uuid', role: 'admin' });
      const response = await fetch('http://localhost/api/projects', {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: unknown[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
    });
  });

  describe('No auth header', () => {
    it('returns empty list when no token provided (no matching records)', async () => {
      db.post.create({ title: 'Some Post', content: 'Content', authorId: 'some-user' });

      // No Authorization header
      const response = await fetch('http://localhost/api/posts');
      const json = await response.json() as { data: unknown[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });
  });
});
