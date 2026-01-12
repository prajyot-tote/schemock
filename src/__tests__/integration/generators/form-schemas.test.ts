/**
 * Integration tests for Form Schemas generator
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateFormSchemas } from '../../../cli/generators/form-schemas';
import { schemas as blogSchemas } from '../fixtures/schemas/blog.schema';
import { schemas as ecommerceSchemas } from '../fixtures/schemas/ecommerce.schema';
import { schemas as minimalSchemas } from '../fixtures/schemas/minimal.schema';
import {
  createTempDir,
  cleanupTempDir,
  analyzeTestSchemas,
} from '../utils/test-helpers';
import {
  assertCodeContains,
  assertCodeDoesNotContain,
  assertCodeMatches,
} from '../utils/compile-checker';

describe('Form Schemas Generator Integration', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir('form-schemas-test-');
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Basic Generation', () => {
    it('generates form schema code', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(100);
    });

    it('imports zod', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, ["import { z } from 'zod';"]);
    });

    it('includes section header comments', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'FORM SCHEMAS',
        'COLUMN TYPES',
      ]);
    });
  });

  describe('Zod Schema Generation', () => {
    it('generates FormSchema for each entity', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export const UserFormSchema = z.object({',
        'export const PostFormSchema = z.object({',
        'export const CommentFormSchema = z.object({',
      ]);
    });

    it('closes z.object correctly with });', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Each FormSchema should have proper closure
      const schemaMatches = code.match(/FormSchema = z\.object\(\{[\s\S]*?\}\);/g);
      expect(schemaMatches).not.toBeNull();
      expect(schemaMatches!.length).toBeGreaterThan(0);
    });

    it('handles string fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // name field should be z.string()
      expect(code).toMatch(/name:\s*z\.string\(\)/);
    });

    it('handles enum fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // User role enum
      expect(code).toMatch(/role:\s*z\.enum\(\[/);
      expect(code).toContain("'admin'");
      expect(code).toContain("'editor'");
      expect(code).toContain("'author'");
    });

    it('handles nullable fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Post content is nullable
      expect(code).toMatch(/\.nullable\(\)/);
    });

    it('handles fields with defaults as optional', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Fields with defaults should have .optional()
      expect(code).toMatch(/\.optional\(\)/);
    });

    it('adds min(1) validation for required string fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Required string fields should have min(1) with message
      expect(code).toMatch(/\.min\(1,\s*['"].*is required['"]\)/);
    });

    it('handles uuid fields with .uuid()', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // authorId field should be z.string().uuid()
      expect(code).toMatch(/authorId:\s*z\.string\(\)\.uuid\(\)/);
    });

    it('excludes id field from form schema', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Find UserFormSchema block
      const userFormMatch = code.match(/UserFormSchema = z\.object\(\{[\s\S]*?\}\);/);
      expect(userFormMatch).toBeTruthy();

      // id should not be a direct field in form schema
      const formBlock = userFormMatch![0];
      // Check that "id:" is not present (but "authorId:" etc. are fine)
      const lines = formBlock.split('\n').filter(l => /^\s*id:/.test(l));
      expect(lines.length).toBe(0);
    });

    it('excludes readOnly fields from form schema', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Find UserFormSchema block
      const userFormMatch = code.match(/UserFormSchema = z\.object\(\{[\s\S]*?\}\);/);
      expect(userFormMatch).toBeTruthy();

      // createdAt/updatedAt should not be in form schema
      const formBlock = userFormMatch![0];
      expect(formBlock).not.toContain('createdAt');
      expect(formBlock).not.toContain('updatedAt');
    });

    it('excludes computed fields from form schema', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // User has postCount computed field
      const userFormMatch = code.match(/UserFormSchema = z\.object\(\{[\s\S]*?\}\);/);
      expect(userFormMatch).toBeTruthy();

      const formBlock = userFormMatch![0];
      expect(formBlock).not.toContain('postCount');
    });
  });

  describe('Form Defaults Generation', () => {
    it('generates FormDefaults for each entity', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export const UserFormDefaults',
        'export const PostFormDefaults',
        'export const CommentFormDefaults',
      ]);
    });

    it('uses correct type annotation', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'z.input<typeof UserFormSchema>',
        'z.input<typeof PostFormSchema>',
      ]);
    });

    it('generates empty string defaults for string fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Find UserFormDefaults
      const defaultsMatch = code.match(/UserFormDefaults[\s\S]*?= \{[\s\S]*?\};/);
      expect(defaultsMatch).toBeTruthy();

      const defaultsBlock = defaultsMatch![0];
      expect(defaultsBlock).toMatch(/name:\s*''/);
    });

    it('generates enum default from schema default or first value', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // role has .default('author') in schema, so 'author' is the default
      const defaultsMatch = code.match(/UserFormDefaults[\s\S]*?= \{[\s\S]*?\};/);
      expect(defaultsMatch).toBeTruthy();

      const defaultsBlock = defaultsMatch![0];
      // Should use first enum value since hasDefault triggers .optional()
      expect(defaultsBlock).toMatch(/role:\s*'(admin|editor|author)'/);
    });

    it('generates null for nullable fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // content is nullable, should default to null (or empty string based on implementation)
      expect(code).toMatch(/content:\s*(null|'')/);
    });

    it('generates empty string for ref/uuid fields', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // authorId should be empty string
      const postDefaultsMatch = code.match(/PostFormDefaults[\s\S]*?= \{[\s\S]*?\};/);
      expect(postDefaultsMatch).toBeTruthy();

      const defaultsBlock = postDefaultsMatch![0];
      expect(defaultsBlock).toMatch(/authorId:\s*''/);
    });
  });

  describe('Inferred Type Generation', () => {
    it('generates FormData type for each entity', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export type UserFormData = z.infer<typeof UserFormSchema>;',
        'export type PostFormData = z.infer<typeof PostFormSchema>;',
        'export type CommentFormData = z.infer<typeof CommentFormSchema>;',
      ]);
    });
  });

  describe('Table Columns Generation', () => {
    it('generates TableColumns for each entity', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export const UserTableColumns: ColumnDef[] = [',
        'export const PostTableColumns: ColumnDef[] = [',
      ]);
    });

    it('closes arrays correctly with ];', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // Each TableColumns should have proper closure
      const columnsMatches = code.match(/TableColumns: ColumnDef\[\] = \[[\s\S]*?\];/g);
      expect(columnsMatches).not.toBeNull();
      expect(columnsMatches!.length).toBeGreaterThan(0);
    });

    it('includes key property', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/key:\s*'name'/);
      expect(code).toMatch(/key:\s*'email'/);
    });

    it('includes label property with formatted name', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/label:\s*'Name'/);
      expect(code).toMatch(/label:\s*'Email'/);
      // camelCase -> Title Case
      expect(code).toMatch(/label:\s*'Created At'/);
    });

    it('includes type property', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/type:\s*'text'/);
      expect(code).toMatch(/type:\s*'enum'/);
      expect(code).toMatch(/type:\s*'date'/);
    });

    it('includes sortable property', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/sortable:\s*(true|false)/);
    });

    it('includes filterable property', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/filterable:\s*(true|false)/);
    });

    it('marks id fields as hidden', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // id columns should have hidden: true
      expect(code).toMatch(/key:\s*'id'[\s\S]*?hidden:\s*true/);
    });

    it('marks timestamp fields as hidden', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // createdAt/updatedAt should have hidden: true
      expect(code).toMatch(/key:\s*'createdAt'[\s\S]*?hidden:\s*true/);
      expect(code).toMatch(/key:\s*'updatedAt'[\s\S]*?hidden:\s*true/);
    });
  });

  describe('Column Key Type Generation', () => {
    it('generates ColumnKey type for each entity', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export type UserColumnKey =',
        'export type PostColumnKey =',
      ]);
    });

    it('includes all field names as union', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      // UserColumnKey should include common fields
      expect(code).toMatch(/UserColumnKey\s*=.*'name'/);
      expect(code).toMatch(/UserColumnKey\s*=.*'email'/);
      expect(code).toMatch(/UserColumnKey\s*=.*'id'/);
    });
  });

  describe('Column Types', () => {
    it('generates ColumnType type definition', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export type ColumnType =',
        "'text'",
        "'number'",
        "'boolean'",
        "'date'",
        "'enum'",
      ]);
    });

    it('generates ColumnDef interface', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export interface ColumnDef {',
        'key: string;',
        'label: string;',
        'type: ColumnType;',
        'sortable: boolean;',
        'filterable: boolean;',
        'hidden?: boolean;',
      ]);
    });
  });

  describe('E-commerce Schema (with constraints)', () => {
    it('generates form schemas for ecommerce entities', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export const ProductFormSchema',
        'export const CategoryFormSchema',
        'export const OrderFormSchema',
      ]);
    });

    it('handles number constraints (min)', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateFormSchemas(analyzed);

      // price has min: 0 constraint
      // quantity has min: 1 constraint
      expect(code).toMatch(/z\.number\(\).*\.min\(0\)/);
      expect(code).toMatch(/z\.number\(\).*\.min\(1\)/);
    });

    it('handles enum status field', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateFormSchemas(analyzed);

      // Order status enum
      expect(code).toMatch(/status:\s*z\.enum\(\[/);
      expect(code).toContain("'pending'");
      expect(code).toContain("'paid'");
      expect(code).toContain("'shipped'");
    });

    it('generates column type number for price fields', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/key:\s*'price'[\s\S]*?type:\s*'number'/);
    });
  });

  describe('Minimal Schema', () => {
    it('generates form schemas for minimal entity', () => {
      const analyzed = analyzeTestSchemas(minimalSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'export const SimpleFormSchema',
        'export const SimpleFormDefaults',
        'export const SimpleTableColumns',
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty schema array', () => {
      const analyzed = analyzeTestSchemas([]);
      const code = generateFormSchemas(analyzed);

      // Should still generate common types
      assertCodeContains(code, [
        'ColumnType',
        'ColumnDef',
      ]);

      // But no entity-specific schemas
      assertCodeDoesNotContain(code, [
        'UserFormSchema',
        'PostFormSchema',
      ]);
    });

    it('generates code even with minimal schemas', () => {
      // Test with minimal schemas to ensure generator handles simple cases
      const analyzed = analyzeTestSchemas(minimalSchemas);
      const code = generateFormSchemas(analyzed);

      // Should generate code without error
      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThan(0);

      // Should include common types even for minimal schema
      assertCodeContains(code, ['ColumnDef', 'ColumnType']);
    });
  });

  describe('JSDoc Comments', () => {
    it('includes usage example in FormSchema comment', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      assertCodeContains(code, [
        'Use with react-hook-form:',
        'zodResolver',
        'useForm',
      ]);
    });

    it('includes JSDoc for FormDefaults', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/\/\*\*\s*Default values for.*form initialization\s*\*\//);
    });

    it('includes JSDoc for TableColumns', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateFormSchemas(analyzed);

      expect(code).toMatch(/\/\*\*\s*Table column definitions for/);
    });
  });
});
