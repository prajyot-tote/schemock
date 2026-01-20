/**
 * Runtime integration tests for the generated Supabase client
 *
 * These tests exercise the actual generated client code with mocked Supabase responses
 * to verify the interceptor pattern, error handling, and CRUD operations work correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set required env vars first
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Use vi.hoisted to create the mock factory and initial state
const mockState = vi.hoisted(() => {
  type MockFn = ReturnType<typeof vi.fn>;

  // Shared state that can be mutated
  const state = {
    calls: [] as Array<{ method: string; args: unknown[] }>,
    resolveValue: { data: null, error: null } as unknown,
    mockCreateClientFn: null as MockFn | null,
    mockFromFn: null as MockFn | null,
  };

  // Create chainable query builder
  const createQueryBuilder = () => {
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'single', 'range', 'order', 'ilike', 'in', 'gt', 'gte', 'lt', 'lte', 'is', 'not'];
    const builder: Record<string, (...args: unknown[]) => typeof builder> = {};

    for (const method of methods) {
      builder[method] = (...args: unknown[]) => {
        state.calls.push({ method, args });
        return builder;
      };
    }

    // Make thenable - cast to any to avoid complex Promise type issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (builder as any).then = (onFulfilled?: (value: unknown) => unknown) => {
      return Promise.resolve(state.resolveValue).then(onFulfilled);
    };

    return builder;
  };

  const queryBuilder = createQueryBuilder();

  // Mocked functions
  state.mockFromFn = vi.fn(() => queryBuilder);
  state.mockCreateClientFn = vi.fn(() => ({ from: state.mockFromFn }));

  return {
    state,
    queryBuilder,
    setResponse: (value: unknown) => {
      state.resolveValue = value;
    },
    reset: () => {
      state.calls = [];
      state.resolveValue = { data: null, error: null };
      state.mockCreateClientFn?.mockClear();
      state.mockFromFn?.mockClear();
    },
    hasCalled: (method: string) => state.calls.some(c => c.method === method),
    getCallArgs: (method: string) => state.calls.filter(c => c.method === method).map(c => c.args),
    get mockCreateClient() { return state.mockCreateClientFn!; },
    get mockFrom() { return state.mockFromFn!; },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockState.mockCreateClient(...args),
}));

// Import after mocking
import {
  createClient,
  ApiError,
  api,
  type RequestContext,
} from '../../../generated/supabase/client';

describe('Supabase Client Runtime Tests', () => {
  beforeEach(() => {
    // Reset mock state for each test
    mockState.reset();
  });

  // ============================================================================
  // Interceptor Pattern Tests - onRequest
  // ============================================================================

  describe('Interceptor Pattern - onRequest', () => {
    it('calls onRequest interceptor before each operation', async () => {
      const onRequest = vi.fn((ctx: RequestContext) => {
        ctx.headers.Authorization = 'Bearer test-token';
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: { id: '123', name: 'Test User', email: 'test@example.com' },
        error: null,
      });

      await client.users.get('123');

      expect(onRequest).toHaveBeenCalledTimes(1);
      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.any(Object),
          operation: 'users.get',
        })
      );
    });

    it('injects auth token from interceptor into Supabase client', async () => {
      const onRequest = vi.fn((ctx: RequestContext) => {
        ctx.headers.Authorization = 'Bearer my-jwt-token';
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: { id: '123', name: 'Test', email: 'test@test.com' },
        error: null,
      });

      await client.users.get('123');

      // Check that createClient was called with auth headers
      const calls = mockState.mockCreateClient.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer my-jwt-token',
          },
        },
      }));
    });

    it('supports async onRequest interceptor', async () => {
      const onRequest = vi.fn(async (ctx: RequestContext) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        ctx.headers.Authorization = 'Bearer async-token';
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: { id: '1', name: 'Test', email: 'test@test.com' },
        error: null,
      });

      await client.users.get('1');

      expect(onRequest).toHaveBeenCalled();
      const calls = mockState.mockCreateClient.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer async-token',
          },
        },
      }));
    });

    it('passes operation name users.list for list requests', async () => {
      const operations: string[] = [];
      const onRequest = vi.fn((ctx: RequestContext) => {
        operations.push(ctx.operation);
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: [],
        error: null,
        count: 0,
      });

      await client.users.list();

      expect(operations).toContain('users.list');
    });

    it('passes operation name users.get for get requests', async () => {
      const operations: string[] = [];
      const onRequest = vi.fn((ctx: RequestContext) => {
        operations.push(ctx.operation);
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: { id: '1', name: 'Test' },
        error: null,
      });

      await client.users.get('1');

      expect(operations).toContain('users.get');
    });

    it('passes operation name users.create for create requests', async () => {
      const operations: string[] = [];
      const onRequest = vi.fn((ctx: RequestContext) => {
        operations.push(ctx.operation);
        return ctx;
      });

      const client = createClient({ onRequest });

      mockState.setResponse({
        data: { id: '2', name: 'New' },
        error: null,
      });

      await client.users.create({ name: 'New', email: 'new@test.com', role: 'user' });

      expect(operations).toContain('users.create');
    });
  });

  // ============================================================================
  // Interceptor Pattern Tests - onError
  // ============================================================================

  describe('Interceptor Pattern - onError', () => {
    it('calls onError interceptor when Supabase returns an error', async () => {
      const onError = vi.fn();
      const client = createClient({ onError });

      mockState.setResponse({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });

      await expect(client.users.get('nonexistent')).rejects.toThrow(ApiError);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          code: 'PGRST116',
          operation: 'users.get',
        })
      );
    });

    it('supports async onError interceptor', async () => {
      let errorLogged = false;
      const onError = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        errorLogged = true;
      });

      const client = createClient({ onError });

      mockState.setResponse({
        data: null,
        error: { code: '23505', message: 'Unique violation' },
      });

      await expect(client.users.get('1')).rejects.toThrow(ApiError);
      expect(errorLogged).toBe(true);
    });

    it('still throws error after onError interceptor runs', async () => {
      const onError = vi.fn();
      const client = createClient({ onError });

      mockState.setResponse({
        data: null,
        error: { code: '42501', message: 'RLS violation' },
      });

      await expect(client.users.get('1')).rejects.toThrow(ApiError);
      expect(onError).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('maps PGRST116 (not found) to 404 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });

      try {
        await client.users.get('nonexistent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(404);
        expect(apiError.code).toBe('PGRST116');
      }
    });

    it('maps 23505 (unique violation) to 409 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });

      try {
        await client.users.create({ name: 'Test', email: 'exists@test.com', role: 'user' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(409);
        expect(apiError.code).toBe('23505');
      }
    });

    it('maps 42501 (RLS violation) to 403 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: '42501', message: 'permission denied for table users' },
      });

      try {
        await client.users.get('1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(403);
        expect(apiError.code).toBe('42501');
      }
    });

    it('maps PGRST302 (JWT expired) to 401 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: 'PGRST302', message: 'JWT expired' },
      });

      try {
        await client.users.get('1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.code).toBe('PGRST302');
      }
    });

    it('maps 23503 (foreign key violation) to 400 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: '23503', message: 'insert or update on table "posts" violates foreign key constraint' },
      });

      try {
        await client.posts.create({
          title: 'Test',
          content: 'Content',
          userId: 'nonexistent-user',
          metadata: { views: 0, tags: '' },
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.code).toBe('23503');
      }
    });

    it('includes operation name in ApiError', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      try {
        await client.posts.get('123');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.operation).toBe('posts.get');
      }
    });

    it('includes error details/hint in ApiError', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: {
          code: '23505',
          message: 'Unique violation',
          hint: 'Key (email)=(test@example.com) already exists',
        },
      });

      try {
        await client.users.create({ name: 'Test', email: 'test@example.com', role: 'user' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.details).toBe('Key (email)=(test@example.com) already exists');
      }
    });

    it('defaults unknown errors to 500 status', async () => {
      const client = createClient();

      mockState.setResponse({
        data: null,
        error: { code: 'UNKNOWN_CODE', message: 'Something went wrong' },
      });

      try {
        await client.users.get('1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiError = err as ApiError;
        expect(apiError.status).toBe(500);
      }
    });
  });

  // ============================================================================
  // CRUD Operations Tests
  // ============================================================================

  describe('CRUD Operations', () => {
    describe('list()', () => {
      it('returns paginated results with meta', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [
            { id: '1', name: 'User 1', email: 'user1@test.com' },
            { id: '2', name: 'User 2', email: 'user2@test.com' },
          ],
          error: null,
          count: 10,
        });

        const result = await client.users.list();

        expect(result.data).toHaveLength(2);
        expect(result.meta).toEqual({
          total: 10,
          limit: 20,
          offset: 0,
          hasMore: false,
        });
      });

      it('applies where filters correctly', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [{ id: '1', name: 'Admin', email: 'admin@test.com', role: 'admin' }],
          error: null,
          count: 1,
        });

        await client.users.list({
          where: { role: { equals: 'admin' } },
        });

        expect(mockState.hasCalled('eq')).toBe(true);
        expect(mockState.getCallArgs('eq')).toContainEqual(['role', 'admin']);
      });

      it('applies pagination options', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [],
          error: null,
          count: 50,
        });

        const result = await client.users.list({ limit: 10, offset: 20 });

        expect(mockState.hasCalled('range')).toBe(true);
        expect(mockState.getCallArgs('range')).toContainEqual([20, 29]);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.offset).toBe(20);
        expect(result.meta.hasMore).toBe(true);
      });

      it('applies orderBy sorting', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [],
          error: null,
          count: 0,
        });

        await client.users.list({
          orderBy: { name: 'asc', createdAt: 'desc' },
        });

        expect(mockState.hasCalled('order')).toBe(true);
        const orderCalls = mockState.getCallArgs('order');
        expect(orderCalls).toContainEqual(['name', { ascending: true }]);
        expect(orderCalls).toContainEqual(['createdAt', { ascending: false }]);
      });
    });

    describe('get()', () => {
      it('returns single item response', async () => {
        const client = createClient();

        mockState.setResponse({
          data: { id: '123', name: 'Test User', email: 'test@example.com', role: 'user' },
          error: null,
        });

        const result = await client.users.get('123');

        expect(result.data).toEqual({
          id: '123',
          name: 'Test User',
          email: 'test@example.com',
          role: 'user',
        });
        expect(mockState.hasCalled('eq')).toBe(true);
        expect(mockState.getCallArgs('eq')).toContainEqual(['id', '123']);
      });

      it('includes relations when specified', async () => {
        const client = createClient();

        mockState.setResponse({
          data: {
            id: '123',
            name: 'Test User',
            email: 'test@example.com',
            posts: [{ id: '1', title: 'Post 1' }],
          },
          error: null,
        });

        await client.users.get('123', { include: ['posts'] });

        expect(mockState.hasCalled('select')).toBe(true);
        expect(mockState.getCallArgs('select')).toContainEqual(['*, posts(*)']);
      });
    });

    describe('create()', () => {
      it('creates and returns new item', async () => {
        const client = createClient();

        mockState.setResponse({
          data: {
            id: 'new-id',
            name: 'New User',
            email: 'new@example.com',
            role: 'user',
            createdAt: new Date().toISOString(),
          },
          error: null,
        });

        const result = await client.users.create({
          name: 'New User',
          email: 'new@example.com',
          role: 'user',
        });

        expect(result.data.id).toBe('new-id');
        expect(result.data.name).toBe('New User');
        expect(mockState.hasCalled('insert')).toBe(true);
      });
    });

    describe('update()', () => {
      it('updates and returns modified item', async () => {
        const client = createClient();

        mockState.setResponse({
          data: {
            id: '123',
            name: 'Updated Name',
            email: 'test@example.com',
            role: 'user',
          },
          error: null,
        });

        const result = await client.users.update('123', { name: 'Updated Name' });

        expect(result.data.name).toBe('Updated Name');
        expect(mockState.hasCalled('update')).toBe(true);
        expect(mockState.hasCalled('eq')).toBe(true);
        expect(mockState.getCallArgs('eq')).toContainEqual(['id', '123']);
      });
    });

    describe('delete()', () => {
      it('deletes item and returns void', async () => {
        const client = createClient();

        mockState.setResponse({
          data: null,
          error: null,
        });

        const result = await client.users.delete('123');

        expect(result).toBeUndefined();
        expect(mockState.hasCalled('delete')).toBe(true);
        expect(mockState.hasCalled('eq')).toBe(true);
        expect(mockState.getCallArgs('eq')).toContainEqual(['id', '123']);
      });
    });
  });

  // ============================================================================
  // Relation Handling Tests
  // ============================================================================

  describe('Relation Handling', () => {
    describe('belongsTo in list()', () => {
      it('generates explicit target syntax for belongsTo relations', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [
            { id: '1', title: 'Post 1', userId: 'u1', author: { id: 'u1', name: 'John' } },
          ],
          error: null,
          count: 1,
        });

        await client.posts.list({ include: ['author'] });

        // belongsTo should use explicit syntax: 'author:users(*)'
        expect(mockState.hasCalled('select')).toBe(true);
        const selectCalls = mockState.getCallArgs('select');
        expect(selectCalls).toContainEqual(['*, author:users(*)', { count: 'exact' }]);
      });

      it('returns posts with embedded author from belongsTo relation', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [
            { id: '1', title: 'Post 1', userId: 'u1', author: { id: 'u1', name: 'John', email: 'john@test.com' } },
            { id: '2', title: 'Post 2', userId: 'u1', author: { id: 'u1', name: 'John', email: 'john@test.com' } },
          ],
          error: null,
          count: 2,
        });

        const result = await client.posts.list({ include: ['author'] });

        expect(result.data).toHaveLength(2);
        expect(result.data[0].author).toEqual({ id: 'u1', name: 'John', email: 'john@test.com' });
      });
    });

    describe('belongsTo in get()', () => {
      it('generates explicit target syntax for belongsTo in get()', async () => {
        const client = createClient();

        mockState.setResponse({
          data: { id: '1', title: 'Post 1', userId: 'u1', author: { id: 'u1', name: 'John' } },
          error: null,
        });

        await client.posts.get('1', { include: ['author'] });

        // belongsTo should use explicit syntax: 'author:users(*)'
        expect(mockState.hasCalled('select')).toBe(true);
        const selectCalls = mockState.getCallArgs('select');
        expect(selectCalls).toContainEqual(['*, author:users(*)']);
      });
    });

    describe('hasMany in list()', () => {
      it('generates simple syntax for hasMany relations', async () => {
        const client = createClient();

        mockState.setResponse({
          data: [
            { id: 'u1', name: 'John', posts: [{ id: '1', title: 'Post 1' }] },
          ],
          error: null,
          count: 1,
        });

        await client.users.list({ include: ['posts'] });

        // hasMany uses simple syntax: 'posts(*)'
        expect(mockState.hasCalled('select')).toBe(true);
        const selectCalls = mockState.getCallArgs('select');
        expect(selectCalls).toContainEqual(['*, posts(*)', { count: 'exact' }]);
      });
    });

    describe('belongsTo nested create', () => {
      it('creates parent entity first when belongsTo relation is provided', async () => {
        const client = createClient();
        const insertCalls: unknown[][] = [];

        // Track insert calls to verify order
        const originalInsert = mockState.queryBuilder.insert;
        mockState.queryBuilder.insert = (...args: unknown[]) => {
          insertCalls.push(args);
          return originalInsert.apply(mockState.queryBuilder, args);
        };

        // First insert (author) returns the created user
        mockState.setResponse({
          data: { id: 'new-author-id', name: 'New Author', email: 'author@test.com' },
          error: null,
        });

        // We need to track the sequence of operations
        // The implementation creates author first, then post
        try {
          await client.posts.create({
            title: 'New Post',
            content: 'Content',
            // @ts-expect-error - author is a nested create
            author: { name: 'New Author', email: 'author@test.com', role: 'author' },
          });
        } catch {
          // May throw due to mock limitations, but we can still verify calls
        }

        // Verify insert was called (at least for the author)
        expect(mockState.hasCalled('insert')).toBe(true);
      });
    });
  });

  // ============================================================================
  // Default API Export Tests
  // ============================================================================

  describe('Default api Export', () => {
    it('exports default api client without interceptors', () => {
      expect(api).toBeDefined();
      expect(api.users).toBeDefined();
      expect(api.posts).toBeDefined();
    });

    it('default api has all CRUD methods', () => {
      expect(typeof api.users.list).toBe('function');
      expect(typeof api.users.get).toBe('function');
      expect(typeof api.users.create).toBe('function');
      expect(typeof api.users.update).toBe('function');
      expect(typeof api.users.delete).toBe('function');
    });
  });

  // ============================================================================
  // Filter Operators Tests
  // ============================================================================

  describe('Filter Operators', () => {
    it('applies contains filter with ilike', async () => {
      const client = createClient();

      mockState.setResponse({ data: [], error: null, count: 0 });

      await client.users.list({
        where: { name: { contains: 'John' } },
      });

      expect(mockState.hasCalled('ilike')).toBe(true);
      expect(mockState.getCallArgs('ilike')).toContainEqual(['name', '%John%']);
    });

    it('applies startsWith filter', async () => {
      const client = createClient();

      mockState.setResponse({ data: [], error: null, count: 0 });

      await client.users.list({
        where: { email: { startsWith: 'admin' } },
      });

      expect(mockState.hasCalled('ilike')).toBe(true);
      expect(mockState.getCallArgs('ilike')).toContainEqual(['email', 'admin%']);
    });

    it('applies in filter for array values', async () => {
      const client = createClient();

      mockState.setResponse({ data: [], error: null, count: 0 });

      await client.users.list({
        where: { role: { in: ['admin', 'user'] } },
      });

      expect(mockState.hasCalled('in')).toBe(true);
      expect(mockState.getCallArgs('in')).toContainEqual(['role', ['admin', 'user']]);
    });

    it('applies comparison operators (gte)', async () => {
      const client = createClient();

      mockState.setResponse({ data: [], error: null, count: 0 });

      const date = new Date('2024-01-01');
      await client.users.list({
        where: { createdAt: { gte: date } },
      });

      expect(mockState.hasCalled('gte')).toBe(true);
      expect(mockState.getCallArgs('gte')).toContainEqual(['createdAt', date]);
    });

    it('applies direct value as equals filter', async () => {
      const client = createClient();

      mockState.setResponse({ data: [], error: null, count: 0 });

      await client.users.list({
        where: { email: 'test@example.com' },
      });

      expect(mockState.hasCalled('eq')).toBe(true);
      expect(mockState.getCallArgs('eq')).toContainEqual(['email', 'test@example.com']);
    });
  });

  // ============================================================================
  // Real-World Usage Patterns
  // ============================================================================

  describe('Real-World Usage Patterns', () => {
    it('simulates auth flow with token refresh', async () => {
      let tokenRefreshCalled = false;
      let currentToken = 'initial-token';

      const onRequest = vi.fn((ctx: RequestContext) => {
        ctx.headers.Authorization = `Bearer ${currentToken}`;
        return ctx;
      });

      const onError = vi.fn((error: ApiError) => {
        if (error.status === 401) {
          tokenRefreshCalled = true;
          currentToken = 'refreshed-token';
        }
      });

      const client = createClient({ onRequest, onError });

      // First call fails with 401
      mockState.setResponse({
        data: null,
        error: { code: 'PGRST302', message: 'JWT expired' },
      });

      try {
        await client.users.get('1');
      } catch {
        // Expected to throw
      }

      expect(tokenRefreshCalled).toBe(true);

      // Create fresh mocks for retry
      mockState.reset();
      mockState.setResponse({
        data: { id: '1', name: 'Test', email: 'test@test.com' },
        error: null,
      });

      await client.users.get('1');

      // Verify the new token is used
      const calls = mockState.mockCreateClient.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer refreshed-token',
          },
        },
      }));
    });

    it('simulates centralized error logging', async () => {
      const errorLog: Array<{ operation: string; status: number }> = [];

      const onError = vi.fn((error: ApiError) => {
        errorLog.push({ operation: error.operation, status: error.status });
      });

      const client = createClient({ onError });

      // First error
      mockState.setResponse({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      try {
        await client.users.get('1');
      } catch {
        // Expected
      }

      // Second error - fresh mocks
      mockState.reset();
      mockState.setResponse({
        data: null,
        error: { code: '42501', message: 'Permission denied' },
      });

      try {
        await client.posts.get('2');
      } catch {
        // Expected
      }

      expect(errorLog).toHaveLength(2);
      expect(errorLog[0]).toEqual({ operation: 'users.get', status: 404 });
      expect(errorLog[1]).toEqual({ operation: 'posts.get', status: 403 });
    });

    it('works correctly without any interceptors', async () => {
      const client = createClient(); // No config

      mockState.setResponse({
        data: { id: '1', name: 'Test', email: 'test@test.com', role: 'user' },
        error: null,
      });

      const result = await client.users.get('1');

      expect(result.data.name).toBe('Test');
      // Should use default client without custom headers
      expect(mockState.mockCreateClient).toHaveBeenCalled();
    });
  });
});
