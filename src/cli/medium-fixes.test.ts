/**
 * Tests for medium priority fixes
 *
 * These tests verify the fixes for medium priority issues:
 * 1. Query key stability in React hooks
 * 2. Missing type mappings (bigint, decimal, bytea, etc.)
 * 3. Config schema validation with Zod
 * 4. FK inference warnings
 * 5. Improved computed field type inference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fieldToTsType, primitiveToTs } from './utils/type-mapping';

describe('Missing Type Mappings', () => {
  describe('fieldToTsType', () => {
    it('should map bigint types correctly', () => {
      expect(fieldToTsType({ type: 'bigint' })).toBe('bigint');
      expect(fieldToTsType({ type: 'bigserial' })).toBe('bigint');
    });

    it('should map decimal/money types to string for precision', () => {
      expect(fieldToTsType({ type: 'decimal' })).toBe('string');
      expect(fieldToTsType({ type: 'numeric' })).toBe('string');
      expect(fieldToTsType({ type: 'money' })).toBe('string');
    });

    it('should map binary types to Uint8Array', () => {
      expect(fieldToTsType({ type: 'bytea' })).toBe('Uint8Array');
      expect(fieldToTsType({ type: 'binary' })).toBe('Uint8Array');
      expect(fieldToTsType({ type: 'blob' })).toBe('Uint8Array');
    });

    it('should map timestamp types to Date', () => {
      expect(fieldToTsType({ type: 'timestamp' })).toBe('Date');
      expect(fieldToTsType({ type: 'timestamptz' })).toBe('Date');
      expect(fieldToTsType({ type: 'datetime' })).toBe('Date');
    });

    it('should map time types to string', () => {
      expect(fieldToTsType({ type: 'time' })).toBe('string');
      expect(fieldToTsType({ type: 'timetz' })).toBe('string');
      expect(fieldToTsType({ type: 'interval' })).toBe('string');
    });

    it('should map jsonb type correctly', () => {
      expect(fieldToTsType({ type: 'jsonb' })).toBe('unknown');
    });

    it('should map point type to coordinate object', () => {
      expect(fieldToTsType({ type: 'point' })).toBe('{ x: number; y: number }');
    });

    it('should map integer alias correctly', () => {
      expect(fieldToTsType({ type: 'integer' })).toBe('number');
      expect(fieldToTsType({ type: 'double' })).toBe('number');
    });
  });

  describe('primitiveToTs', () => {
    it('should handle all new numeric types', () => {
      expect(primitiveToTs('bigint')).toBe('bigint');
      expect(primitiveToTs('decimal')).toBe('string');
      expect(primitiveToTs('money')).toBe('string');
    });

    it('should handle binary types', () => {
      expect(primitiveToTs('bytea')).toBe('Uint8Array');
      expect(primitiveToTs('binary')).toBe('Uint8Array');
    });

    it('should handle timestamp types', () => {
      expect(primitiveToTs('timestamp')).toBe('Date');
      expect(primitiveToTs('timestamptz')).toBe('Date');
    });
  });
});

describe('PostgreSQL Type Mappings', () => {
  it('should have all new types in PG_TYPE_MAP', async () => {
    const { PG_TYPE_MAP } = await import('./generators/sql/pg-types');

    // BigInt types
    expect(PG_TYPE_MAP.bigint).toBe('BIGINT');
    expect(PG_TYPE_MAP.bigserial).toBe('BIGSERIAL');

    // Decimal types
    expect(PG_TYPE_MAP.decimal).toBe('DECIMAL');
    expect(PG_TYPE_MAP.numeric).toBe('NUMERIC');
    expect(PG_TYPE_MAP.money).toBe('MONEY');

    // Binary types
    expect(PG_TYPE_MAP.bytea).toBe('BYTEA');
    expect(PG_TYPE_MAP.binary).toBe('BYTEA');
    expect(PG_TYPE_MAP.blob).toBe('BYTEA');

    // Timestamp types
    expect(PG_TYPE_MAP.timestamp).toBe('TIMESTAMP');
    expect(PG_TYPE_MAP.timestamptz).toBe('TIMESTAMPTZ');

    // Time types
    expect(PG_TYPE_MAP.time).toBe('TIME');
    expect(PG_TYPE_MAP.timetz).toBe('TIMETZ');
    expect(PG_TYPE_MAP.interval).toBe('INTERVAL');

    // PostGIS types
    expect(PG_TYPE_MAP.point).toBe('POINT');
    expect(PG_TYPE_MAP.geometry).toBe('GEOMETRY');
    expect(PG_TYPE_MAP.geography).toBe('GEOGRAPHY');
  });
});

describe('Computed Field Type Inference', () => {
  // We need to import the analyze module and test inferComputedType indirectly
  // through analyzeSchemas since it's not exported

  it('should infer number types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'stats',
      fields: { id: { type: 'uuid' } },
      computed: {
        userCount: () => 0,
        totalAmount: () => 0,
        averageScore: () => 0,
        pricePerUnit: () => 0,
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('userCount')).toBe('number');
    expect(computedMap.get('totalAmount')).toBe('number');
    expect(computedMap.get('averageScore')).toBe('number');
    expect(computedMap.get('pricePerUnit')).toBe('number');
  });

  it('should infer boolean types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'user',
      fields: { id: { type: 'uuid' } },
      computed: {
        isActive: () => true,
        hasPermission: () => true,
        canEdit: () => true,
        accountEnabled: () => true,
        profileComplete: () => true,
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('isActive')).toBe('boolean');
    expect(computedMap.get('hasPermission')).toBe('boolean');
    expect(computedMap.get('canEdit')).toBe('boolean');
    expect(computedMap.get('accountEnabled')).toBe('boolean');
    expect(computedMap.get('profileComplete')).toBe('boolean');
  });

  it('should infer string types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'item',
      fields: { id: { type: 'uuid' } },
      computed: {
        displayName: () => '',
        fullTitle: () => '',
        statusLabel: () => '',
        getFormattedName: () => '',
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('displayName')).toBe('string');
    expect(computedMap.get('fullTitle')).toBe('string');
    expect(computedMap.get('statusLabel')).toBe('string');
    expect(computedMap.get('getFormattedName')).toBe('string');
  });

  it('should infer Date types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'event',
      fields: { id: { type: 'uuid' } },
      computed: {
        createdAt: () => new Date(),
        expirationDate: () => new Date(),
        lastLoginTime: () => new Date(),
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('createdAt')).toBe('Date');
    expect(computedMap.get('expirationDate')).toBe('Date');
    expect(computedMap.get('lastLoginTime')).toBe('Date');
  });

  it('should infer array types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'container',
      fields: { id: { type: 'uuid' } },
      computed: {
        itemList: () => [],
        allUsers: () => [],
        tagNames: () => [],
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('itemList')).toBe('unknown[]');
    expect(computedMap.get('allUsers')).toBe('unknown[]');
    expect(computedMap.get('tagNames')).toBe('unknown[]');
  });

  it('should infer object types from naming patterns', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'widget',
      fields: { id: { type: 'uuid' } },
      computed: {
        displayConfig: () => ({}),
        userSettings: () => ({}),
        metaData: () => ({}),
      },
    }];

    const analyzed = analyzeSchemas(schemas as any, config);
    const computedMap = new Map(analyzed[0].computed.map(c => [c.name, c.type]));

    expect(computedMap.get('displayConfig')).toBe('Record<string, unknown>');
    expect(computedMap.get('userSettings')).toBe('Record<string, unknown>');
    expect(computedMap.get('metaData')).toBe('Record<string, unknown>');
  });
});

describe('React Hooks Query Key Stability', () => {
  it('should generate stable query key helpers', async () => {
    const { generateHooks } = await import('./generators/hooks');

    const schemas = [{
      name: 'user',
      singularName: 'user',
      pluralName: 'users',
      pascalName: 'User',
      pascalSingularName: 'User',
      pascalPluralName: 'Users',
      tableName: 'users',
      endpoint: '/api/users',
      fields: [],
      relations: [],
      computed: [],
      dependsOn: [],
      isJunctionTable: false,
    }];

    const generated = generateHooks(schemas as any);

    // Should import useMemo for stable keys
    expect(generated).toContain("import { useMemo } from 'react'");

    // Should include stableKey helper function
    expect(generated).toContain('function stableKey(options: unknown): string');

    // Should include useStableQueryKey hook
    expect(generated).toContain('function useStableQueryKey(baseKey: string');

    // Should use stable query key in list hook
    expect(generated).toContain("const queryKey = useStableQueryKey('users', options)");
  });
});

describe('Config Schema Validation', () => {
  it('should have Zod schema defined in config module', async () => {
    const configSource = await import('fs').then(fs =>
      fs.readFileSync('./src/cli/config.ts', 'utf-8')
    );

    // Should import Zod
    expect(configSource).toContain("import { z } from 'zod'");

    // Should define config schema
    expect(configSource).toContain('SchemockConfigSchema');

    // Should have validateConfig function
    expect(configSource).toContain('function validateConfig');

    // Should use strict mode to catch typos
    expect(configSource).toContain('.strict()');
  });
});

describe('FK Inference Warnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should emit warning when FK inference falls back to default', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    // Schema with a belongsTo that can't find a matching FK field
    // The field 'creatorRef' targets 'account', not 'user', so it won't match
    const schemas = [{
      name: 'comment',
      fields: {
        id: { type: 'uuid' },
        content: { type: 'text' },
        // No field that targets 'user' or matches 'userId' pattern
        creatorRef: { type: 'ref', target: 'account' },  // Targets different entity
      },
      relations: {
        author: { type: 'belongsTo', target: 'user' },  // Will fail to find FK for 'user'
      },
    }];

    analyzeSchemas(schemas as any, config);

    // Should have warned about FK inference failure
    expect(warnSpy).toHaveBeenCalled();
    const warningMessage = warnSpy.mock.calls[0]?.[0] as string;
    expect(warningMessage).toContain('FK Inference Warning');
    expect(warningMessage).toContain('author');
    expect(warningMessage).toContain('belongsTo');
  });

  it('should NOT emit warning when FK is explicitly specified', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'comment',
      fields: {
        id: { type: 'uuid' },
        creatorRef: { type: 'ref', target: 'user' },
      },
      relations: {
        author: { type: 'belongsTo', target: 'user', foreignKey: 'creatorRef' },  // Explicit FK
      },
    }];

    analyzeSchemas(schemas as any, config);

    // Should NOT have warned
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should NOT emit warning when FK is successfully inferred', async () => {
    const { analyzeSchemas } = await import('./analyze');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const schemas = [{
      name: 'comment',
      fields: {
        id: { type: 'uuid' },
        userId: { type: 'ref', target: 'user' },  // Matches pattern
      },
      relations: {
        user: { type: 'belongsTo', target: 'user' },  // Will find userId
      },
    }];

    analyzeSchemas(schemas as any, config);

    // Should NOT have warned (FK was successfully inferred)
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('Object Property Key Escaping', () => {
  it('should escape property keys with special characters', () => {
    const result = fieldToTsType({
      type: 'object',
      shape: {
        'normal': { type: 'string' },
        'with-dash': { type: 'number' },
        "with'quote": { type: 'boolean' },
        '123startsWithNumber': { type: 'string' },
      },
    } as any);

    // Normal keys should not be quoted
    expect(result).toContain('normal: string');

    // Keys with dashes should be quoted
    expect(result).toContain("'with-dash': number");

    // Keys with quotes should be escaped and quoted
    expect(result).toContain("'with\\'quote': boolean");

    // Keys starting with numbers should be quoted
    expect(result).toContain("'123startsWithNumber': string");
  });
});
