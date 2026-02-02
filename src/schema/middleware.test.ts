/**
 * Unit tests for middleware definition APIs:
 * - defineClientMiddleware (browser-side interceptors)
 * - defineServerMiddleware (server-side handlers)
 * - defineMiddleware (backwards-compatible alias)
 */
import { describe, it, expect } from 'vitest';
import { defineClientMiddleware } from './define-client-middleware';
import { defineServerMiddleware } from './define-server-middleware';
import { defineMiddleware } from './define-middleware';
import { field } from './field';
import {
  isMiddlewareSchema,
  isClientMiddlewareSchema,
  isMiddlewareWithConfig,
  type ClientMiddlewareSchema,
  type MiddlewareSchema,
  type MiddlewareWithConfig,
  type MiddlewareReference,
} from './types';
import { defineData } from './define-data';
import { defineEndpoint } from './define-endpoint';

describe('defineClientMiddleware', () => {
  describe('basic functionality', () => {
    it('creates a client middleware schema with before hook', () => {
      const middleware = defineClientMiddleware('analytics', {
        before: async ({ request, operation }) => {
          return { metadata: { startTime: Date.now() } };
        },
      });

      expect(middleware.name).toBe('analytics');
      expect(middleware.before).toBeDefined();
      expect(typeof middleware.before).toBe('function');
      expect(middleware.order).toBe('normal');
      expect(middleware._clientMiddleware).toBe(true);
    });

    it('creates a client middleware schema with after hook', () => {
      const middleware = defineClientMiddleware('transform', {
        after: async ({ response }) => {
          return { ...response, data: { transformed: true } };
        },
      });

      expect(middleware.name).toBe('transform');
      expect(middleware.after).toBeDefined();
      expect(typeof middleware.after).toBe('function');
    });

    it('creates a client middleware schema with onError hook', () => {
      const middleware = defineClientMiddleware('error-handler', {
        onError: async ({ error }) => {
          console.error(error.message);
        },
      });

      expect(middleware.name).toBe('error-handler');
      expect(middleware.onError).toBeDefined();
      expect(typeof middleware.onError).toBe('function');
    });

    it('creates a client middleware schema with all hooks', () => {
      const middleware = defineClientMiddleware('full', {
        before: async () => ({ metadata: { test: true } }),
        after: async ({ response }) => response,
        onError: async () => {},
        description: 'Full middleware with all hooks',
        order: 'early',
      });

      expect(middleware.name).toBe('full');
      expect(middleware.before).toBeDefined();
      expect(middleware.after).toBeDefined();
      expect(middleware.onError).toBeDefined();
      expect(middleware.description).toBe('Full middleware with all hooks');
      expect(middleware.order).toBe('early');
    });
  });

  describe('order options', () => {
    it('defaults to normal order', () => {
      const middleware = defineClientMiddleware('test', {
        before: async () => {},
      });
      expect(middleware.order).toBe('normal');
    });

    it('accepts early order', () => {
      const middleware = defineClientMiddleware('auth', {
        before: async () => {},
        order: 'early',
      });
      expect(middleware.order).toBe('early');
    });

    it('accepts late order', () => {
      const middleware = defineClientMiddleware('logging', {
        after: async () => {},
        order: 'late',
      });
      expect(middleware.order).toBe('late');
    });
  });

  describe('validation', () => {
    it('throws error for empty name', () => {
      expect(() => {
        defineClientMiddleware('', { before: async () => {} });
      }).toThrow('Client middleware name must be a non-empty string');
    });

    it('throws error for invalid name format (uppercase)', () => {
      expect(() => {
        defineClientMiddleware('MyMiddleware', { before: async () => {} });
      }).toThrow(/must start with a lowercase letter/);
    });

    it('throws error for invalid name format (starts with number)', () => {
      expect(() => {
        defineClientMiddleware('123middleware', { before: async () => {} });
      }).toThrow(/must start with a lowercase letter/);
    });

    it('throws error when no hooks provided', () => {
      expect(() => {
        defineClientMiddleware('empty', {});
      }).toThrow('must have at least one hook');
    });

    it('throws error for non-function before hook', () => {
      expect(() => {
        defineClientMiddleware('bad', { before: 'not a function' as any });
      }).toThrow("'before' hook must be a function");
    });

    it('throws error for non-function after hook', () => {
      expect(() => {
        defineClientMiddleware('bad', { after: 123 as any });
      }).toThrow("'after' hook must be a function");
    });

    it('throws error for non-function onError hook', () => {
      expect(() => {
        defineClientMiddleware('bad', { onError: {} as any });
      }).toThrow("'onError' hook must be a function");
    });

    it('accepts valid name with hyphens', () => {
      const middleware = defineClientMiddleware('my-cool-middleware', {
        before: async () => {},
      });
      expect(middleware.name).toBe('my-cool-middleware');
    });

    it('accepts valid name with numbers', () => {
      const middleware = defineClientMiddleware('auth2', {
        before: async () => {},
      });
      expect(middleware.name).toBe('auth2');
    });
  });

  describe('type guard', () => {
    it('isClientMiddlewareSchema returns true for client middleware', () => {
      const middleware = defineClientMiddleware('test', {
        before: async () => {},
      });
      expect(isClientMiddlewareSchema(middleware)).toBe(true);
    });

    it('isClientMiddlewareSchema returns false for server middleware', () => {
      const middleware = defineServerMiddleware('test', {
        handler: async ({ next }) => next(),
      });
      expect(isClientMiddlewareSchema(middleware)).toBe(false);
    });

    it('isClientMiddlewareSchema returns false for non-middleware objects', () => {
      expect(isClientMiddlewareSchema({})).toBe(false);
      expect(isClientMiddlewareSchema(null)).toBe(false);
      expect(isClientMiddlewareSchema('string')).toBe(false);
    });
  });
});

