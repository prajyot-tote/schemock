import { describe, it, expect } from 'vitest';
import { resolveMiddlewareRef, resolveMiddlewareRefs } from './analyze-utils';
import { defineMiddleware } from '../schema/define-middleware';
import { field } from '../schema';
import type { AnalyzedMiddleware } from './types';

describe('analyze-utils', () => {
  // Create test middleware schemas
  const authMiddleware = defineMiddleware('auth', {
    config: {
      required: field.boolean().default(true),
    },
    handler: async ({ ctx, config, next }) => {
      if (config.required && !ctx.headers.authorization) {
        return { response: { status: 401, body: { error: 'Unauthorized' } } };
      }
      return next();
    },
  });

  const rateLimitMiddleware = defineMiddleware('rate-limit', {
    config: {
      max: field.number().default(100),
      windowMs: field.number().default(60000),
    },
    handler: async ({ ctx, config, next }) => {
      // Rate limit logic would go here
      return next();
    },
  });

  const tenantMiddleware = defineMiddleware('tenant', {
    config: {
      headerName: field.string().default('X-Tenant-ID'),
    },
    handler: async ({ ctx, config, next }) => {
      const tenantId = ctx.headers[config.headerName.toLowerCase()];
      ctx.context.tenantId = tenantId;
      return next();
    },
    requiredHeaders: ['X-Tenant-ID'],
  });

  // Create a middleware map for testing
  const analyzedMiddlewareMap = new Map<string, AnalyzedMiddleware>([
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

  describe('resolveMiddlewareRef', () => {
    describe('string references', () => {
      it('should resolve a string middleware reference', () => {
        const result = resolveMiddlewareRef('auth');

        expect(result.name).toBe('auth');
        expect(result.pascalName).toBe('Auth');
        expect(result.hasConfigOverrides).toBe(false);
        expect(result.configOverrides).toBeUndefined();
        expect(result.middleware).toBeUndefined();
      });

      it('should resolve a hyphenated string name to PascalCase', () => {
        const result = resolveMiddlewareRef('rate-limit');

        expect(result.name).toBe('rate-limit');
        expect(result.pascalName).toBe('RateLimit');
        expect(result.hasConfigOverrides).toBe(false);
      });

      it('should link to analyzed middleware when map is provided', () => {
        const result = resolveMiddlewareRef('auth', analyzedMiddlewareMap);

        expect(result.name).toBe('auth');
        expect(result.middleware).toBeDefined();
        expect(result.middleware?.name).toBe('auth');
      });
    });

    describe('direct middleware references', () => {
      it('should resolve a direct middleware reference', () => {
        const result = resolveMiddlewareRef(authMiddleware);

        expect(result.name).toBe('auth');
        expect(result.pascalName).toBe('Auth');
        expect(result.hasConfigOverrides).toBe(false);
        expect(result.configOverrides).toBeUndefined();
        expect(result.middleware).toBeUndefined();
      });

      it('should resolve a hyphenated middleware name to PascalCase', () => {
        const result = resolveMiddlewareRef(rateLimitMiddleware);

        expect(result.name).toBe('rate-limit');
        expect(result.pascalName).toBe('RateLimit');
        expect(result.hasConfigOverrides).toBe(false);
      });

      it('should link to analyzed middleware when map is provided', () => {
        const result = resolveMiddlewareRef(authMiddleware, analyzedMiddlewareMap);

        expect(result.name).toBe('auth');
        expect(result.middleware).toBeDefined();
        expect(result.middleware?.name).toBe('auth');
        expect(result.middleware?.configFields.length).toBe(1);
      });
    });

    describe('configured references via .with()', () => {
      it('should resolve a .with() configured reference', () => {
        const configuredRef = rateLimitMiddleware.with({ max: 10 });
        const result = resolveMiddlewareRef(configuredRef);

        expect(result.name).toBe('rate-limit');
        expect(result.pascalName).toBe('RateLimit');
        expect(result.hasConfigOverrides).toBe(true);
        expect(result.configOverrides).toEqual({ max: 10 });
      });

      it('should resolve .with() with multiple config overrides', () => {
        const configuredRef = rateLimitMiddleware.with({ max: 50, windowMs: 30000 });
        const result = resolveMiddlewareRef(configuredRef);

        expect(result.hasConfigOverrides).toBe(true);
        expect(result.configOverrides).toEqual({ max: 50, windowMs: 30000 });
      });

      it('should link to analyzed middleware when map is provided', () => {
        const configuredRef = rateLimitMiddleware.with({ max: 10 });
        const result = resolveMiddlewareRef(configuredRef, analyzedMiddlewareMap);

        expect(result.middleware).toBeDefined();
        expect(result.middleware?.name).toBe('rate-limit');
        expect(result.configOverrides).toEqual({ max: 10 });
      });
    });

    describe('error handling', () => {
      it('should throw for invalid middleware reference', () => {
        const invalidRef = { notAMiddleware: true } as any;

        expect(() => resolveMiddlewareRef(invalidRef)).toThrow('Invalid middleware reference');
      });
    });
  });

  describe('resolveMiddlewareRefs', () => {
    it('should return undefined for undefined input', () => {
      const result = resolveMiddlewareRefs(undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      const result = resolveMiddlewareRefs([]);
      expect(result).toBeUndefined();
    });

    it('should resolve array of direct references', () => {
      const result = resolveMiddlewareRefs([authMiddleware, tenantMiddleware]);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result![0].name).toBe('auth');
      expect(result![0].hasConfigOverrides).toBe(false);
      expect(result![1].name).toBe('tenant');
      expect(result![1].hasConfigOverrides).toBe(false);
    });

    it('should resolve mixed array of direct and configured references', () => {
      const result = resolveMiddlewareRefs([
        authMiddleware,
        rateLimitMiddleware.with({ max: 10 }),
        tenantMiddleware,
      ]);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      // First: direct reference
      expect(result![0].name).toBe('auth');
      expect(result![0].hasConfigOverrides).toBe(false);

      // Second: configured reference
      expect(result![1].name).toBe('rate-limit');
      expect(result![1].hasConfigOverrides).toBe(true);
      expect(result![1].configOverrides).toEqual({ max: 10 });

      // Third: direct reference
      expect(result![2].name).toBe('tenant');
      expect(result![2].hasConfigOverrides).toBe(false);
    });

    it('should link all references to analyzed middleware when map is provided', () => {
      const result = resolveMiddlewareRefs(
        [authMiddleware, rateLimitMiddleware],
        analyzedMiddlewareMap
      );

      expect(result).toBeDefined();
      expect(result![0].middleware).toBeDefined();
      expect(result![1].middleware).toBeDefined();
    });

    it('should resolve mixed array with string references', () => {
      const result = resolveMiddlewareRefs([
        authMiddleware,
        'cache',  // string reference
        rateLimitMiddleware.with({ max: 10 }),
      ]);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      // First: direct reference
      expect(result![0].name).toBe('auth');
      expect(result![0].hasConfigOverrides).toBe(false);

      // Second: string reference
      expect(result![1].name).toBe('cache');
      expect(result![1].pascalName).toBe('Cache');
      expect(result![1].hasConfigOverrides).toBe(false);

      // Third: configured reference
      expect(result![2].name).toBe('rate-limit');
      expect(result![2].hasConfigOverrides).toBe(true);
    });
  });
});
