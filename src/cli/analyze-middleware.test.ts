import { describe, it, expect } from 'vitest';
import { analyzeMiddleware, clearAnalysisCache } from './analyze-middleware';
import { defineMiddleware, field } from '../schema';

describe('analyzeMiddleware', () => {
  beforeEach(() => {
    clearAnalysisCache();
  });

  describe('basic middleware analysis', () => {
    it('should analyze middleware name and pascalName', () => {
      const authMiddleware = defineMiddleware('auth', {
        config: {},
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([authMiddleware]);

      expect(analyzed).toHaveLength(1);
      expect(analyzed[0].name).toBe('auth');
      expect(analyzed[0].pascalName).toBe('Auth');
    });

    it('should convert hyphenated names to PascalCase', () => {
      const rateLimitMiddleware = defineMiddleware('rate-limit', {
        config: {},
        handler: async ({ ctx, config, next }) => next(),
      });

      const apiKeyAuthMiddleware = defineMiddleware('api-key-auth', {
        config: {},
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([rateLimitMiddleware, apiKeyAuthMiddleware]);

      expect(analyzed[0].pascalName).toBe('RateLimit');
      expect(analyzed[1].pascalName).toBe('ApiKeyAuth');
    });
  });

  describe('requiredHeaders extraction', () => {
    it('should extract requiredHeaders from middleware schema', () => {
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

      const analyzed = analyzeMiddleware([tenantMiddleware]);

      expect(analyzed[0].requiredHeaders).toBeDefined();
      expect(analyzed[0].requiredHeaders).toEqual(['X-Tenant-ID']);
    });

    it('should handle middleware with multiple required headers', () => {
      const customMiddleware = defineMiddleware('custom', {
        config: {},
        handler: async ({ ctx, config, next }) => next(),
        requiredHeaders: ['X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID'],
      });

      const analyzed = analyzeMiddleware([customMiddleware]);

      expect(analyzed[0].requiredHeaders).toHaveLength(3);
      expect(analyzed[0].requiredHeaders).toContain('X-Request-ID');
      expect(analyzed[0].requiredHeaders).toContain('X-Correlation-ID');
      expect(analyzed[0].requiredHeaders).toContain('X-Trace-ID');
    });

    it('should return undefined requiredHeaders for middleware without requiredHeaders config', () => {
      const simpleMiddleware = defineMiddleware('simple', {
        config: {},
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([simpleMiddleware]);

      expect(analyzed[0].requiredHeaders).toBeUndefined();
    });

    it('should extract requiredHeaders alongside other middleware properties', () => {
      const authMiddleware = defineMiddleware('auth', {
        config: {
          required: field.boolean().default(true),
          tokenHeader: field.string().default('Authorization'),
        },
        handler: async ({ ctx, config, next }) => {
          if (config.required && !ctx.headers[config.tokenHeader.toLowerCase()]) {
            return { response: { status: 401, body: { error: 'Unauthorized' } } };
          }
          return next();
        },
        description: 'Authentication middleware',
        order: 'early',
        requiredHeaders: ['Authorization'],
      });

      const analyzed = analyzeMiddleware([authMiddleware]);
      const middleware = analyzed[0];

      expect(middleware.name).toBe('auth');
      expect(middleware.pascalName).toBe('Auth');
      expect(middleware.description).toBe('Authentication middleware');
      expect(middleware.order).toBe('early');
      expect(middleware.requiredHeaders).toEqual(['Authorization']);
      expect(middleware.configFields).toHaveLength(2);
      expect(middleware.configFields.find(f => f.name === 'required')?.default).toBe(true);
      expect(middleware.configFields.find(f => f.name === 'tokenHeader')?.default).toBe('Authorization');
    });
  });

  describe('config fields analysis', () => {
    it('should analyze config fields with defaults', () => {
      const rateLimitMiddleware = defineMiddleware('rate-limit', {
        config: {
          max: field.number().default(100),
          windowMs: field.number().default(60000),
          keyBy: field.string().default('ip'),
        },
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([rateLimitMiddleware]);
      const configFields = analyzed[0].configFields;

      expect(configFields).toHaveLength(3);
      expect(configFields.find(f => f.name === 'max')?.default).toBe(100);
      expect(configFields.find(f => f.name === 'windowMs')?.default).toBe(60000);
      expect(configFields.find(f => f.name === 'keyBy')?.default).toBe('ip');
    });

    it('should analyze config fields with nullable types', () => {
      const middleware = defineMiddleware('test', {
        config: {
          optionalValue: field.string().nullable(),
        },
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([middleware]);
      const optionalField = analyzed[0].configFields.find(f => f.name === 'optionalValue');

      expect(optionalField?.nullable).toBe(true);
    });

    it('should analyze config fields with enum values', () => {
      const middleware = defineMiddleware('log-level', {
        config: {
          level: field.enum(['debug', 'info', 'warn', 'error']).default('info'),
        },
        handler: async ({ ctx, config, next }) => next(),
      });

      const analyzed = analyzeMiddleware([middleware]);
      const levelField = analyzed[0].configFields.find(f => f.name === 'level');

      expect(levelField?.enumValues).toEqual(['debug', 'info', 'warn', 'error']);
      expect(levelField?.default).toBe('info');
    });
  });

  describe('order property', () => {
    it('should extract order from middleware schema', () => {
      const earlyMiddleware = defineMiddleware('early', {
        config: {},
        handler: async ({ next }) => next(),
        order: 'early',
      });

      const normalMiddleware = defineMiddleware('normal', {
        config: {},
        handler: async ({ next }) => next(),
        order: 'normal',
      });

      const lateMiddleware = defineMiddleware('late', {
        config: {},
        handler: async ({ next }) => next(),
        order: 'late',
      });

      const analyzed = analyzeMiddleware([earlyMiddleware, normalMiddleware, lateMiddleware]);

      expect(analyzed[0].order).toBe('early');
      expect(analyzed[1].order).toBe('normal');
      expect(analyzed[2].order).toBe('late');
    });
  });
});