describe('defineServerMiddleware', () => {
  describe('basic functionality', () => {
    it('creates a server middleware schema with handler', () => {
      const middleware = defineServerMiddleware('logger', {
        handler: async ({ ctx, next }) => {
          console.log(`${ctx.method} ${ctx.path}`);
          return next();
        },
      });

      expect(middleware.name).toBe('logger');
      expect(middleware.handler).toBeDefined();
      expect(typeof middleware.handler).toBe('function');
      expect(middleware.order).toBe('normal');
      expect(middleware._middleware).toBe(true);
    });

    it('creates a server middleware with config schema', () => {
      const middleware = defineServerMiddleware('tenant', {
        config: {
          headerName: field.string().default('X-Tenant-ID'),
          required: field.boolean().default(true),
        },
        handler: async ({ ctx, config, next }) => {
          return next();
        },
      });

      expect(middleware.name).toBe('tenant');
      expect(middleware.config).toBeDefined();
      expect(middleware.config.headerName).toBeDefined();
      expect(middleware.config.headerName.type).toBe('string');
      expect(middleware.config.headerName.default).toBe('X-Tenant-ID');
      expect(middleware.config.required).toBeDefined();
      expect(middleware.config.required.type).toBe('boolean');
    });

    it('creates a server middleware with description and order', () => {
      const middleware = defineServerMiddleware('cors', {
        handler: async ({ next }) => next(),
        description: 'Handles CORS headers',
        order: 'early',
      });

      expect(middleware.description).toBe('Handles CORS headers');
      expect(middleware.order).toBe('early');
    });
  });

  describe('config normalization', () => {
    it('normalizes FieldBuilder to FieldDefinition', () => {
      const middleware = defineServerMiddleware('test', {
        config: {
          apiKey: field.string().min(10),
          maxRetries: field.number().default(3),
          enabled: field.boolean(),
        },
        handler: async ({ next }) => next(),
      });

      // Config should be normalized FieldDefinitions
      expect(middleware.config.apiKey.type).toBe('string');
      expect(middleware.config.apiKey.constraints?.min).toBe(10);
      expect(middleware.config.maxRetries.type).toBe('number');
      expect(middleware.config.maxRetries.default).toBe(3);
      expect(middleware.config.enabled.type).toBe('boolean');
    });

    it('handles empty config', () => {
      const middleware = defineServerMiddleware('simple', {
        handler: async ({ next }) => next(),
      });

      expect(middleware.config).toEqual({});
    });
  });

  describe('order options', () => {
    it('defaults to normal order', () => {
      const middleware = defineServerMiddleware('test', {
        handler: async ({ next }) => next(),
      });
      expect(middleware.order).toBe('normal');
    });

    it('accepts early order', () => {
      const middleware = defineServerMiddleware('auth', {
        handler: async ({ next }) => next(),
        order: 'early',
      });
      expect(middleware.order).toBe('early');
    });

    it('accepts late order', () => {
      const middleware = defineServerMiddleware('cleanup', {
        handler: async ({ next }) => next(),
        order: 'late',
      });
      expect(middleware.order).toBe('late');
    });
  });

  describe('validation', () => {
    it('throws error for empty name', () => {
      expect(() => {
        defineServerMiddleware('', { handler: async ({ next }) => next() });
      }).toThrow('Server middleware name must be a non-empty string');
    });

    it('throws error for invalid name format', () => {
      expect(() => {
        defineServerMiddleware('MyMiddleware', { handler: async ({ next }) => next() });
      }).toThrow(/must start with a lowercase letter/);
    });

    it('throws error for missing handler', () => {
      expect(() => {
        defineServerMiddleware('broken', {} as any);
      }).toThrow('handler must be a function');
    });

    it('throws error for non-function handler', () => {
      expect(() => {
        defineServerMiddleware('broken', { handler: 'not a function' as any });
      }).toThrow('handler must be a function');
    });
  });

  describe('type guard', () => {
    it('isMiddlewareSchema returns true for server middleware', () => {
      const middleware = defineServerMiddleware('test', {
        handler: async ({ next }) => next(),
      });
      expect(isMiddlewareSchema(middleware)).toBe(true);
    });

    it('isMiddlewareSchema returns false for client middleware', () => {
      const middleware = defineClientMiddleware('test', {
        before: async () => {},
      });
      expect(isMiddlewareSchema(middleware)).toBe(false);
    });

    it('isMiddlewareSchema returns false for non-middleware objects', () => {
      expect(isMiddlewareSchema({})).toBe(false);
      expect(isMiddlewareSchema(null)).toBe(false);
      expect(isMiddlewareSchema(undefined)).toBe(false);
    });
  });
});

