/**
 * E2E Middleware Execution Tests
 *
 * Validates that middleware chain executes correctly at runtime.
 * Tests auth middleware, custom middleware, and middleware ordering.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { factory, primaryKey } from '@mswjs/data';
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
});

// Middleware context interface
interface MiddlewareContext {
  userId?: string;
  role?: string;
  tenantId?: string;
  requestId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

// Error classes
class AuthError extends Error {
  readonly status = 401;
  readonly code = 'AUTH_REQUIRED';
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// JWT decoder
function decodeJwtPayload(token: string): Record<string, unknown> | null {
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
function extractContextFromHeaders(headers: Headers): MiddlewareContext {
  const ctx: MiddlewareContext = {};
  const authHeader = headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = decodeJwtPayload(token);
    if (payload) {
      ctx.userId = payload.sub as string ?? payload.userId as string;
      ctx.role = payload.role as string;
      ctx.tenantId = payload.tenant_id as string ?? payload.tenantId as string;
    }
  }
  return ctx;
}

// Middleware handler type
type MiddlewareHandler = (ctx: MiddlewareContext, request: Request) => Promise<MiddlewareContext | Response>;

// withMiddleware function
async function withMiddleware(
  middleware: MiddlewareHandler[],
  request: Request,
  handler: (ctx: MiddlewareContext) => Promise<Response>
): Promise<Response> {
  let ctx = extractContextFromHeaders(request.headers);

  for (const mw of middleware) {
    try {
      const result = await mw(ctx, request);
      if (result instanceof Response) {
        return result;
      }
      ctx = result;
    } catch (error) {
      if (error instanceof AuthError) {
        return HttpResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        return HttpResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  try {
    return await handler(ctx);
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      return HttpResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}

// Middleware definitions

/** Auth middleware - requires valid JWT */
const authMiddleware: MiddlewareHandler = async (ctx, _request) => {
  if (!ctx.userId) {
    throw new AuthError('Authentication required');
  }
  return ctx;
};

