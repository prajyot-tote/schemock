/**
 * Integration tests for cross-entity seed reference resolution
 *
 * Tests that:
 * 1. ref() and lookup() runtime helpers produce correct marker objects
 * 2. isSeedReference() detects markers correctly
 * 3. Mock seed generator emits reference resolution helpers
 * 4. PGlite seed generator emits reference resolution helpers
 * 5. Generated code compiles successfully with TypeScript
 * 6. Generated resolution logic works at runtime
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateMockSeed } from '../../../cli/generators/mock/seed';
import { generatePGliteSeed } from '../../../cli/generators/pglite/seed';
import { ref, lookup, isSeedReference, SEED_REF_BRAND } from '../../../seed';
import { analyzeTestSchemas, createTempDir, cleanupTempDir, writeGeneratedFile } from '../utils/test-helpers';
import { assertCodeContains, checkTypeScriptCompiles } from '../utils/compile-checker';
import { generateTypes } from '../../../cli/generators/types';
import { generateMockDb } from '../../../cli/generators/mock/db';
import { generatePGliteDb } from '../../../cli/generators/pglite/db';
import { generatePGliteClient } from '../../../cli/generators/pglite/client';
import { schemas as blogSchemas } from '../fixtures/schemas/blog.schema';

describe('Seed Reference Resolution', () => {
  let analyzedSchemas: ReturnType<typeof analyzeTestSchemas>;

  beforeAll(() => {
    analyzedSchemas = analyzeTestSchemas(blogSchemas);
  });

  // =========================================================================
  // Runtime helpers (src/seed/ref.ts)
  // =========================================================================

  describe('ref() helper', () => {
    it('creates a ref marker with default field', () => {
      const marker = ref('users', 0);
      expect(marker).toEqual({
        [SEED_REF_BRAND]: true,
        type: 'ref',
        entity: 'users',
        index: 0,
        field: 'id',
      });
    });

    it('creates a ref marker with custom field', () => {
      const marker = ref('users', 1, 'email');
      expect(marker.field).toBe('email');
      expect(marker.index).toBe(1);
    });

    it('is detected by isSeedReference', () => {
      expect(isSeedReference(ref('users', 0))).toBe(true);
    });
  });

  describe('lookup() helper', () => {
    it('creates a lookup marker with default field', () => {
      const marker = lookup('permissions', { key: 'read:all' });
      expect(marker).toEqual({
        [SEED_REF_BRAND]: true,
        type: 'lookup',
        entity: 'permissions',
        where: { key: 'read:all' },
        field: 'id',
      });
    });

    it('creates a lookup marker with custom field', () => {
      const marker = lookup('users', { role: 'admin' }, 'email');
      expect(marker.field).toBe('email');
      expect(marker.where).toEqual({ role: 'admin' });
    });

    it('is detected by isSeedReference', () => {
      expect(isSeedReference(lookup('users', { role: 'admin' }))).toBe(true);
    });
  });

  describe('isSeedReference()', () => {
    it('returns false for null', () => {
      expect(isSeedReference(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSeedReference(undefined)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isSeedReference('string')).toBe(false);
      expect(isSeedReference(42)).toBe(false);
      expect(isSeedReference(true)).toBe(false);
    });

    it('returns false for plain objects', () => {
      expect(isSeedReference({})).toBe(false);
      expect(isSeedReference({ type: 'ref' })).toBe(false);
    });

    it('returns false for objects with brand set to false', () => {
      expect(isSeedReference({ [SEED_REF_BRAND]: false })).toBe(false);
    });
  });

  // =========================================================================
  // Mock seed generator output
  // =========================================================================

  describe('Mock seed generator', () => {
    it('emits seed reference helpers in generated code', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        "const SEED_REF_BRAND = '__schemock_seed_ref__'",
        'function isSeedReference(value: unknown): boolean',
        'function resolveRef(marker: Record<string, unknown>, createdRecords: Map<string, Record<string, unknown>[]>): unknown',
        'function resolveItem(item: Record<string, unknown>, createdRecords: Map<string, Record<string, unknown>[]>, entityName: string): Record<string, unknown>',
      ]);
    });

    it('emits entityOrder array', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'const entityOrder: string[]',
      ]);

      // Verify entity names are in the array
      expect(code).toContain("'user'");
      expect(code).toContain("'post'");
      expect(code).toContain("'comment'");
    });

    it('uses ordered iteration in runProductionSeed', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'const createdRecords = new Map<string, Record<string, unknown>[]>()',
        'const orderedEntities = [',
        '...entityOrder.filter',
        'for (const entity of orderedEntities)',
      ]);
    });

    it('resolves items and captures created records', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'const resolved = resolveItem(item, createdRecords, entity)',
        'const created = entityDb.create(resolved)',
        'entityRecords.push(created)',
        'createdRecords.set(entity, entityRecords)',
      ]);
    });

    it('emits ref error handling in resolveRef', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'Seed ref error:',
        'Seed lookup error:',
      ]);
    });

    it('still generates types and kill switch utilities', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'export interface SeedResult',
        'export interface ProductionSeedData',
        'export function isSeeded(): boolean',
        'export function resetProductionSeed(): void',
        'export function getSeededAt(): Date | null',
        'export async function runProductionSeed(',
      ]);
    });

    it('maintains backward compatibility with hardcoded IDs', () => {
      const code = generateMockSeed(analyzedSchemas, {});

      // resolveItem should pass through non-reference values unchanged
      assertCodeContains(code, [
        'resolved[key] = value',
      ]);
    });
  });

  // =========================================================================
  // PGlite seed generator output
  // =========================================================================

  describe('PGlite seed generator', () => {
    it('emits seed reference helpers in generated code', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        "const SEED_REF_BRAND = '__schemock_seed_ref__'",
        'function isSeedReference(value: unknown): boolean',
        'function resolveRef(',
        'function resolveItem(',
      ]);
    });

    it('emits entityOrder array', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'const entityOrder: string[]',
      ]);
    });

    it('uses ordered iteration and resolves items', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'const createdRecords = new Map<string, Record<string, unknown>[]>()',
        'for (const entity of orderedEntities)',
        'const resolved = resolveItem(item, createdRecords, entity)',
      ]);
    });

    it('uses RETURNING * to capture created records', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'RETURNING *',
        'entityRecords.push(result.rows[0])',
      ]);
    });

    it('builds SQL from resolved item (not raw item)', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'Object.keys(resolved).map',
        'Object.values(resolved).map',
      ]);
    });

    it('still generates PGlite-specific kill switch utilities', () => {
      const code = generatePGliteSeed(analyzedSchemas, {});

      assertCodeContains(code, [
        'async function ensureMetaTable()',
        'export async function isSeeded(): Promise<boolean>',
        'export async function resetProductionSeed(): Promise<void>',
        'export async function getSeededAt(): Promise<Date | null>',
        '_schemock_meta',
      ]);
    });
  });

  // =========================================================================
  // TypeScript compilation tests
  // =========================================================================

  describe('Generated Code Compilation', () => {
    let tempDir: string;

    beforeAll(async () => {
      tempDir = await createTempDir('seed-ref-compile-');
    });

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    it('mock seed with ref helpers compiles without TypeScript errors', async () => {
      const typesCode = generateTypes(analyzedSchemas);
      const dbCode = generateMockDb(analyzedSchemas, {});
      const seedCode = generateMockSeed(analyzedSchemas, {});

      const typesPath = await writeGeneratedFile(tempDir, 'types.ts', typesCode);
      const dbPath = await writeGeneratedFile(tempDir, 'db.ts', dbCode);
      const seedPath = await writeGeneratedFile(tempDir, 'seed.ts', seedCode);

      const result = await checkTypeScriptCompiles(seedPath, [typesPath, dbPath]);

      if (!result.success) {
        console.error('Mock seed compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('pglite seed with ref helpers compiles without TypeScript errors', async () => {
      const typesCode = generateTypes(analyzedSchemas);
      const dbCode = generatePGliteDb(analyzedSchemas, { persistence: 'memory' });
      const seedCode = generatePGliteSeed(analyzedSchemas, {});

      const typesPath = await writeGeneratedFile(tempDir, 'pglite-types.ts', typesCode);
      const dbPath = await writeGeneratedFile(
        tempDir,
        'pglite-db.ts',
        dbCode.replace("'./types'", "'./pglite-types'")
      );
      const seedPath = await writeGeneratedFile(
        tempDir,
        'pglite-seed.ts',
        seedCode.replace("'./db'", "'./pglite-db'")
      );

      const result = await checkTypeScriptCompiles(seedPath, [typesPath, dbPath]);

      if (!result.success) {
        console.error('PGlite seed compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });

  // =========================================================================
  // Runtime resolution logic (test the emitted code pattern)
  // =========================================================================

  describe('Resolution logic (runtime behavior)', () => {
    // Simulate the same resolution functions that get emitted into generated code
    const BRAND = '__schemock_seed_ref__';

    function isSeedRef(value: unknown): boolean {
      return (
        typeof value === 'object' &&
        value !== null &&
        BRAND in value &&
        (value as Record<string, unknown>)[BRAND] === true
      );
    }

    function resolveRef(
      marker: Record<string, unknown>,
      createdRecords: Map<string, Record<string, unknown>[]>
    ): unknown {
      const entity = marker.entity as string;
      const fieldName = marker.field as string;
      const records = createdRecords.get(entity);

      if (marker.type === 'ref') {
        const index = marker.index as number;
        if (!records || records.length <= index) {
          throw new Error(
            `Seed ref error: entity '${entity}' has ${records?.length ?? 0} records, but ref() requested index ${index}`
          );
        }
        return records[index][fieldName];
      }

      if (marker.type === 'lookup') {
        const where = marker.where as Record<string, unknown>;
        if (!records) {
          throw new Error(
            `Seed lookup error: entity '${entity}' has no records yet.`
          );
        }
        const match = records.find((r) => {
          return Object.entries(where).every(([k, v]) => r[k] === v);
        });
        if (!match) {
          throw new Error(
            `Seed lookup error: no '${entity}' record matches ${JSON.stringify(where)}`
          );
        }
        return match[fieldName];
      }

      throw new Error(`Unknown seed reference type: ${String(marker.type)}`);
    }

    function resolveItem(
      item: Record<string, unknown>,
      createdRecords: Map<string, Record<string, unknown>[]>,
    ): Record<string, unknown> {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (isSeedRef(value)) {
          resolved[key] = resolveRef(value as Record<string, unknown>, createdRecords);
        } else {
          resolved[key] = value;
        }
      }
      return resolved;
    }

    it('resolves ref() markers by index', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('users', [
        { id: 'user-1', email: 'admin@test.com', role: 'admin' },
        { id: 'user-2', email: 'editor@test.com', role: 'user' },
      ]);

      const item = {
        title: 'Welcome',
        authorId: ref('users', 0),
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved).toEqual({
        title: 'Welcome',
        authorId: 'user-1',
      });
    });

    it('resolves ref() with custom field', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('users', [
        { id: 'user-1', email: 'admin@test.com' },
      ]);

      const item = {
        contactEmail: ref('users', 0, 'email'),
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved.contactEmail).toBe('admin@test.com');
    });

    it('resolves lookup() markers by field match', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('permissions', [
        { id: 'perm-1', key: 'read:all', label: 'Read All' },
        { id: 'perm-2', key: 'write:all', label: 'Write All' },
      ]);

      const item = {
        permissionId: lookup('permissions', { key: 'write:all' }),
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved.permissionId).toBe('perm-2');
    });

    it('resolves lookup() with multiple where conditions', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('users', [
        { id: 'u1', role: 'admin', active: true },
        { id: 'u2', role: 'admin', active: false },
        { id: 'u3', role: 'user', active: true },
      ]);

      const item = {
        userId: lookup('users', { role: 'admin', active: true }),
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved.userId).toBe('u1');
    });

    it('passes through non-reference values unchanged', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      const item = {
        id: 'hardcoded-id',
        name: 'Test',
        count: 42,
        active: true,
        tags: null,
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved).toEqual(item);
    });

    it('throws descriptive error for missing entity (ref)', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();

      const item = { authorId: ref('users', 0) };

      expect(() => resolveItem(item, createdRecords)).toThrow(
        "entity 'users' has 0 records"
      );
    });

    it('throws descriptive error for out-of-bounds index (ref)', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('users', [{ id: 'u1' }]);

      const item = { authorId: ref('users', 5) };

      expect(() => resolveItem(item, createdRecords)).toThrow(
        "entity 'users' has 1 records, but ref() requested index 5"
      );
    });

    it('throws descriptive error for missing entity (lookup)', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();

      const item = { permId: lookup('permissions', { key: 'x' }) };

      expect(() => resolveItem(item, createdRecords)).toThrow(
        "entity 'permissions' has no records yet"
      );
    });

    it('throws descriptive error for unmatched lookup', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('permissions', [
        { id: 'p1', key: 'read:all' },
      ]);

      const item = { permId: lookup('permissions', { key: 'nonexistent' }) };

      expect(() => resolveItem(item, createdRecords)).toThrow(
        "no 'permissions' record matches"
      );
    });

    it('handles mixed refs and plain values in one item', () => {
      const createdRecords = new Map<string, Record<string, unknown>[]>();
      createdRecords.set('users', [{ id: 'u1' }]);
      createdRecords.set('categories', [
        { id: 'c1', slug: 'tech' },
        { id: 'c2', slug: 'news' },
      ]);

      const item = {
        title: 'My Post',
        authorId: ref('users', 0),
        categoryId: lookup('categories', { slug: 'news' }),
        published: true,
        views: 0,
      };

      const resolved = resolveItem(item, createdRecords);
      expect(resolved).toEqual({
        title: 'My Post',
        authorId: 'u1',
        categoryId: 'c2',
        published: true,
        views: 0,
      });
    });
  });
});