describe('defineMiddleware (backwards compatibility)', () => {
  it('is an alias for defineServerMiddleware', () => {
    const serverMiddleware = defineServerMiddleware('test', {
      handler: async ({ next }) => next(),
    });

    const aliasMiddleware = defineMiddleware('test2', {
      handler: async ({ next }) => next(),
    });

    // Should have same structure
    expect(aliasMiddleware._middleware).toBe(true);
    expect(typeof aliasMiddleware.handler).toBe('function');
    expect(aliasMiddleware.order).toBe('normal');
  });

  it('accepts same options as defineServerMiddleware', () => {
    const middleware = defineMiddleware('tenant', {
      config: {
        headerName: field.string().default('X-Tenant-ID'),
      },
      handler: async ({ ctx, config, next }) => {
        ctx.context.tenantId = ctx.headers[config.headerName];
        return next();
      },
      description: 'Tenant middleware',
      order: 'early',
    });

    expect(middleware.name).toBe('tenant');
    expect(middleware.config.headerName.default).toBe('X-Tenant-ID');
    expect(middleware.description).toBe('Tenant middleware');
    expect(middleware.order).toBe('early');
  });

  it('isMiddlewareSchema works with defineMiddleware output', () => {
    const middleware = defineMiddleware('test', {
      handler: async ({ next }) => next(),
    });
    expect(isMiddlewareSchema(middleware)).toBe(true);
  });
});

