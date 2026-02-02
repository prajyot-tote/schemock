import { describe, it, expect } from 'vitest';
import { analyzeEndpoints } from './analyze-endpoints';
import { defineEndpoint, defineMiddleware, field } from '../schema';
import type { AnalyzedMiddleware, AnalyzedEndpoint } from './types';

describe('analyzeEndpoints middleware extraction', () => {
  // Create test middleware schemas
  const authMiddleware = defineMiddleware('auth', {
    config: {
      required: field.boolean().default(true),
    },
    handler: async ({ ctx, config, next }) => {
      return next();
    },
  });

  const rateLimitMiddleware = defineMiddleware('rate-limit', {
    config: {
      max: field.number().default(100),
      windowMs: field.number().default(60000),
    },
    handler: async ({ ctx, config, next }) => {
      return next();
    },
  });

  // Create analyzed middleware map for testing
  const middlewareMap = new Map<string, AnalyzedMiddleware>([
    ['auth', {
      name: 'auth',
      pascalName: 'Auth',
      configFields: [{ name: 'required', type: 'boolean', tsType: 'boolean', hasDefault: true, default: true, nullable: false }],
      handlerSource: '',
      order: 'normal',
    }],
    ['rate-limit', {
      name: 'rate-limit',
      pascalName: 'RateLimit',
      configFields: [
        { name: 'max', type: 'number', tsType: 'number', hasDefault: true, default: 100, nullable: false },
        { name: 'windowMs', type: 'number', tsType: 'number', hasDefault: true, default: 60000, nullable: false },
      ],
      handlerSource: '',
      order: 'normal',
    }],
  ]);

  describe('endpoint middleware extraction', () => {
    it('should extract middleware from endpoint schema', () => {
      const searchEndpoint = defineEndpoint('/api/search', {
        method: 'GET',
        params: { q: field.string() },
        response: { results: field.array(field.string()), total: field.number() },
        mockResolver: async ({ params, db }) => ({ results: [], total: 0 }),
        middleware: [authMiddleware, rateLimitMiddleware],
      });

      const analyzed = analyzeEndpoints([searchEndpoint]);
      const endpoint = analyzed[0];

      expect(endpoint.middleware).toBeDefined();
      expect(endpoint.middleware).toHaveLength(2);
      expect(endpoint.middleware![0].name).toBe('auth');
      expect(endpoint.middleware![0].pascalName).toBe('Auth');
      expect(endpoint.middleware![0].hasConfigOverrides).toBe(false);
      expect(endpoint.middleware![1].name).toBe('rate-limit');
      expect(endpoint.middleware![1].pascalName).toBe('RateLimit');
    });

    it('should extract middleware with .with() config overrides', () => {
      const searchEndpoint = defineEndpoint('/api/search', {
        method: 'GET',
        params: { q: field.string() },
        response: { results: field.array(field.string()) },
        mockResolver: async ({ params, db }) => ({ results: [] }),
        middleware: [authMiddleware, rateLimitMiddleware.with({ max: 10 })],
      });

      const analyzed = analyzeEndpoints([searchEndpoint]);
      const endpoint = analyzed[0];

      expect(endpoint.middleware).toBeDefined();
      expect(endpoint.middleware).toHaveLength(2);

      // First middleware: direct reference
      expect(endpoint.middleware![0].hasConfigOverrides).toBe(false);

      // Second middleware: configured with .with()
      expect(endpoint.middleware![1].name).toBe('rate-limit');
      expect(endpoint.middleware![1].hasConfigOverrides).toBe(true);
      expect(endpoint.middleware![1].configOverrides).toEqual({ max: 10 });
    });

    it('should return undefined middleware for endpoints without middleware config', () => {
      const searchEndpoint = defineEndpoint('/api/search', {
        method: 'GET',
        params: { q: field.string() },
        response: { results: field.array(field.string()) },
        mockResolver: async ({ params, db }) => ({ results: [] }),
      });

      const analyzed = analyzeEndpoints([searchEndpoint]);
      const endpoint = analyzed[0];

      expect(endpoint.middleware).toBeUndefined();
    });

    it('should link middleware references to analyzed middleware when map is provided', () => {
      const searchEndpoint = defineEndpoint('/api/search', {
        method: 'GET',
        params: { q: field.string() },
        response: { results: field.array(field.string()) },
        mockResolver: async ({ params, db }) => ({ results: [] }),
        middleware: [authMiddleware],
      });

      const analyzed = analyzeEndpoints([searchEndpoint], undefined, middlewareMap);
      const endpoint = analyzed[0];

      expect(endpoint.middleware![0].middleware).toBeDefined();
      expect(endpoint.middleware![0].middleware?.name).toBe('auth');
      expect(endpoint.middleware![0].middleware?.configFields).toHaveLength(1);
    });

    it('should handle multiple endpoints with different middleware configurations', () => {
      const publicEndpoint = defineEndpoint('/api/public', {
        method: 'GET',
        params: {},
        response: { message: field.string() },
        mockResolver: async () => ({ message: 'Hello' }),
        // No middleware - public
      });

      const protectedEndpoint = defineEndpoint('/api/protected', {
        method: 'GET',
        params: {},
        response: { data: field.string() },
        mockResolver: async () => ({ data: 'Secret' }),
        middleware: [authMiddleware],
      });

      const rateLimitedEndpoint = defineEndpoint('/api/rate-limited', {
        method: 'POST',
        params: {},
        body: { data: field.string() },
        response: { success: field.boolean() },
        mockResolver: async () => ({ success: true }),
        middleware: [authMiddleware, rateLimitMiddleware.with({ max: 5 })],
      });

      const analyzed = analyzeEndpoints([publicEndpoint, protectedEndpoint, rateLimitedEndpoint]);

      expect(analyzed[0].middleware).toBeUndefined();
      expect(analyzed[1].middleware).toHaveLength(1);
      expect(analyzed[2].middleware).toHaveLength(2);
      expect(analyzed[2].middleware![1].configOverrides).toEqual({ max: 5 });
    });
  });
});
