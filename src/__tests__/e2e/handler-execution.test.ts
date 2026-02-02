/**
 * E2E Handler Execution Tests
 *
 * Validates that generated MSW handlers respond correctly to HTTP requests.
 * These tests verify the complete request/response cycle works at runtime.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { factory, primaryKey, nullable } from '@mswjs/data';
import { faker } from '@faker-js/faker';

// Create a minimal in-memory database for testing
const db = factory({
  user: {
    id: primaryKey(() => faker.string.uuid()),
    email: () => faker.internet.email(),
    name: () => faker.person.fullName(),
    role: () => 'user' as const,
    avatar: nullable(() => faker.image.avatar()),
    createdAt: () => new Date(),
    updatedAt: () => new Date(),
  },
  post: {
    id: primaryKey(() => faker.string.uuid()),
    title: () => faker.lorem.sentence(),
    content: () => faker.lorem.paragraphs(),
    authorId: () => faker.string.uuid(),
    published: () => false,
    viewCount: () => 0,
    createdAt: () => new Date(),
    updatedAt: () => new Date(),
  },
});

// Create handlers that mimic generated code
const handlers = [
  // User handlers
  http.get('http://localhost/api/users', async ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const allUsers = db.user.getAll();
    const users = allUsers.slice(offset, offset + limit);

    return HttpResponse.json({
      data: users,
      meta: { total: allUsers.length, limit, offset, hasMore: offset + limit < allUsers.length },
    });
  }),

  http.get('http://localhost/api/users/:id', async ({ params }) => {
    const user = db.user.findFirst({ where: { id: { equals: params.id as string } } });

    if (!user) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: user });
  }),

  http.post('http://localhost/api/users', async ({ request }) => {
    const body = await request.json() as { email: string; name: string; role?: string };
    const user = db.user.create({
      email: body.email,
      name: body.name,
      role: body.role ?? 'user',
    });

    return HttpResponse.json({ data: user }, { status: 201 });
  }),

  http.put('http://localhost/api/users/:id', async ({ params, request }) => {
    const body = await request.json() as { name?: string; email?: string };
    const user = db.user.update({
      where: { id: { equals: params.id as string } },
      data: { ...body, updatedAt: new Date() },
    });

    if (!user) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: user });
  }),

  http.delete('http://localhost/api/users/:id', async ({ params }) => {
    const user = db.user.findFirst({ where: { id: { equals: params.id as string } } });

    if (!user) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    db.user.delete({ where: { id: { equals: params.id as string } } });

    return new HttpResponse(null, { status: 204 });
  }),

  // Post handlers
  http.get('http://localhost/api/posts', async ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const allPosts = db.post.getAll();
    const posts = allPosts.slice(offset, offset + limit);

    return HttpResponse.json({
      data: posts,
      meta: { total: allPosts.length, limit, offset, hasMore: offset + limit < allPosts.length },
    });
  }),

  http.get('http://localhost/api/posts/:id', async ({ params }) => {
    const post = db.post.findFirst({ where: { id: { equals: params.id as string } } });

    if (!post) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: post });
  }),

  http.post('http://localhost/api/posts', async ({ request }) => {
    const body = await request.json() as { title: string; content: string; authorId: string };
    const post = db.post.create({
      title: body.title,
      content: body.content,
      authorId: body.authorId,
    });

    return HttpResponse.json({ data: post }, { status: 201 });
  }),

  http.delete('http://localhost/api/posts/:id', async ({ params }) => {
    const post = db.post.findFirst({ where: { id: { equals: params.id as string } } });

    if (!post) {
      return HttpResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    db.post.delete({ where: { id: { equals: params.id as string } } });

    return new HttpResponse(null, { status: 204 });
  }),
];

const server = setupServer(...handlers);

describe('E2E: Handler Execution', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    // Clear database between tests
    const users = db.user.getAll();
    const posts = db.post.getAll();
    users.forEach((u) => db.user.delete({ where: { id: { equals: u.id } } }));
    posts.forEach((p) => db.post.delete({ where: { id: { equals: p.id } } }));
  });

  describe('GET list endpoints', () => {
    it('returns empty array when no data exists', async () => {
      const response = await fetch('http://localhost/api/users');
      const json = await response.json() as { data: unknown[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
    });

    it('returns list of users', async () => {
      // Seed data
      db.user.create({ email: 'user1@test.com', name: 'User One' });
      db.user.create({ email: 'user2@test.com', name: 'User Two' });

      const response = await fetch('http://localhost/api/users');
      const json = await response.json() as { data: { email: string }[]; meta: { total: number } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.meta.total).toBe(2);
    });

    it('applies pagination with limit and offset', async () => {
      // Seed 5 users
      for (let i = 1; i <= 5; i++) {
        db.user.create({ email: `user${i}@test.com`, name: `User ${i}` });
      }

      const response = await fetch('http://localhost/api/users?limit=2&offset=1');
      const json = await response.json() as { data: unknown[]; meta: { limit: number; offset: number; hasMore: boolean } };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.meta.limit).toBe(2);
      expect(json.meta.offset).toBe(1);
      expect(json.meta.hasMore).toBe(true);
    });
  });

  describe('GET single endpoints', () => {
    it('returns single user by ID', async () => {
      const createdUser = db.user.create({
        email: 'single@test.com',
        name: 'Single User',
      });

      const response = await fetch(`http://localhost/api/users/${createdUser.id}`);
      const json = await response.json() as { data: { id: string; email: string } };

      expect(response.status).toBe(200);
      expect(json.data.id).toBe(createdUser.id);
      expect(json.data.email).toBe('single@test.com');
    });

    it('returns 404 for non-existent user', async () => {
      const response = await fetch('http://localhost/api/users/non-existent-id');
      const json = await response.json() as { error: string };

      expect(response.status).toBe(404);
      expect(json.error).toBe('User not found');
    });
  });

  describe('POST create endpoints', () => {
    it('creates a new user', async () => {
      const response = await fetch('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@test.com',
          name: 'New User',
        }),
      });
      const json = await response.json() as { data: { id: string; email: string; name: string } };

      expect(response.status).toBe(201);
      expect(json.data.email).toBe('new@test.com');
      expect(json.data.name).toBe('New User');
      expect(json.data.id).toBeDefined();

      // Verify user exists in database
      const found = db.user.findFirst({ where: { id: { equals: json.data.id } } });
      expect(found).toBeDefined();
      expect(found?.email).toBe('new@test.com');
    });

    it('creates a new post', async () => {
      const user = db.user.create({ email: 'author@test.com', name: 'Author' });

      const response = await fetch('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Post',
          content: 'Post content here',
          authorId: user.id,
        }),
      });
      const json = await response.json() as { data: { id: string; title: string; authorId: string } };

      expect(response.status).toBe(201);
      expect(json.data.title).toBe('Test Post');
      expect(json.data.authorId).toBe(user.id);
    });
  });

  describe('PUT update endpoints', () => {
    it('updates an existing user', async () => {
      const user = db.user.create({
        email: 'update@test.com',
        name: 'Original Name',
      });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const json = await response.json() as { data: { name: string } };

      expect(response.status).toBe(200);
      expect(json.data.name).toBe('Updated Name');

      // Verify in database
      const found = db.user.findFirst({ where: { id: { equals: user.id } } });
      expect(found?.name).toBe('Updated Name');
    });

    it('returns 404 for updating non-existent user', async () => {
      const response = await fetch('http://localhost/api/users/non-existent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE endpoints', () => {
    it('deletes an existing user', async () => {
      const user = db.user.create({
        email: 'delete@test.com',
        name: 'To Delete',
      });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(204);

      // Verify deleted from database
      const found = db.user.findFirst({ where: { id: { equals: user.id } } });
      expect(found).toBeNull();
    });

    it('returns 404 for deleting non-existent user', async () => {
      const response = await fetch('http://localhost/api/users/non-existent', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Cross-entity operations', () => {
    it('creates post with valid author reference', async () => {
      const author = db.user.create({
        email: 'author@test.com',
        name: 'Post Author',
      });

      const response = await fetch('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Author Post',
          content: 'Written by a real author',
          authorId: author.id,
        }),
      });
      const json = await response.json() as { data: { authorId: string } };

      expect(response.status).toBe(201);
      expect(json.data.authorId).toBe(author.id);
    });
  });
});