describe('middleware differentiation', () => {
  it('client and server middleware have different markers', () => {
    const clientMiddleware = defineClientMiddleware('client', {
      before: async () => {},
    });

    const serverMiddleware = defineServerMiddleware('server', {
      handler: async ({ next }) => next(),
    });

    // Different type markers
    expect((clientMiddleware as any)._clientMiddleware).toBe(true);
    expect((clientMiddleware as any)._middleware).toBeUndefined();

    expect((serverMiddleware as any)._middleware).toBe(true);
    expect((serverMiddleware as any)._clientMiddleware).toBeUndefined();
  });

  it('type guards correctly differentiate', () => {
    const client = defineClientMiddleware('c', { before: async () => {} });
    const server = defineServerMiddleware('s', { handler: async ({ next }) => next() });

    expect(isClientMiddlewareSchema(client)).toBe(true);
    expect(isClientMiddlewareSchema(server)).toBe(false);

    expect(isMiddlewareSchema(server)).toBe(true);
    expect(isMiddlewareSchema(client)).toBe(false);
  });
});

// ============================================================================
// Phase 1 Schema API Updates - New Features
// ============================================================================

describe('defineServerMiddleware - requiredHeaders', () => {
  it('accepts requiredHeaders option', () => {
    const middleware = defineServerMiddleware('auth', {
      requiredHeaders: ['Authorization'],
      handler: async ({ ctx, next }) => {
        const token = ctx.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return { response: { status: 401, body: { error: 'Unauthorized' } } };
        }
        return next();
      },
    });

    expect(middleware.requiredHeaders).toEqual(['Authorization']);
  });

  it('allows multiple required headers', () => {
    const middleware = defineServerMiddleware('tenant-auth', {
      requiredHeaders: ['Authorization', 'X-Tenant-ID', 'X-Request-ID'],
      handler: async ({ next }) => next(),
    });

    expect(middleware.requiredHeaders).toHaveLength(3);
    expect(middleware.requiredHeaders).toContain('Authorization');
    expect(middleware.requiredHeaders).toContain('X-Tenant-ID');
    expect(middleware.requiredHeaders).toContain('X-Request-ID');
  });

  it('requiredHeaders is undefined when not specified', () => {
    const middleware = defineServerMiddleware('simple', {
      handler: async ({ next }) => next(),
    });

    expect(middleware.requiredHeaders).toBeUndefined();
  });
});

describe('defineServerMiddleware - with() method', () => {
  it('creates a MiddlewareWithConfig with overrides', () => {
    const rateLimitMiddleware = defineServerMiddleware<{ max: number }>('rate-limit', {
      config: {
        max: field.number().default(100),
      },
      handler: async ({ next }) => next(),
    });

    const configured = rateLimitMiddleware.with({ max: 10 });

    expect(configured._middlewareRef).toBe(true);
    expect(configured.middleware).toBe(rateLimitMiddleware);
    expect(configured.configOverrides).toEqual({ max: 10 });
  });

  it('with() can be called multiple times with different overrides', () => {
    const middleware = defineServerMiddleware<{ timeout: number; retries: number }>('http', {
      config: {
        timeout: field.number().default(5000),
        retries: field.number().default(3),
      },
      handler: async ({ next }) => next(),
    });

    const fast = middleware.with({ timeout: 1000 });
    const reliable = middleware.with({ retries: 5 });

    expect(fast.configOverrides).toEqual({ timeout: 1000 });
    expect(reliable.configOverrides).toEqual({ retries: 5 });
    // Both should reference the same middleware
    expect(fast.middleware).toBe(middleware);
    expect(reliable.middleware).toBe(middleware);
  });

  it('with() preserves partial overrides', () => {
    const middleware = defineServerMiddleware<{ a: string; b: number; c: boolean }>('multi', {
      config: {
        a: field.string().default('default'),
        b: field.number().default(0),
        c: field.boolean().default(false),
      },
      handler: async ({ next }) => next(),
    });

    // Only override some values
    const partial = middleware.with({ b: 42 });

    expect(partial.configOverrides).toEqual({ b: 42 });
    // a and c should not be in overrides
    expect(partial.configOverrides).not.toHaveProperty('a');
    expect(partial.configOverrides).not.toHaveProperty('c');
  });
});

