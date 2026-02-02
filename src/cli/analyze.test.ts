import { describe, it, expect } from 'vitest';
import { analyzeSchemas } from './analyze';
import { defineData, field, belongsTo, hasMany, defineMiddleware } from '../schema';
import type { AnalyzedMiddleware } from './types';

describe('findForeignKeyField', () => {
  describe('ref field target matching', () => {
    it('should find FK by ref target when field name does not match entity pattern', () => {
      // This is the bug case: config_id references failoverconfig but name doesn't match pattern
      const failoverconfig = defineData('failoverconfig', {
        name: field.string(),
      });

      const failoverevent = defineData('failoverevent', {
        config_id: field.ref('failoverconfig'), // FK with non-standard name
        event_type: field.string(),
        config: belongsTo('failoverconfig'), // Should find config_id via ref target
      });

      const schemas = [failoverconfig, failoverevent];
      const analyzed = analyzeSchemas(schemas, {});

      const eventSchema = analyzed.find(s => s.name === 'failoverevent');
      const configRelation = eventSchema?.relations.find(r => r.name === 'config');

      // Should use 'config_id' (the actual field), not 'failoverconfigId' (incorrect fallback)
      expect(configRelation?.foreignKey).toBe('config_id');
      expect(configRelation?.localField).toBe('config_id');
    });

    it('should find FK by ref target for hasMany relations', () => {
      const parent = defineData('parent', {
        name: field.string(),
        children: hasMany('child'), // Should find parent_ref via ref target on child
      });

      const child = defineData('child', {
        parent_ref: field.ref('parent'), // FK with non-standard name
        name: field.string(),
      });

      const schemas = [parent, child];
      const analyzed = analyzeSchemas(schemas, {});

      const parentSchema = analyzed.find(s => s.name === 'parent');
      const childrenRelation = parentSchema?.relations.find(r => r.name === 'children');

      // Should use 'parent_ref' (the actual field), not 'parentId' (fallback)
      expect(childrenRelation?.foreignKey).toBe('parent_ref');
    });
  });

  describe('name pattern matching (legacy behavior)', () => {
    it('should find FK by camelCase pattern (userId)', () => {
      const user = defineData('user', {
        name: field.string(),
        posts: hasMany('post'),
      });

      const post = defineData('post', {
        userId: field.string(), // Standard camelCase pattern
        title: field.string(),
        author: belongsTo('user'),
      });

      const schemas = [user, post];
      const analyzed = analyzeSchemas(schemas, {});

      const postSchema = analyzed.find(s => s.name === 'post');
      const authorRelation = postSchema?.relations.find(r => r.name === 'author');

      expect(authorRelation?.foreignKey).toBe('userId');
    });

    it('should find FK by snake_case pattern (user_id)', () => {
      const user = defineData('user', {
        name: field.string(),
      });

      const post = defineData('post', {
        user_id: field.string(), // Standard snake_case pattern
        title: field.string(),
        author: belongsTo('user'),
      });

      const schemas = [user, post];
      const analyzed = analyzeSchemas(schemas, {});

      const postSchema = analyzed.find(s => s.name === 'post');
      const authorRelation = postSchema?.relations.find(r => r.name === 'author');

      expect(authorRelation?.foreignKey).toBe('user_id');
    });
  });

  describe('explicit foreignKey takes precedence', () => {
    it('should use explicit foreignKey over ref target detection', () => {
      const user = defineData('user', {
        name: field.string(),
      });

      const post = defineData('post', {
        author_ref: field.ref('user'),
        custom_fk: field.string(),
        author: belongsTo('user', { foreignKey: 'custom_fk' }), // Explicit FK
      });

      const schemas = [user, post];
      const analyzed = analyzeSchemas(schemas, {});

      const postSchema = analyzed.find(s => s.name === 'post');
      const authorRelation = postSchema?.relations.find(r => r.name === 'author');

      // Should use explicit 'custom_fk', not detected 'author_ref'
      expect(authorRelation?.foreignKey).toBe('custom_fk');
    });
  });

  describe('plural entity name matching', () => {
    it('should match ref target with plural entity name', () => {
      const users = defineData('users', { // Plural
        name: field.string(),
      });

      const post = defineData('post', {
        author_id: field.ref('users'), // Targets plural 'users'
        title: field.string(),
        author: belongsTo('users'),
      });

      const schemas = [users, post];
      const analyzed = analyzeSchemas(schemas, {});

      const postSchema = analyzed.find(s => s.name === 'post');
      const authorRelation = postSchema?.relations.find(r => r.name === 'author');

      expect(authorRelation?.foreignKey).toBe('author_id');
    });
  });

  describe('hasMany uses child belongsTo FK', () => {
    it('should find FK from child belongsTo relation with ref field', () => {
      const failoverconfig = defineData('failoverconfig', {
        name: field.string(),
        events: hasMany('failoverevent'),
      });

      const failoverevent = defineData('failoverevent', {
        config_id: field.ref('failoverconfig'), // FK field
        event_type: field.string(),
        config: belongsTo('failoverconfig'), // belongsTo without explicit FK
      });

      const schemas = [failoverconfig, failoverevent];
      const analyzed = analyzeSchemas(schemas, {});

      // The parent's hasMany should use 'config_id' found via child's belongsTo
      const configSchema = analyzed.find(s => s.name === 'failoverconfig');
      const eventsRelation = configSchema?.relations.find(r => r.name === 'events');

      expect(eventsRelation?.foreignKey).toBe('config_id');
    });

    it('should find FK from child belongsTo with explicit foreignKey', () => {
      const failoverconfig = defineData('failoverconfig', {
        name: field.string(),
        events: hasMany('failoverevent'),
      });

      const failoverevent = defineData('failoverevent', {
        config_id: field.string(), // Just a string field, not a ref
        event_type: field.string(),
        config: belongsTo('failoverconfig', { foreignKey: 'config_id' }), // Explicit FK
      });

      const schemas = [failoverconfig, failoverevent];
      const analyzed = analyzeSchemas(schemas, {});

      const configSchema = analyzed.find(s => s.name === 'failoverconfig');
      const eventsRelation = configSchema?.relations.find(r => r.name === 'events');

      expect(eventsRelation?.foreignKey).toBe('config_id');
    });
  });
});

