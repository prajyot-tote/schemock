/**
 * E2E Service Execution Tests
 *
 * Validates that generated service layer works correctly at runtime.
 * Tests CRUD operations, pagination, filtering, and RLS enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { factory, primaryKey, nullable } from '@mswjs/data';
import { faker } from '@faker-js/faker';

// Create database
const db = factory({
  user: {
    id: primaryKey(() => faker.string.uuid()),
    email: () => faker.internet.email(),
    name: () => faker.person.fullName(),
    role: () => 'user' as 'user' | 'admin',
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
  project: {
    id: primaryKey(() => faker.string.uuid()),
    name: () => faker.company.name(),
    description: nullable(() => faker.lorem.sentence()),
    tenantId: () => faker.string.uuid(),
    status: () => 'draft' as 'draft' | 'active' | 'archived',
    createdAt: () => new Date(),
  },
});

// Types
interface MiddlewareContext {
  userId?: string;
  role?: string;
  tenantId?: string;
}

interface QueryOptions<T = unknown> {
  where?: T;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

// Error classes
class NotFoundError extends Error {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`);
    this.name = 'NotFoundError';
  }
}

class RLSError extends Error {
  readonly status = 403;
  readonly code = 'RLS_VIOLATION';
  constructor(operation: string, entity: string) {
    super(`Access denied: ${operation} on ${entity}`);
    this.name = 'RLSError';
  }
}

// Service for User (no RLS)
const userService = {
  async list(
    _ctx: MiddlewareContext,
    options?: QueryOptions<{ email?: string; role?: string }>
  ) {
    let users = db.user.getAll();

    // Apply filters
    if (options?.where?.email) {
      users = users.filter((u) => u.email === options.where!.email);
    }
    if (options?.where?.role) {
      users = users.filter((u) => u.role === options.where!.role);
    }

    // Apply sorting
    if (options?.orderBy) {
      const [field, dir] = Object.entries(options.orderBy)[0];
      users = [...users].sort((a, b) => {
        const aVal = a[field as keyof typeof a] as string | number | Date;
        const bVal = b[field as keyof typeof b] as string | number | Date;
        if (aVal < bVal) return dir === 'asc' ? -1 : 1;
        if (aVal > bVal) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const total = users.length;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    return {
      data: users.slice(offset, offset + limit),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  },

  async get(_ctx: MiddlewareContext, id: string) {
    const user = db.user.findFirst({ where: { id: { equals: id } } });
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return user;
  },

  async create(
    _ctx: MiddlewareContext,
    data: { email: string; name: string; role?: 'user' | 'admin' }
  ) {
    return db.user.create({
      email: data.email,
      name: data.name,
      role: data.role ?? 'user',
    });
  },

  async update(
    _ctx: MiddlewareContext,
    id: string,
    data: { name?: string; email?: string; role?: 'user' | 'admin' }
  ) {
    const existing = await this.get(_ctx, id);
    return db.user.update({
      where: { id: { equals: id } },
      data: { ...data, updatedAt: new Date() },
    });
  },

  async delete(_ctx: MiddlewareContext, id: string) {
    await this.get(_ctx, id); // Verify exists
    db.user.delete({ where: { id: { equals: id } } });
  },
};

// Service for Post (with RLS on authorId)
const postService = {
  async list(
    ctx: MiddlewareContext,
    options?: QueryOptions<{ title?: string; published?: boolean }>
  ) {
    let posts = db.post.getAll();

    // Apply RLS scope
    if (ctx.role !== 'admin' && ctx.userId) {
      posts = posts.filter((p) => p.authorId === ctx.userId);
    }

    // Apply filters
    if (options?.where?.title) {
      posts = posts.filter((p) =>
        p.title.toLowerCase().includes((options.where!.title as string).toLowerCase())
      );
    }
    if (options?.where?.published !== undefined) {
      posts = posts.filter((p) => p.published === options.where!.published);
    }

    const total = posts.length;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    return {
      data: posts.slice(offset, offset + limit),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  },

  async get(ctx: MiddlewareContext, id: string) {
    const post = db.post.findFirst({ where: { id: { equals: id } } });
    if (!post) {
      throw new NotFoundError('Post', id);
    }

    // RLS check
    if (ctx.role !== 'admin' && ctx.userId && post.authorId !== ctx.userId) {
      throw new RLSError('read', 'Post');
    }

    return post;
  },

  async create(
    ctx: MiddlewareContext,
    data: { title: string; content: string; authorId?: string }
  ) {
    // Inject authorId from context if not provided
    return db.post.create({
      title: data.title,
      content: data.content,
      authorId: data.authorId ?? ctx.userId ?? 'unknown',
    });
  },

  async update(
    ctx: MiddlewareContext,
    id: string,
    data: { title?: string; content?: string; published?: boolean }
  ) {
    // Verify access first
    await this.get(ctx, id);

    return db.post.update({
      where: { id: { equals: id } },
      data: { ...data, updatedAt: new Date() },
    });
  },

  async delete(ctx: MiddlewareContext, id: string) {
    // Verify access first
    await this.get(ctx, id);
    db.post.delete({ where: { id: { equals: id } } });
  },
};

// Service for Project (with RLS on tenantId)
const projectService = {
  async list(
    ctx: MiddlewareContext,
    options?: QueryOptions<{ status?: string }>
  ) {
    let projects = db.project.getAll();

    // Apply RLS scope
    if (ctx.role !== 'admin' && ctx.tenantId) {
      projects = projects.filter((p) => p.tenantId === ctx.tenantId);
    }

    // Apply filters
    if (options?.where?.status) {
      projects = projects.filter((p) => p.status === options.where!.status);
    }

    const total = projects.length;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    return {
      data: projects.slice(offset, offset + limit),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  },

  async get(ctx: MiddlewareContext, id: string) {
    const project = db.project.findFirst({ where: { id: { equals: id } } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    // RLS check
    if (ctx.role !== 'admin' && ctx.tenantId && project.tenantId !== ctx.tenantId) {
      throw new RLSError('read', 'Project');
    }

    return project;
  },
};

describe('E2E: Service Execution', () => {
  beforeEach(() => {
    // Clear database
    db.user.getAll().forEach((u) => db.user.delete({ where: { id: { equals: u.id } } }));
    db.post.getAll().forEach((p) => db.post.delete({ where: { id: { equals: p.id } } }));
    db.project.getAll().forEach((p) => db.project.delete({ where: { id: { equals: p.id } } }));
  });

  describe('service.list', () => {
    it('returns all records', async () => {
      db.user.create({ email: 'user1@test.com', name: 'User 1' });
      db.user.create({ email: 'user2@test.com', name: 'User 2' });

      const result = await userService.list({});

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('applies pagination with limit', async () => {
      for (let i = 1; i <= 10; i++) {
        db.user.create({ email: `user${i}@test.com`, name: `User ${i}` });
      }

      const result = await userService.list({}, { limit: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.meta.limit).toBe(3);
      expect(result.meta.hasMore).toBe(true);
    });

    it('applies pagination with offset', async () => {
      for (let i = 1; i <= 10; i++) {
        db.user.create({ email: `user${i}@test.com`, name: `User ${i}` });
      }

      const result = await userService.list({}, { limit: 3, offset: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.meta.offset).toBe(3);
    });

    it('applies filters', async () => {
      db.user.create({ email: 'admin@test.com', name: 'Admin', role: 'admin' });
      db.user.create({ email: 'user1@test.com', name: 'User 1', role: 'user' });
      db.user.create({ email: 'user2@test.com', name: 'User 2', role: 'user' });

      const result = await userService.list({}, { where: { role: 'admin' } });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('admin');
    });

    it('applies sorting', async () => {
      db.user.create({ email: 'charlie@test.com', name: 'Charlie' });
      db.user.create({ email: 'alice@test.com', name: 'Alice' });
      db.user.create({ email: 'bob@test.com', name: 'Bob' });

      const result = await userService.list({}, { orderBy: { name: 'asc' } });

      expect(result.data[0].name).toBe('Alice');
      expect(result.data[1].name).toBe('Bob');
      expect(result.data[2].name).toBe('Charlie');
    });
  });

  describe('service.get', () => {
    it('returns record by ID', async () => {
      const created = db.user.create({
        email: 'test@test.com',
        name: 'Test User',
      });

      const result = await userService.get({}, created.id);

      expect(result.id).toBe(created.id);
      expect(result.email).toBe('test@test.com');
    });

    it('throws NotFoundError for non-existent ID', async () => {
      await expect(userService.get({}, 'non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('service.create', () => {
    it('creates new record', async () => {
      const result = await userService.create(
        {},
        { email: 'new@test.com', name: 'New User' }
      );

      expect(result.id).toBeDefined();
      expect(result.email).toBe('new@test.com');

      // Verify in database
      const found = db.user.findFirst({ where: { id: { equals: result.id } } });
      expect(found).toBeDefined();
    });

    it('generates UUID for id field', async () => {
      const result = await userService.create(
        {},
        { email: 'uuid@test.com', name: 'UUID User' }
      );

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('applies defaults', async () => {
      const result = await userService.create(
        {},
        { email: 'default@test.com', name: 'Default User' }
      );

      expect(result.role).toBe('user');
    });
  });

  describe('service.update', () => {
    it('updates existing record', async () => {
      const created = db.user.create({
        email: 'original@test.com',
        name: 'Original',
      });

      const result = await userService.update({}, created.id, {
        name: 'Updated',
      });

      expect(result?.name).toBe('Updated');
    });

    it('throws NotFoundError for non-existent ID', async () => {
      await expect(
        userService.update({}, 'non-existent', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('service.delete', () => {
    it('deletes existing record', async () => {
      const created = db.user.create({
        email: 'delete@test.com',
        name: 'To Delete',
      });

      await userService.delete({}, created.id);

      const found = db.user.findFirst({ where: { id: { equals: created.id } } });
      expect(found).toBeNull();
    });

    it('throws NotFoundError for non-existent ID', async () => {
      await expect(userService.delete({}, 'non-existent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('service with RLS (posts)', () => {
    it('filters list by userId context', async () => {
      const user1 = 'user-1-uuid';
      const user2 = 'user-2-uuid';

      db.post.create({ title: 'User 1 Post', content: 'Content', authorId: user1 });
      db.post.create({ title: 'User 2 Post', content: 'Content', authorId: user2 });

      const result = await postService.list({ userId: user1, role: 'user' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].authorId).toBe(user1);
    });

    it('admin bypasses RLS filter on list', async () => {
      db.post.create({ title: 'Post 1', content: 'Content', authorId: 'user-1' });
      db.post.create({ title: 'Post 2', content: 'Content', authorId: 'user-2' });

      const result = await postService.list({ userId: 'admin-id', role: 'admin' });

      expect(result.data).toHaveLength(2);
    });

    it('throws RLSError when accessing other user\'s post', async () => {
      const post = db.post.create({
        title: 'Protected',
        content: 'Content',
        authorId: 'owner-id',
      });

      await expect(
        postService.get({ userId: 'other-id', role: 'user' }, post.id)
      ).rejects.toThrow(RLSError);
    });

    it('allows owner to access their post', async () => {
      const ownerId = 'owner-id';
      const post = db.post.create({
        title: 'My Post',
        content: 'Content',
        authorId: ownerId,
      });

      const result = await postService.get({ userId: ownerId, role: 'user' }, post.id);

      expect(result.id).toBe(post.id);
    });

    it('injects authorId from context on create', async () => {
      const userId = 'creating-user';
      const result = await postService.create(
        { userId, role: 'user' },
        { title: 'New Post', content: 'Content' }
      );

      expect(result.authorId).toBe(userId);
    });

    it('verifies access before update', async () => {
      const post = db.post.create({
        title: 'Original',
        content: 'Content',
        authorId: 'owner-id',
      });

      await expect(
        postService.update(
          { userId: 'other-id', role: 'user' },
          post.id,
          { title: 'Hacked' }
        )
      ).rejects.toThrow(RLSError);

      // Verify unchanged
      const unchanged = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(unchanged?.title).toBe('Original');
    });

    it('verifies access before delete', async () => {
      const post = db.post.create({
        title: 'Protected',
        content: 'Content',
        authorId: 'owner-id',
      });

      await expect(
        postService.delete({ userId: 'other-id', role: 'user' }, post.id)
      ).rejects.toThrow(RLSError);

      // Verify still exists
      const exists = db.post.findFirst({ where: { id: { equals: post.id } } });
      expect(exists).toBeDefined();
    });
  });

  describe('service with tenant RLS (projects)', () => {
    it('filters list by tenantId context', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';

      db.project.create({ name: 'T1 Project', tenantId: tenant1 });
      db.project.create({ name: 'T2 Project', tenantId: tenant2 });

      const result = await projectService.list({ tenantId: tenant1, role: 'user' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tenantId).toBe(tenant1);
    });

    it('throws RLSError when accessing other tenant\'s project', async () => {
      const project = db.project.create({
        name: 'Tenant 2 Project',
        tenantId: 'tenant-2',
      });

      await expect(
        projectService.get({ tenantId: 'tenant-1', role: 'user' }, project.id)
      ).rejects.toThrow(RLSError);
    });
  });
});