describe('isMiddlewareWithConfig type guard', () => {
  it('returns true for MiddlewareWithConfig', () => {
    const middleware = defineServerMiddleware<{ max: number }>('rate-limit', {
      config: { max: field.number().default(100) },
      handler: async ({ next }) => next(),
    });

    const configured = middleware.with({ max: 10 });
    expect(isMiddlewareWithConfig(configured)).toBe(true);
  });

  it('returns false for direct middleware schema', () => {
    const middleware = defineServerMiddleware('simple', {
      handler: async ({ next }) => next(),
    });

    expect(isMiddlewareWithConfig(middleware)).toBe(false);
  });

  it('returns false for non-middleware objects', () => {
    expect(isMiddlewareWithConfig({})).toBe(false);
    expect(isMiddlewareWithConfig(null)).toBe(false);
    expect(isMiddlewareWithConfig(undefined)).toBe(false);
    expect(isMiddlewareWithConfig('string')).toBe(false);
    expect(isMiddlewareWithConfig(123)).toBe(false);
  });

  it('returns false for objects with similar but not exact shape', () => {
    expect(isMiddlewareWithConfig({ _middlewareRef: false })).toBe(false);
    expect(isMiddlewareWithConfig({ middleware: {}, configOverrides: {} })).toBe(false);
  });
});

describe('defineData - middleware and endpoints options', () => {
  const authMiddleware = defineServerMiddleware('auth', {
    handler: async ({ next }) => next(),
  });

  const adminMiddleware = defineServerMiddleware('admin', {
    handler: async ({ next }) => next(),
  });

  const rateLimitMiddleware = defineServerMiddleware<{ max: number }>('rate-limit', {
    config: { max: field.number().default(100) },
    handler: async ({ next }) => next(),
  });

  it('accepts middleware array in options', () => {
    const schema = defineData('user', {
      id: field.uuid(),
      name: field.string(),
    }, {
      middleware: [authMiddleware],
    });

    expect(schema.middleware).toBeDefined();
    expect(schema.middleware).toHaveLength(1);
    expect(schema.middleware![0]).toBe(authMiddleware);
  });

  it('accepts multiple middleware in array', () => {
    const schema = defineData('user', {
      id: field.uuid(),
      name: field.string(),
    }, {
      middleware: [authMiddleware, adminMiddleware],
    });

    expect(schema.middleware).toHaveLength(2);
    expect(schema.middleware![0]).toBe(authMiddleware);
    expect(schema.middleware![1]).toBe(adminMiddleware);
  });

  it('accepts configured middleware via .with()', () => {
    const schema = defineData('user', {
      id: field.uuid(),
      name: field.string(),
    }, {
      middleware: [authMiddleware, rateLimitMiddleware.with({ max: 50 })],
    });

    expect(schema.middleware).toHaveLength(2);
    expect(schema.middleware![0]).toBe(authMiddleware);
    expect(isMiddlewareWithConfig(schema.middleware![1])).toBe(true);
    expect((schema.middleware![1] as MiddlewareWithConfig).configOverrides).toEqual({ max: 50 });
  });

  it('accepts endpoints configuration with per-operation middleware', () => {
    const schema = defineData('user', {
      id: field.uuid(),
      name: field.string(),
    }, {
      middleware: [authMiddleware],
      endpoints: {
        list: { middleware: [] }, // Public
        delete: { middleware: [authMiddleware, adminMiddleware] }, // Admin only
      },
    });

    expect(schema.endpoints).toBeDefined();
    expect(schema.endpoints!.list).toBeDefined();
    expect(schema.endpoints!.list!.middleware).toEqual([]);
    expect(schema.endpoints!.delete).toBeDefined();
    expect(schema.endpoints!.delete!.middleware).toHaveLength(2);
  });

  it('accepts all CRUD operation overrides', () => {
    const schema = defineData('user', {
      id: field.uuid(),
    }, {
      endpoints: {
        list: { middleware: [] },
        get: { middleware: [authMiddleware] },
        create: { middleware: [authMiddleware, adminMiddleware] },
        update: { middleware: [authMiddleware] },
        delete: { middleware: [authMiddleware, adminMiddleware] },
      },
    });

    expect(schema.endpoints!.list!.middleware).toEqual([]);
    expect(schema.endpoints!.get!.middleware).toHaveLength(1);
    expect(schema.endpoints!.create!.middleware).toHaveLength(2);
    expect(schema.endpoints!.update!.middleware).toHaveLength(1);
    expect(schema.endpoints!.delete!.middleware).toHaveLength(2);
  });

  it('middleware and endpoints are undefined when not specified', () => {
    const schema = defineData('user', {
      id: field.uuid(),
      name: field.string(),
    });

    expect(schema.middleware).toBeUndefined();
    expect(schema.endpoints).toBeUndefined();
  });
});