describe('analyzeSchemas middleware extraction', () => {
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
    },
    handler: async ({ ctx, config, next }) => {
      return next();
    },
  });

  const adminMiddleware = defineMiddleware('admin', {
    config: {},
    handler: async ({ ctx, config, next }) => {
      return next();
    },
  });

  describe('entity-level middleware', () => {
    it('should extract middleware from entity schema', () => {
      const user = defineData('user', {
        name: field.string(),
        email: field.email(),
      }, {
        middleware: [authMiddleware, rateLimitMiddleware],
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.middleware).toBeDefined();
      expect(userSchema?.middleware).toHaveLength(2);
      expect(userSchema?.middleware![0].name).toBe('auth');
      expect(userSchema?.middleware![0].pascalName).toBe('Auth');
      expect(userSchema?.middleware![0].hasConfigOverrides).toBe(false);
      expect(userSchema?.middleware![1].name).toBe('rate-limit');
      expect(userSchema?.middleware![1].pascalName).toBe('RateLimit');
    });

    it('should extract middleware with .with() config overrides', () => {
      const user = defineData('user', {
        name: field.string(),
      }, {
        middleware: [authMiddleware, rateLimitMiddleware.with({ max: 10 })],
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.middleware).toBeDefined();
      expect(userSchema?.middleware).toHaveLength(2);

      // First middleware: direct reference
      expect(userSchema?.middleware![0].hasConfigOverrides).toBe(false);

      // Second middleware: configured with .with()
      expect(userSchema?.middleware![1].name).toBe('rate-limit');
      expect(userSchema?.middleware![1].hasConfigOverrides).toBe(true);
      expect(userSchema?.middleware![1].configOverrides).toEqual({ max: 10 });
    });

    it('should return undefined middleware for entities without middleware config', () => {
      const user = defineData('user', {
        name: field.string(),
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.middleware).toBeUndefined();
    });
  });

  describe('per-operation endpoint middleware', () => {
    it('should extract per-operation middleware configuration', () => {
      const user = defineData('user', {
        name: field.string(),
      }, {
        middleware: [authMiddleware], // Default middleware
        endpoints: {
          list: { middleware: [] }, // Public list
          delete: { middleware: [authMiddleware, adminMiddleware] }, // Admin only
        },
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      // Default middleware
      expect(userSchema?.middleware).toHaveLength(1);
      expect(userSchema?.middleware![0].name).toBe('auth');

      // Per-operation middleware
      expect(userSchema?.endpointMiddleware).toBeDefined();
      expect(userSchema?.endpointMiddleware?.list).toEqual([]); // Public (empty array)
      expect(userSchema?.endpointMiddleware?.delete).toHaveLength(2);
      expect(userSchema?.endpointMiddleware?.delete![0].name).toBe('auth');
      expect(userSchema?.endpointMiddleware?.delete![1].name).toBe('admin');
    });

    it('should only include operations that are explicitly configured', () => {
      const user = defineData('user', {
        name: field.string(),
      }, {
        endpoints: {
          list: { middleware: [] },
        },
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.endpointMiddleware).toBeDefined();
      expect(userSchema?.endpointMiddleware?.list).toEqual([]);
      expect(userSchema?.endpointMiddleware?.get).toBeUndefined();
      expect(userSchema?.endpointMiddleware?.create).toBeUndefined();
      expect(userSchema?.endpointMiddleware?.update).toBeUndefined();
      expect(userSchema?.endpointMiddleware?.delete).toBeUndefined();
    });

    it('should return undefined endpointMiddleware for entities without endpoints config', () => {
      const user = defineData('user', {
        name: field.string(),
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.endpointMiddleware).toBeUndefined();
    });

    it('should handle .with() config in endpoint middleware', () => {
      const user = defineData('user', {
        name: field.string(),
      }, {
        endpoints: {
          list: { middleware: [rateLimitMiddleware.with({ max: 1000 })] },
          create: { middleware: [rateLimitMiddleware.with({ max: 10 })] },
        },
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {});
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.endpointMiddleware?.list).toHaveLength(1);
      expect(userSchema?.endpointMiddleware?.list![0].configOverrides).toEqual({ max: 1000 });

      expect(userSchema?.endpointMiddleware?.create).toHaveLength(1);
      expect(userSchema?.endpointMiddleware?.create![0].configOverrides).toEqual({ max: 10 });
    });
  });

  describe('middleware map linking', () => {
    it('should link middleware references to analyzed middleware when map is provided', () => {
      // Create analyzed middleware map
      const middlewareMap = new Map<string, AnalyzedMiddleware>([
        ['auth', {
          name: 'auth',
          pascalName: 'Auth',
          configFields: [{ name: 'required', type: 'boolean', tsType: 'boolean', hasDefault: true, default: true, nullable: false }],
          handlerSource: '',
          order: 'normal',
        }],
      ]);

      const user = defineData('user', {
        name: field.string(),
      }, {
        middleware: [authMiddleware],
      });

      const schemas = [user];
      const analyzed = analyzeSchemas(schemas, {}, middlewareMap);
      const userSchema = analyzed.find(s => s.name === 'user');

      expect(userSchema?.middleware![0].middleware).toBeDefined();
      expect(userSchema?.middleware![0].middleware?.name).toBe('auth');
      expect(userSchema?.middleware![0].middleware?.configFields).toHaveLength(1);
    });
  });
});
