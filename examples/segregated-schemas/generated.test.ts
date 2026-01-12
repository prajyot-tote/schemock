/**
 * Tests for segregated schemas generated code
 *
 * Verifies that:
 * 1. All entities from different files are available in db
 * 2. Cross-file references (FKs) work correctly
 * 3. Custom endpoints can access all entities
 * 4. Seeding works across all entities
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './generated/db';
import { seed, reset, getAll } from './generated/seed';
import { endpointResolvers } from './generated/endpoint-resolvers';

describe('Segregated Schemas - Generated Code', () => {
  beforeEach(() => {
    // Reset database before each test
    reset();
  });

  describe('Database Factory', () => {
    it('should have all entities from entities/ directory', () => {
      // User, Post, Comment are in separate files under entities/
      expect(db.user).toBeDefined();
      expect(db.post).toBeDefined();
      expect(db.comment).toBeDefined();
    });

    it('should create user entity', () => {
      const user = db.user.create({
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('user');
    });

    it('should create post with FK to user (cross-file reference)', () => {
      // User is in entities/user.ts, Post is in entities/post.ts
      const user = db.user.create({
        email: 'author@example.com',
        name: 'Author',
      });

      const post = db.post.create({
        title: 'Test Post',
        content: 'Content here',
        authorId: user.id, // FK reference to user
        published: true,
      });

      expect(post.authorId).toBe(user.id);
      expect(post.title).toBe('Test Post');
    });

    it('should create comment with FKs to both user and post (multi-file reference)', () => {
      // Comment references both User and Post from different files
      const user = db.user.create({ email: 'u@test.com', name: 'User' });
      const post = db.post.create({
        title: 'Post',
        content: 'Content',
        authorId: user.id,
      });

      const comment = db.comment.create({
        content: 'Great post!',
        userId: user.id,
        postId: post.id,
      });

      expect(comment.userId).toBe(user.id);
      expect(comment.postId).toBe(post.id);
    });
  });

  describe('Seed Functions', () => {
    it('should seed all entities', () => {
      seed();

      const users = db.user.getAll();
      const posts = db.post.getAll();
      const comments = db.comment.getAll();

      // Config specifies: user: 5, post: 15, comment: 30
      expect(users.length).toBe(5);
      expect(posts.length).toBe(15);
      expect(comments.length).toBe(30);
    });

    it('should reset all entities', () => {
      seed();
      expect(db.user.getAll().length).toBeGreaterThan(0);

      reset();

      expect(db.user.getAll().length).toBe(0);
      expect(db.post.getAll().length).toBe(0);
      expect(db.comment.getAll().length).toBe(0);
    });

    it('should get all entities via getAll helper', () => {
      seed();
      const all = getAll();

      // Keys match entity names (singular)
      expect(all.user.length).toBe(5);
      expect(all.post.length).toBe(15);
      expect(all.comment.length).toBe(30);
    });
  });

  describe('Cross-File Queries', () => {
    it('should query posts by authorId (FK from different file)', () => {
      const user = db.user.create({ email: 'a@b.com', name: 'Author' });
      db.post.create({ title: 'Post 1', content: 'C1', authorId: user.id });
      db.post.create({ title: 'Post 2', content: 'C2', authorId: user.id });
      db.post.create({ title: 'Other', content: 'C3', authorId: 'other-id' });

      const userPosts = db.post.findMany({
        where: { authorId: { equals: user.id } },
      });

      expect(userPosts.length).toBe(2);
      expect(userPosts.every((p) => p.authorId === user.id)).toBe(true);
    });

    it('should query comments by postId and userId', () => {
      const user = db.user.create({ email: 'u@t.com', name: 'User' });
      const post = db.post.create({
        title: 'Post',
        content: 'C',
        authorId: user.id,
      });

      db.comment.create({ content: 'C1', userId: user.id, postId: post.id });
      db.comment.create({ content: 'C2', userId: user.id, postId: post.id });
      db.comment.create({ content: 'C3', userId: 'other', postId: post.id });

      const userComments = db.comment.findMany({
        where: { userId: { equals: user.id } },
      });

      expect(userComments.length).toBe(2);
    });
  });

  describe('Endpoint Resolvers (from endpoints/ directory)', () => {
    beforeEach(() => {
      // Create test data
      const user1 = db.user.create({
        email: 'john@example.com',
        name: 'John Doe',
        role: 'user',
      });
      const user2 = db.user.create({
        email: 'jane@example.com',
        name: 'Jane Smith',
        role: 'admin',
      });

      db.post.create({
        title: 'Hello World',
        content: 'First post',
        authorId: user1.id,
        published: true,
        views: 100,
      });
      db.post.create({
        title: 'Another Post',
        content: 'Second post',
        authorId: user1.id,
        published: false,
        views: 50,
      });
      db.post.create({
        title: 'Jane Post',
        content: 'By Jane',
        authorId: user2.id,
        published: true,
        views: 200,
      });

      db.comment.create({ content: 'Nice!', userId: user2.id, postId: db.post.getAll()[0].id });
      db.comment.create({ content: 'Great!', userId: user1.id, postId: db.post.getAll()[0].id });
    });

    it('should run search endpoint across users and posts', async () => {
      // Search endpoint is in endpoints/search.ts
      // It queries db.user and db.post (from entities/ directory)
      const result = await endpointResolvers.search({
        params: { q: 'john', type: 'all', limit: 10 },
        body: {},
        db,
        headers: {},
      });

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('posts');
      expect(result).toHaveProperty('total');
    });

    it('should run userStats endpoint accessing posts and comments', async () => {
      // usersByUserIdStats endpoint is in endpoints/bulk-operations.ts
      // It queries db.post and db.comment (from entities/ directory)
      const user = db.user.getAll()[0];

      const result = await endpointResolvers.usersByUserIdStats({
        params: { userId: user.id },
        body: {},
        db,
        headers: {},
      });

      expect(result).toHaveProperty('postCount');
      expect(result).toHaveProperty('commentCount');
      expect(result).toHaveProperty('totalViews');
      expect(result).toHaveProperty('publishedPosts');

      // User1 has 2 posts
      expect(result.postCount).toBe(2);
      // User1 has 1 comment
      expect(result.commentCount).toBe(1);
      // Total views: 100 + 50 = 150
      expect(result.totalViews).toBe(150);
      // 1 published post
      expect(result.publishedPosts).toBe(1);
    });
  });

  describe('Bulk Operations (from endpoints/ directory)', () => {
    it('should bulk publish posts', async () => {
      const user = db.user.create({ email: 'u@t.com', name: 'User' });
      const post1 = db.post.create({
        title: 'P1',
        content: 'C1',
        authorId: user.id,
        published: false,
      });
      const post2 = db.post.create({
        title: 'P2',
        content: 'C2',
        authorId: user.id,
        published: false,
      });

      // Verify posts are unpublished
      expect(db.post.findFirst({ where: { id: { equals: post1.id } } })?.published).toBe(false);

      // Bulk publish is in endpoints/bulk-operations.ts
      const resolver = endpointResolvers.postsBulkPublish;
      const result = await resolver({
        params: {},
        body: { ids: [post1.id, post2.id], published: true },
        db,
        headers: {},
      });

      expect(result.updated).toBe(2);

      // Verify posts are now published
      expect(db.post.findFirst({ where: { id: { equals: post1.id } } })?.published).toBe(true);
      expect(db.post.findFirst({ where: { id: { equals: post2.id } } })?.published).toBe(true);
    });

    it('should bulk delete posts', async () => {
      const user = db.user.create({ email: 'u@t.com', name: 'User' });
      const post1 = db.post.create({
        title: 'P1',
        content: 'C1',
        authorId: user.id,
      });
      const post2 = db.post.create({
        title: 'P2',
        content: 'C2',
        authorId: user.id,
      });

      expect(db.post.getAll().length).toBe(2);

      // Bulk delete is in endpoints/bulk-operations.ts
      const resolver = endpointResolvers.postsBulkDelete;
      const result = await resolver({
        params: {},
        body: { ids: [post1.id, post2.id] },
        db,
        headers: {},
      });

      expect(result.deleted).toBe(2);
      expect(db.post.getAll().length).toBe(0);
    });
  });
});
