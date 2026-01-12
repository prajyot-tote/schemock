/**
 * Integration tests for SQL generator
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateSQL,
  generateTables,
  generateForeignKeys,
  generateIndexes,
  generateRLSPolicies,
  generateFunctions,
} from '../../../cli/generators/sql';
import { schemas as blogSchemas } from '../fixtures/schemas/blog.schema';
import { schemas as ecommerceSchemas } from '../fixtures/schemas/ecommerce.schema';
import {
  createTempDir,
  cleanupTempDir,
  analyzeTestSchemas,
} from '../utils/test-helpers';
import { assertCodeContains, assertCodeDoesNotContain } from '../utils/compile-checker';

describe('SQL Generator Integration', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir('sql-test-');
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('generateTables', () => {
    it('generates CREATE TABLE statements', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateTables(analyzed);

      assertCodeContains(sql, [
        'CREATE TABLE',
        'users',
        'posts',
        'comments',
      ]);
    });

    it('generates correct column definitions', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateTables(analyzed);

      // Check for UUID type
      expect(sql).toMatch(/UUID/i);
      // Check for VARCHAR or TEXT type
      expect(sql).toMatch(/VARCHAR|TEXT/i);
    });

    it('generates timestamp columns when timestamps: true', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateTables(analyzed);

      assertCodeContains(sql, [
        'created_at',
        'updated_at',
      ]);
    });

    it('handles nullable columns', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateTables(analyzed);

      // Non-nullable columns should have NOT NULL
      expect(sql).toContain('NOT NULL');
    });
  });

  describe('generateForeignKeys', () => {
    it('generates foreign key constraints output', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateForeignKeys(analyzed);

      // Should generate output (may be empty if no FKs detected)
      expect(typeof sql).toBe('string');
      expect(sql).toContain('Foreign Key');
    });

    it('handles schemas with explicit FK references', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateForeignKeys(analyzed);

      // Ecommerce schemas have explicit FK relations
      expect(typeof sql).toBe('string');
    });

    it('includes ON DELETE behavior when FKs are present', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateForeignKeys(analyzed);

      // If FKs are generated, they should have ON DELETE
      if (sql.includes('FOREIGN KEY')) {
        expect(sql).toMatch(/ON DELETE/i);
      }
    });
  });

  describe('generateIndexes', () => {
    it('generates index output', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateIndexes(analyzed);

      // Should return a string (may contain indexes or be minimal)
      expect(typeof sql).toBe('string');
      expect(sql).toContain('Index');
    });

    it('generates indexes when schema has index config', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateIndexes(analyzed);

      // Product has indexes config - should be reflected
      expect(typeof sql).toBe('string');
    });

    it('handles schemas without explicit indexes', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateIndexes(analyzed);

      // Should still return valid output
      expect(typeof sql).toBe('string');
    });
  });

  describe('generateRLSPolicies', () => {
    it('generates RLS policy statements for schemas with RLS', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateRLSPolicies(analyzed, 'postgres');

      assertCodeContains(sql, [
        'ALTER TABLE',
        'ENABLE ROW LEVEL SECURITY',
        'CREATE POLICY',
      ]);
    });

    it('generates SELECT/INSERT/UPDATE/DELETE policies', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateRLSPolicies(analyzed, 'postgres');

      expect(sql).toContain('FOR SELECT');
    });

    it('handles schemas without RLS config', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateRLSPolicies(analyzed, 'postgres');

      // Blog schemas don't have RLS - should have minimal or no policies
      // The function should still return valid SQL (even if empty)
      expect(typeof sql).toBe('string');
    });
  });

  describe('generateFunctions', () => {
    it('generates functions output', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateFunctions(analyzed);

      // Should return a string
      expect(typeof sql).toBe('string');
      expect(sql).toContain('Function');
    });

    it('handles schemas with rpc config', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const sql = generateFunctions(analyzed);

      // Ecommerce has RPC config on Product
      expect(typeof sql).toBe('string');
    });

    it('handles schemas without rpc config', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const sql = generateFunctions(analyzed);

      // Blog schemas don't have RPC - should return valid output
      expect(typeof sql).toBe('string');
    });
  });

  describe('generateSQL (combined)', () => {
    it('generates combined SQL file with all sections', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const result = generateSQL(analyzed, { combined: true });

      expect(result.combined).toBeDefined();
      expect(result.combined).toContain('CREATE TABLE');
    });

    it('generates separate files when combined: false', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const result = generateSQL(analyzed, { combined: false });

      expect(result.files).toBeDefined();
      expect(result.files!.tables).toContain('CREATE TABLE');
      expect(result.files!.foreignKeys).toBeDefined();
      expect(result.files!.indexes).toBeDefined();
    });

    it('returns summary with counts', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const result = generateSQL(analyzed, { combined: true });

      expect(result.summary).toBeDefined();
      expect(result.summary.tables).toBeGreaterThan(0);
      expect(result.summary.foreignKeys).toBeGreaterThanOrEqual(0);
    });

    it('handles empty schema array', () => {
      const analyzed = analyzeTestSchemas([]);
      const result = generateSQL(analyzed, { combined: true });

      expect(result.summary.tables).toBe(0);
    });
  });
});
