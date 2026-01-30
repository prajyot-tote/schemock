/**
 * Integration tests for TypeScript types generator
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateTypes } from '../../../cli/generators/types';
import { schemas as blogSchemas } from '../fixtures/schemas/blog.schema';
import { schemas as ecommerceSchemas } from '../fixtures/schemas/ecommerce.schema';
import { schemas as minimalSchemas } from '../fixtures/schemas/minimal.schema';
import {
  createTempDir,
  cleanupTempDir,
  writeGeneratedFile,
  analyzeTestSchemas,
} from '../utils/test-helpers';
import {
  checkTypeScriptCompiles,
  assertCodeContains,
  assertCodeDoesNotContain,
} from '../utils/compile-checker';

describe('Types Generator Integration', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir('types-test-');
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Blog Schema', () => {
    it('generates TypeScript types code', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      // Verify it's valid TypeScript-like output
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(100);
    });

    it('generates entity interfaces', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'export interface User {',
        'export interface Post {',
        'export interface Comment {',
        // userProfile -> Userprofile in pascal case
        'export interface Userprofile {',
      ]);
    });

    it('generates Create and Update types', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'export interface UserCreate {',
        'export interface UserUpdate {',
        'export interface PostCreate {',
        'export interface PostUpdate {',
      ]);
    });

    it('generates Filter types', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'export interface UserFilter {',
        'export interface PostFilter {',
      ]);
    });

    it('generates Include types for relations', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      // Check that Include types exist (exact format may vary)
      expect(code).toMatch(/UserInclude/);
      expect(code).toMatch(/PostInclude/);
    });

    it('generates With-Relation types', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'UserWithPosts',
        'PostWithAuthor',
      ]);
    });

    it('excludes id from Create types', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      // Find UserCreate block and verify structure
      const userCreateMatch = code.match(/export interface UserCreate \{[\s\S]*?\n\}/);
      expect(userCreateMatch).toBeTruthy();

      // id should not be in Create types
      const createBlock = userCreateMatch![0];
      // Check that "id:" is not a field in the Create interface
      const lines = createBlock.split('\n').filter(l => l.trim().startsWith('id'));
      // Filter out things like "userId" - only match standalone "id"
      const idFieldLines = lines.filter(l => /^\s*id[?]?:/.test(l));
      expect(idFieldLines.length).toBe(0);
    });

    it('excludes readOnly fields from Create types', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      // createdAt/updatedAt should not appear in Create types (they're readOnly timestamps)
      const userCreateMatch = code.match(/export interface UserCreate \{[\s\S]*?\n\}/);
      expect(userCreateMatch).toBeTruthy();

      const createBlock = userCreateMatch![0];
      expect(createBlock).not.toContain('createdAt');
      expect(createBlock).not.toContain('updatedAt');
    });
  });

  describe('E-commerce Schema (with RLS)', () => {
    it('generates TypeScript types code', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateTypes(analyzed);

      // Verify it's valid TypeScript-like output
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(100);
    });

    it('handles enum types correctly', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateTypes(analyzed);

      // Order status should be a union type
      expect(code).toMatch(/'pending'|"pending"/);
      expect(code).toMatch(/'paid'|"paid"/);
      expect(code).toMatch(/'shipped'|"shipped"/);
    });

    it('handles nullable fields', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateTypes(analyzed);

      // categoryId is nullable - should have optional marker AND | null union
      expect(code).toContain('categoryId?:');

      // Verify | null is generated for nullable fields in all interfaces
      // Main entity interface
      expect(code).toMatch(/interface Product \{[\s\S]*?categoryId\?: string \| null/);
      // Create interface
      expect(code).toMatch(/interface ProductCreate \{[\s\S]*?categoryId\?: string \| null/);
      // Update interface
      expect(code).toMatch(/interface ProductUpdate \{[\s\S]*?categoryId\?: string \| null/);
    });

    it('generates interfaces for all entities', () => {
      const analyzed = analyzeTestSchemas(ecommerceSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'export interface Product {',
        'export interface Category {',
        'export interface Order {',
        // orderItem -> Orderitem in pascal case
        'export interface Orderitem {',
      ]);
    });
  });

  describe('Minimal Schema', () => {
    it('generates types without timestamps', () => {
      const analyzed = analyzeTestSchemas(minimalSchemas);
      const code = generateTypes(analyzed);

      assertCodeContains(code, [
        'export interface Simple {',
      ]);

      // Extract Simple interface and check it doesn't have timestamps
      const simpleMatch = code.match(/export interface Simple \{[\s\S]*?\n\}/);
      expect(simpleMatch).toBeTruthy();
      const simpleBlock = simpleMatch![0];
      expect(simpleBlock).not.toContain('createdAt');
      expect(simpleBlock).not.toContain('updatedAt');
    });

    it('generates TypeScript code for minimal schema', () => {
      const analyzed = analyzeTestSchemas(minimalSchemas);
      const code = generateTypes(analyzed);

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code).toContain('Simple');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty schema array', () => {
      const analyzed = analyzeTestSchemas([]);
      const code = generateTypes(analyzed);

      // Should still generate common types
      assertCodeContains(code, [
        'FieldFilter',
        'QueryOptions',
        'ListResponse',
      ]);
    });

    it('includes GENERATED BY header', () => {
      const analyzed = analyzeTestSchemas(blogSchemas);
      const code = generateTypes(analyzed);

      expect(code).toContain('GENERATED BY SCHEMOCK');
    });
  });
});