describe('defineEndpoint - middleware option', () => {
  const authMiddleware = defineServerMiddleware('auth', {
    handler: async ({ next }) => next(),
  });

  const rateLimitMiddleware = defineServerMiddleware<{ max: number }>('rate-limit', {
    config: { max: field.number().default(100) },
    handler: async ({ next }) => next(),
  });

  it('accepts middleware array in config', () => {
    const endpoint = defineEndpoint('/api/search', {
      method: 'GET',
      params: { q: field.string() },
      response: { results: field.array(field.string()) },
      middleware: [authMiddleware],
      mockResolver: () => ({ results: [] }),
    });

    expect(endpoint.middleware).toBeDefined();
    expect(endpoint.middleware).toHaveLength(1);
    expect(endpoint.middleware![0]).toBe(authMiddleware);
  });

  it('accepts configured middleware via .with()', () => {
    const endpoint = defineEndpoint('/api/search', {
      method: 'GET',
      params: { q: field.string() },
      response: { results: field.array(field.string()) },
      middleware: [authMiddleware, rateLimitMiddleware.with({ max: 10 })],
      mockResolver: () => ({ results: [] }),
    });

    expect(endpoint.middleware).toHaveLength(2);
    expect(isMiddlewareWithConfig(endpoint.middleware![1])).toBe(true);
  });

  it('middleware is undefined when not specified', () => {
    const endpoint = defineEndpoint('/api/health', {
      method: 'GET',
      response: { status: field.string() },
      mockResolver: () => ({ status: 'ok' }),
    });

    expect(endpoint.middleware).toBeUndefined();
  });
});

describe('MiddlewareReference type compatibility', () => {
  it('both direct middleware and .with() can be used in arrays', () => {
    const auth = defineServerMiddleware('auth', {
      handler: async ({ next }) => next(),
    });

    const rateLimit = defineServerMiddleware<{ max: number }>('rate-limit', {
      config: { max: field.number().default(100) },
      handler: async ({ next }) => next(),
    });

    // TypeScript should allow this
    const middleware: MiddlewareReference<any>[] = [
      auth,                        // Direct reference
      rateLimit.with({ max: 10 }), // Configured reference
    ];

    expect(middleware).toHaveLength(2);
    expect(isMiddlewareSchema(middleware[0])).toBe(true);
    expect(isMiddlewareWithConfig(middleware[1])).toBe(true);
  });
});
