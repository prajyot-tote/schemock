/**
 * Comprehensive error handling and negative test cases
 *
 * These tests verify that the system handles invalid inputs, edge cases,
 * and error conditions gracefully.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeSchemas } from './analyze';
import { filterSchemasForTarget } from './generators/target-registry';
import { defineData, field, belongsTo, hasMany } from '../schema';
import { fieldToTsType, primitiveToTs } from './utils/type-mapping';
import { fieldToFakerCall } from './utils/faker-mapping';
import { escapeSqlString } from './generators/sql/pg-types';
import type { SchemockConfig, AnalyzedSchema, GenerationTarget } from './types';

// Default config for tests
const defaultConfig: SchemockConfig = {
  schemas: '',
  output: '',
  adapter: 'mock',
  apiPrefix: '/api',
};

// ============================================================================
// Schema Analysis Error Handling
// ============================================================================

describe('Schema Analysis Error Handling', () => {
  describe('Empty and null inputs', () => {
    it('should handle empty schema array', () => {
      const result = analyzeSchemas([], defaultConfig);
      expect(result).toEqual([]);
    });

    it('should handle schema with empty fields object', () => {
      const schema = { name: 'empty', fields: {} };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('empty');
      // Note: analyzeSchemas does NOT auto-generate id (only defineData does)
      // Raw schema objects pass through without modification
      expect(result[0].fields).toHaveLength(0);
    });

    it('should handle schema with undefined relations', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        relations: undefined,
      };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].relations).toEqual([]);
    });

    it('should handle schema with undefined computed', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        computed: undefined,
      };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].computed).toEqual([]);
    });

    it('should handle schema with empty name', () => {
      const schema = { name: '', fields: { id: { type: 'uuid' } } };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('');
      // Note: Empty string pluralizes to 's' - this is current behavior
      // Consider validating schema names are non-empty
      expect(result[0].endpoint).toBe('/api/s');
    });
  });

  describe('Invalid field types', () => {
    it('should handle unknown field type gracefully', () => {
      const schema = {
        name: 'test',
        fields: {
          id: { type: 'uuid' },
          weird: { type: 'nonexistent_type' },
        },
      };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      const weirdField = result[0].fields.find(f => f.name === 'weird');
      expect(weirdField).toBeDefined();
      expect(weirdField?.type).toBe('nonexistent_type');
    });

    it('should handle field with missing type', () => {
      const schema = {
        name: 'test',
        fields: {
          id: { type: 'uuid' },
          noType: {}, // Missing type
        },
      };
      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      const noTypeField = result[0].fields.find(f => f.name === 'noType');
      expect(noTypeField).toBeDefined();
      expect(noTypeField?.type).toBeUndefined();
    });

    it('should handle null field definition', () => {
      const schema = {
        name: 'test',
        fields: {
          id: { type: 'uuid' },
          nullField: null,
        },
      };

      // This should throw or handle gracefully
      expect(() => analyzeSchemas([schema as any], defaultConfig)).toThrow();
    });
  });

  describe('Invalid relation targets', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should handle belongsTo with non-existent target', () => {
      const schema = {
        name: 'orphan',
        fields: { id: { type: 'uuid' } },
        relations: {
          parent: { type: 'belongsTo', target: 'nonexistent' },
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].relations).toHaveLength(1);
      expect(result[0].relations[0].target).toBe('nonexistent');
      // Should have warned about FK inference
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle hasMany with non-existent target', () => {
      const schema = {
        name: 'parent',
        fields: { id: { type: 'uuid' } },
        relations: {
          children: { type: 'hasMany', target: 'ghost' },
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].relations).toHaveLength(1);
      expect(result[0].relations[0].target).toBe('ghost');
    });

    it('should handle empty target string', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        relations: {
          empty: { type: 'belongsTo', target: '' },
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].relations[0].target).toBe('');
    });
  });

  describe('Circular dependencies', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should handle self-referencing schema', () => {
      const schema = {
        name: 'node',
        fields: {
          id: { type: 'uuid' },
          parentId: { type: 'ref', target: 'node' },
        },
        relations: {
          parent: { type: 'belongsTo', target: 'node' },
          children: { type: 'hasMany', target: 'node' },
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('node');
      expect(result[0].dependsOn).toContain('node');
    });

    it('should handle mutual circular dependency', () => {
      const schemaA = {
        name: 'a',
        fields: {
          id: { type: 'uuid' },
          bId: { type: 'ref', target: 'b' },
        },
        relations: {
          b: { type: 'belongsTo', target: 'b' },
        },
      };

      const schemaB = {
        name: 'b',
        fields: {
          id: { type: 'uuid' },
          aId: { type: 'ref', target: 'a' },
        },
        relations: {
          a: { type: 'belongsTo', target: 'a' },
        },
      };

      const result = analyzeSchemas([schemaA, schemaB] as any[], defaultConfig);

      expect(result).toHaveLength(2);
      // Should warn about circular dependency
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Circular dependency'));
    });
  });

  describe('Malformed RLS configuration', () => {
    it('should handle RLS with empty scope array', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        rls: { scope: [] },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result[0].rls.enabled).toBe(false);
      expect(result[0].rls.scope).toEqual([]);
    });

    it('should handle RLS with null bypass', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        rls: {
          scope: [{ field: 'userId', contextKey: 'userId' }],
          bypass: null,
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      expect(result[0].rls.enabled).toBe(true);
      expect(result[0].rls.bypass).toEqual([]);
    });

    it('should handle RLS with invalid policy function', () => {
      const schema = {
        name: 'test',
        fields: { id: { type: 'uuid' } },
        rls: {
          select: 'not a function', // Invalid
        },
      };

      const result = analyzeSchemas([schema as any], defaultConfig);

      // Should not crash, RLS should be analyzed
      expect(result[0].rls).toBeDefined();
    });
  });
});

// ============================================================================
// Type Mapping Error Handling
// ============================================================================

describe('Type Mapping Error Handling', () => {
  describe('fieldToTsType edge cases', () => {
    it('should handle undefined field', () => {
      expect(() => fieldToTsType(undefined as any)).toThrow();
    });

    it('should handle null field', () => {
      expect(() => fieldToTsType(null as any)).toThrow();
    });

    it('should handle field with undefined type', () => {
      const result = fieldToTsType({ type: undefined } as any);
      expect(result).toBe('unknown');
    });

    it('should handle field with null type', () => {
      const result = fieldToTsType({ type: null } as any);
      expect(result).toBe('unknown');
    });

    it('should handle field with empty string type', () => {
      const result = fieldToTsType({ type: '' });
      expect(result).toBe('unknown');
    });

    it('should handle array field with missing items', () => {
      const result = fieldToTsType({ type: 'array' });
      expect(result).toBe('unknown[]');
    });

    it('should handle object field with missing shape', () => {
      const result = fieldToTsType({ type: 'object' });
      expect(result).toBe('Record<string, unknown>');
    });

    it('should handle object field with empty shape', () => {
      const result = fieldToTsType({ type: 'object', shape: {} });
      // Note: Returns '{  }' with spaces due to template formatting
      expect(result).toBe('{  }');
    });

    it('should handle enum field with empty values array', () => {
      const result = fieldToTsType({ type: 'enum', values: [] });
      // Note: Returns 'string' for empty enum - consider returning 'never' for type safety
      expect(result).toBe('string');
    });

    it('should handle enum field with undefined values', () => {
      const result = fieldToTsType({ type: 'enum', values: undefined });
      expect(result).toBe('string');
    });

    it('should handle ref field with missing target', () => {
      const result = fieldToTsType({ type: 'ref' });
      expect(result).toBe('string');
    });
  });

  describe('primitiveToTs edge cases', () => {
    it('should return unknown for undefined', () => {
      expect(primitiveToTs(undefined as any)).toBe('unknown');
    });

    it('should return unknown for null', () => {
      expect(primitiveToTs(null as any)).toBe('unknown');
    });

    it('should return unknown for empty string', () => {
      expect(primitiveToTs('')).toBe('unknown');
    });

    it('should return unknown for unrecognized type', () => {
      expect(primitiveToTs('completely_made_up_type')).toBe('unknown');
    });

    it('should handle type with extra whitespace', () => {
      expect(primitiveToTs('  string  ')).toBe('unknown'); // Not trimmed
    });

    it('should be case sensitive', () => {
      expect(primitiveToTs('STRING')).toBe('unknown'); // Not recognized
      expect(primitiveToTs('string')).toBe('string');
    });
  });
});

// ============================================================================
// Faker Mapping Error Handling
// ============================================================================

describe('Faker Mapping Error Handling', () => {
  describe('fieldToFakerCall edge cases', () => {
    it('should handle field with undefined type', () => {
      const result = fieldToFakerCall('test', { type: undefined } as any, defaultConfig);
      expect(result).toContain('faker');
    });

    it('should throw on enum with non-string values', () => {
      const field = {
        type: 'enum',
        values: [1, 2, 3] as any, // Numbers instead of strings
      };
      // BUG: escapeJsString crashes on non-string values
      // This documents current behavior - should be fixed to handle gracefully
      expect(() => fieldToFakerCall('status', field, defaultConfig)).toThrow('value.replace is not a function');
    });

    it('should throw on enum with mixed types', () => {
      const field = {
        type: 'enum',
        values: ['a', 1, true, null] as any,
      };
      // BUG: Crashes when it hits the first non-string value
      // This documents current behavior - should be fixed to stringify values
      expect(() => fieldToFakerCall('mixed', field, defaultConfig)).toThrow('value.replace is not a function');
    });

    it('should handle empty field name', () => {
      const result = fieldToFakerCall('', { type: 'string' }, defaultConfig);
      expect(result).toContain('faker');
    });

    it('should handle special characters in field name', () => {
      const result = fieldToFakerCall('field-with-dashes', { type: 'string' }, defaultConfig);
      expect(result).toContain('faker');
    });
  });
});

// ============================================================================
// SQL Escaping Edge Cases
// ============================================================================

describe('SQL Escaping Edge Cases', () => {
  describe('escapeSqlString boundary conditions', () => {
    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const result = escapeSqlString(longString);
      expect(result).toBe(longString);
      expect(result.length).toBe(10000);
    });

    it('should handle string with only quotes', () => {
      expect(escapeSqlString("'")).toBe("''");
      expect(escapeSqlString("''")).toBe("''''");
      expect(escapeSqlString("'''")).toBe("''''''");
    });

    it('should handle null bytes', () => {
      const withNull = 'before\x00after';
      const result = escapeSqlString(withNull);
      expect(result).toBe(withNull); // Null byte preserved
    });

    it('should handle all ASCII control characters', () => {
      const controls = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('');
      const result = escapeSqlString(controls);
      expect(result.length).toBe(32);
    });

    it('should handle mixed quotes and special chars', () => {
      const complex = "It's a \"test\" with \\ backslash and 'quotes'";
      const result = escapeSqlString(complex);
      expect(result).toBe("It''s a \"test\" with \\ backslash and ''quotes''");
    });

    it('should handle unicode edge cases', () => {
      // Zero-width characters
      const zeroWidth = 'a\u200Bb\u200Cc';
      expect(escapeSqlString(zeroWidth)).toBe(zeroWidth);

      // Surrogate pairs (emoji)
      const emoji = '👨‍👩‍👧‍👦'; // Family emoji (multiple code points)
      expect(escapeSqlString(emoji)).toBe(emoji);

      // Right-to-left text
      const rtl = 'مرحبا';
      expect(escapeSqlString(rtl)).toBe(rtl);
    });
  });
});

// ============================================================================
// Filter Schemas Error Handling
// ============================================================================

describe('Filter Schemas Error Handling', () => {
  const createMockSchema = (name: string, tags: string[] = []): AnalyzedSchema => ({
    name,
    singularName: name,
    pluralName: name + 's',
    pascalName: name.charAt(0).toUpperCase() + name.slice(1),
    pascalSingularName: name.charAt(0).toUpperCase() + name.slice(1),
    pascalPluralName: name.charAt(0).toUpperCase() + name.slice(1) + 's',
    tableName: name + 's',
    endpoint: `/api/${name}s`,
    fields: [],
    relations: [],
    computed: [],
    dependsOn: [],
    hasTimestamps: true,
    isJunctionTable: false,
    rls: { enabled: false, hasSelect: false, hasInsert: false, hasUpdate: false, hasDelete: false, scope: [], bypass: [] },
    indexes: [],
    rpc: [],
    tags,
    original: {} as any,
  });

  describe('Empty and null inputs', () => {
    it('should handle empty schemas array', () => {
      const target: GenerationTarget = { name: 'test', type: 'mock', output: './' };
      const result = filterSchemasForTarget([], target);
      expect(result).toEqual([]);
    });

    it('should handle target with all undefined filters', () => {
      const schemas = [createMockSchema('user', ['auth'])];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        entities: undefined,
        excludeEntities: undefined,
        tags: undefined,
        excludeTags: undefined,
        module: undefined,
        group: undefined,
      };
      const result = filterSchemasForTarget(schemas, target);
      expect(result).toHaveLength(1);
    });

    it('should handle schemas with undefined tags', () => {
      const schema = createMockSchema('user');
      (schema as any).tags = undefined;

      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: ['auth'],
      };

      const result = filterSchemasForTarget([schema], target);
      expect(result).toEqual([]);
    });
  });

  describe('Invalid filter values', () => {
    it('should handle entities filter with empty strings', () => {
      const schemas = [createMockSchema('user'), createMockSchema('post')];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        entities: ['', 'user', ''],
      };
      const result = filterSchemasForTarget(schemas, target);
      expect(result.map(s => s.name)).toContain('user');
    });

    it('should handle tags filter with empty strings', () => {
      const schemas = [createMockSchema('user', ['auth', ''])];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: [''],
      };
      const result = filterSchemasForTarget(schemas, target);
      // Empty string tag should match
      expect(result).toHaveLength(1);
    });

    it('should handle whitespace-only tags', () => {
      const schemas = [createMockSchema('user', ['  ', 'auth'])];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: ['  '],
      };
      const result = filterSchemasForTarget(schemas, target);
      // Whitespace tags should be treated as-is (no trim)
      expect(result.map(s => s.name)).toContain('user');
    });
  });

  describe('Conflicting filters', () => {
    it('should handle when entities and excludeEntities overlap', () => {
      const schemas = [createMockSchema('user'), createMockSchema('post')];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        entities: ['user', 'post'],
        excludeEntities: ['user'], // Overlaps with entities
      };
      const result = filterSchemasForTarget(schemas, target);
      // excludeEntities should take precedence
      expect(result.map(s => s.name)).toEqual(['post']);
    });

    it('should handle when tags and excludeTags overlap', () => {
      const schemas = [createMockSchema('user', ['auth', 'core'])];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: ['auth'],
        excludeTags: ['auth'], // Same tag in both
      };
      const result = filterSchemasForTarget(schemas, target);
      // excludeTags should filter out even if tags includes it
      expect(result).toEqual([]);
    });

    it('should handle impossible filter combination', () => {
      const schemas = [
        createMockSchema('user', ['a']),
        createMockSchema('post', ['b']),
      ];
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: ['c'], // No schema has this tag
      };
      const result = filterSchemasForTarget(schemas, target);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// Config Validation Error Handling
// ============================================================================

describe('Config Validation Error Handling', () => {
  it('should validate required fields exist', async () => {
    const { loadConfig } = await import('./config');

    // Attempting to load non-existent config should use defaults
    const config = await loadConfig();
    expect(config.schemas).toBeDefined();
    expect(config.output).toBeDefined();
    expect(config.adapter).toBeDefined();
  });
});

// ============================================================================
// defineData Error Handling
// ============================================================================

describe('defineData Error Handling', () => {
  it('should handle empty field object', () => {
    const schema = defineData('empty', {});

    expect(schema.name).toBe('empty');
    expect(schema.fields).toBeDefined();
    // Should have auto-generated id
    expect(schema.fields.id).toBeDefined();
  });

  it('should handle schema name with special characters', () => {
    // This might be valid or throw - documenting current behavior
    const schema = defineData('with-dashes', {
      name: field.string(),
    });

    expect(schema.name).toBe('with-dashes');
  });

  it('should handle schema name with spaces', () => {
    const schema = defineData('with spaces', {
      name: field.string(),
    });

    expect(schema.name).toBe('with spaces');
  });

  it('should handle very long schema name', () => {
    const longName = 'a'.repeat(1000);
    const schema = defineData(longName, {
      name: field.string(),
    });

    expect(schema.name).toBe(longName);
  });

  it('should handle duplicate field names (last wins)', () => {
    // TypeScript prevents this at compile time, but testing runtime
    const fields = {
      name: field.string(),
    };
    // @ts-ignore - Testing runtime behavior
    fields.name = field.number();

    const schema = defineData('test', fields);
    expect(schema.fields.name.type).toBe('number');
  });
});

// ============================================================================
// Relation Builder Error Handling
// ============================================================================

describe('Relation Builder Error Handling', () => {
  it('should handle belongsTo with empty target', () => {
    const schema = defineData('test', {
      emptyRef: belongsTo(''),
    });

    expect(schema.relations?.emptyRef).toBeDefined();
    expect(schema.relations?.emptyRef.target).toBe('');
  });

  it('should handle hasMany with empty target', () => {
    const schema = defineData('test', {
      emptyRel: hasMany(''),
    });

    expect(schema.relations?.emptyRel).toBeDefined();
    expect(schema.relations?.emptyRel.target).toBe('');
  });

  it('should handle self-referencing relations', () => {
    const schema = defineData('node', {
      parentId: field.ref('node').nullable(),
      parent: belongsTo('node'),
      children: hasMany('node'),
    });

    expect(schema.relations?.parent.target).toBe('node');
    expect(schema.relations?.children.target).toBe('node');
  });
});

// ============================================================================
// Index Configuration Error Handling
// ============================================================================

describe('Index Configuration Error Handling', () => {
  it('should handle empty fields array in index', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' } },
      indexes: [{ fields: [] }],
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    expect(result[0].indexes).toBeDefined();
  });

  it('should handle index referencing non-existent field', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' } },
      indexes: [{ fields: ['nonexistent'] }],
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    // Should still include the index (validation happens at SQL generation)
    expect(result[0].indexes.some(i => i.fields.includes('nonexistent'))).toBe(true);
  });

  it('should handle duplicate index definitions', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' }, name: { type: 'string' } },
      indexes: [
        { fields: ['name'] },
        { fields: ['name'] }, // Duplicate
      ],
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    // Both indexes should be present (deduplication is not automatic)
    expect(result[0].indexes.filter(i => i.fields.includes('name')).length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// RPC Configuration Error Handling
// ============================================================================

describe('RPC Configuration Error Handling', () => {
  it('should handle RPC with empty SQL', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' } },
      rpc: {
        emptyFunc: {
          args: [],
          returns: 'void',
          sql: '',
        },
      },
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    expect(result[0].rpc.some(r => r.name === 'emptyFunc')).toBe(true);
  });

  it('should handle RPC with invalid return type', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' } },
      rpc: {
        weirdReturn: {
          args: [],
          returns: 'not_a_real_type',
          sql: 'SELECT 1',
        },
      },
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    const rpc = result[0].rpc.find(r => r.name === 'weirdReturn');
    expect(rpc?.returns).toBe('not_a_real_type');
  });

  it('should handle RPC with SQL injection in SQL body', () => {
    const schema = {
      name: 'test',
      fields: { id: { type: 'uuid' } },
      rpc: {
        dangerous: {
          args: [],
          returns: 'void',
          sql: "SELECT * FROM users; DROP TABLE users; --",
        },
      },
    };

    const result = analyzeSchemas([schema as any], defaultConfig);
    // The SQL is stored as-is (it's developer-provided, not user input)
    const rpc = result[0].rpc.find(r => r.name === 'dangerous');
    expect(rpc?.sql).toContain('DROP TABLE');
  });
});