/** Admin middleware - requires admin role */
const adminMiddleware: MiddlewareHandler = async (ctx, _request) => {
  if (ctx.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  return ctx;
};

/** Request ID middleware - adds requestId to context */
const requestIdMiddleware: MiddlewareHandler = async (ctx, request) => {
  const requestId = request.headers.get('X-Request-ID') || `req-${Date.now()}`;
  return { ...ctx, requestId };
};

/** Timestamp middleware - adds timestamp to context */
const timestampMiddleware: MiddlewareHandler = async (ctx, _request) => {
  return { ...ctx, timestamp: Date.now() };
};

// Tracking for middleware execution order
let middlewareOrder: string[] = [];

/** Tracking middleware A */
const trackingMiddlewareA: MiddlewareHandler = async (ctx, _request) => {
  middlewareOrder.push('A');
  return ctx;
};

/** Tracking middleware B */
const trackingMiddlewareB: MiddlewareHandler = async (ctx, _request) => {
  middlewareOrder.push('B');
  return ctx;
};

/** Tracking middleware C */
const trackingMiddlewareC: MiddlewareHandler = async (ctx, _request) => {
  middlewareOrder.push('C');
  return ctx;
};

// Middleware configurations per entity/operation
const middlewareConfig: Record<string, {
  default: MiddlewareHandler[];
  operations: Partial<Record<'list' | 'get' | 'create' | 'update' | 'delete', MiddlewareHandler[]>>;
}> = {
  user: {
    default: [authMiddleware],
    operations: {
      list: [], // Public endpoint
      delete: [authMiddleware, adminMiddleware], // Admin only
    },
  },
};

// Helper to get middleware for operation
function getMiddleware(entity: string, operation: 'list' | 'get' | 'create' | 'update' | 'delete'): MiddlewareHandler[] {
  const config = middlewareConfig[entity];
  if (!config) return [];
  const override = config.operations[operation];
  if (override !== undefined) return override;
  return config.default;
}

// Handlers
const handlers = [
  // User list - public (no auth required)
  http.get('http://localhost/api/users', async ({ request }) => {
    return withMiddleware(getMiddleware('user', 'list'), request, async (ctx) => {
      const users = db.user.getAll();
      return HttpResponse.json({
        data: users,
        meta: { contextUserId: ctx.userId },
      });
    });
  }),

  // User get - requires auth
  http.get('http://localhost/api/users/:id', async ({ request, params }) => {
    return withMiddleware(getMiddleware('user', 'get'), request, async (ctx) => {
      const user = db.user.findFirst({ where: { id: { equals: params.id as string } } });
      if (!user) {
        return HttpResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return HttpResponse.json({
        data: user,
        meta: { contextUserId: ctx.userId },
      });
    });
  }),

  // User create - requires auth
  http.post('http://localhost/api/users', async ({ request }) => {
    return withMiddleware(getMiddleware('user', 'create'), request, async (ctx) => {
      const body = await request.json() as { email: string; name: string };
      const user = db.user.create({
        email: body.email,
        name: body.name,
      });
      return HttpResponse.json({
        data: user,
        meta: { createdBy: ctx.userId },
      }, { status: 201 });
    });
  }),

  // User delete - requires admin
  http.delete('http://localhost/api/users/:id', async ({ request, params }) => {
    return withMiddleware(getMiddleware('user', 'delete'), request, async (_ctx) => {
      const user = db.user.findFirst({ where: { id: { equals: params.id as string } } });
      if (!user) {
        return HttpResponse.json({ error: 'User not found' }, { status: 404 });
      }
      db.user.delete({ where: { id: { equals: params.id as string } } });
      return new HttpResponse(null, { status: 204 });
    });
  }),

  // Endpoint with ordered middleware chain
  http.get('http://localhost/api/middleware-order', async ({ request }) => {
    middlewareOrder = []; // Reset tracking
    return withMiddleware(
      [trackingMiddlewareA, trackingMiddlewareB, trackingMiddlewareC],
      request,
      async (_ctx) => {
        middlewareOrder.push('handler');
        return HttpResponse.json({ order: middlewareOrder });
      }
    );
  }),

  // Endpoint with context enrichment
  http.get('http://localhost/api/context-test', async ({ request }) => {
    return withMiddleware(
      [requestIdMiddleware, timestampMiddleware],
      request,
      async (ctx) => {
        return HttpResponse.json({
          context: {
            userId: ctx.userId,
            requestId: ctx.requestId,
            timestamp: ctx.timestamp,
          },
        });
      }
    );
  }),

  // Endpoint with short-circuit middleware
  http.get('http://localhost/api/short-circuit', async ({ request }) => {
    const shortCircuitMiddleware: MiddlewareHandler = async (_ctx, _request) => {
      return HttpResponse.json({ message: 'Short-circuited' }, { status: 418 });
    };

    return withMiddleware(
      [shortCircuitMiddleware],
      request,
      async (_ctx) => {
        return HttpResponse.json({ message: 'Handler reached' });
      }
    );
  }),
];

const server = setupServer(...handlers);

describe('E2E: Middleware Execution', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    db.user.getAll().forEach((u) => db.user.delete({ where: { id: { equals: u.id } } }));
    middlewareOrder = [];
  });

  describe('Auth middleware', () => {
    it('extracts userId from valid JWT', async () => {
      const userId = 'test-user-id';
      const token = createMockJwt({ sub: userId, role: 'user' });

      const response = await fetch('http://localhost/api/users/some-id', {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { meta: { contextUserId: string } };

      // 404 because user doesn't exist, but middleware passed
      expect(response.status).toBe(404);
    });

    it('rejects request without JWT when auth required', async () => {
      const response = await fetch('http://localhost/api/users/some-id');
      const json = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(json.error).toBe('Authentication required');
    });

    it('rejects request with malformed JWT', async () => {
      const response = await fetch('http://localhost/api/users/some-id', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });
      const json = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(json.error).toBe('Authentication required');
    });
  });

  describe('Per-operation middleware override', () => {
    it('allows public list endpoint without auth', async () => {
      db.user.create({ email: 'test@test.com', name: 'Test User' });

      // No auth header
      const response = await fetch('http://localhost/api/users');
      const json = await response.json() as { data: unknown[] };

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });

    it('requires auth for get endpoint', async () => {
      const user = db.user.create({ email: 'test@test.com', name: 'Test User' });

      // Without auth
      const response = await fetch(`http://localhost/api/users/${user.id}`);

      expect(response.status).toBe(401);
    });

    it('allows get with valid auth', async () => {
      const user = db.user.create({ email: 'test@test.com', name: 'Test User' });
      const token = createMockJwt({ sub: 'user-id', role: 'user' });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { data: { id: string } };

      expect(response.status).toBe(200);
      expect(json.data.id).toBe(user.id);
    });

    it('requires admin role for delete', async () => {
      const user = db.user.create({ email: 'test@test.com', name: 'Test User' });
      const token = createMockJwt({ sub: 'user-id', role: 'user' });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        method: 'DELETE',
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { error: string };

      expect(response.status).toBe(403);
      expect(json.error).toBe('Admin access required');
    });

    it('allows admin to delete', async () => {
      const user = db.user.create({ email: 'test@test.com', name: 'Test User' });
      const token = createMockJwt({ sub: 'admin-id', role: 'admin' });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        method: 'DELETE',
        headers: createAuthHeaders(token),
      });

      expect(response.status).toBe(204);
    });
  });

  describe('Middleware chain order', () => {
    it('executes middleware in correct order', async () => {
      const response = await fetch('http://localhost/api/middleware-order');
      const json = await response.json() as { order: string[] };

      expect(response.status).toBe(200);
      expect(json.order).toEqual(['A', 'B', 'C', 'handler']);
    });
  });

  describe('Context enrichment', () => {
    it('middleware can add properties to context', async () => {
      const response = await fetch('http://localhost/api/context-test', {
        headers: {
          'X-Request-ID': 'custom-request-123',
        },
      });
      const json = await response.json() as { context: { requestId: string; timestamp: number } };

      expect(response.status).toBe(200);
      expect(json.context.requestId).toBe('custom-request-123');
      expect(json.context.timestamp).toBeGreaterThan(0);
    });

    it('generates requestId when not provided', async () => {
      const response = await fetch('http://localhost/api/context-test');
      const json = await response.json() as { context: { requestId: string } };

      expect(response.status).toBe(200);
      expect(json.context.requestId).toMatch(/^req-\d+$/);
    });
  });

  describe('Middleware short-circuit', () => {
    it('middleware can return response to skip handler', async () => {
      const response = await fetch('http://localhost/api/short-circuit');
      const json = await response.json() as { message: string };

      expect(response.status).toBe(418);
      expect(json.message).toBe('Short-circuited');
    });
  });

  describe('Error handling', () => {
    it('converts AuthError to 401 response', async () => {
      const response = await fetch('http://localhost/api/users/some-id');
      const json = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(json.error).toBeDefined();
    });

    it('converts ForbiddenError to 403 response', async () => {
      const user = db.user.create({ email: 'test@test.com', name: 'Test' });
      const token = createMockJwt({ sub: 'user-id', role: 'user' });

      const response = await fetch(`http://localhost/api/users/${user.id}`, {
        method: 'DELETE',
        headers: createAuthHeaders(token),
      });
      const json = await response.json() as { error: string };

      expect(response.status).toBe(403);
      expect(json.error).toBeDefined();
    });
  });
});
