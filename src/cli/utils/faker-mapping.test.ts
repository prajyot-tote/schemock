/**
 * Unit tests for fieldToFakerCall() — verifying that field type
 * takes precedence over field name pattern matching.
 *
 * Regression test for: field.number() named "tokenLimit" was generating
 * faker.string.alphanumeric(32) instead of faker.number.int() because
 * the /token|key|secret/i name pattern matched before the type check.
 */

import { describe, it, expect } from 'vitest';
import { fieldToFakerCall } from './faker-mapping';
import type { FieldDefinition } from '../../schema/types';
import type { SchemockConfig } from '../types';

const defaultConfig: SchemockConfig = {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',
  apiPrefix: '/api',
};

/**
 * Helper to build a FieldDefinition matching what field.number() produces.
 */
function numberField(opts?: { min?: number; max?: number }): FieldDefinition {
  const constraints: Record<string, number> = {};
  if (opts?.min !== undefined) constraints.min = opts.min;
  if (opts?.max !== undefined) constraints.max = opts.max;
  return {
    type: 'number',
    hint: 'number.int',
    ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
  };
}

/**
 * Helper to build a FieldDefinition matching what field.string() produces.
 */
function stringField(): FieldDefinition {
  return { type: 'string' };
}

describe('fieldToFakerCall', () => {
  describe('type precedence over name pattern (regression)', () => {
    it('field.number() named "tokenLimit" → faker.number, not faker.string', () => {
      const result = fieldToFakerCall('tokenLimit', numberField(), defaultConfig);
      expect(result).toMatch(/faker\.number/);
      expect(result).not.toMatch(/faker\.string\.alphanumeric/);
    });

    it('field.number() named "secretCode" → faker.number, not faker.string', () => {
      const result = fieldToFakerCall('secretCode', numberField(), defaultConfig);
      expect(result).toMatch(/faker\.number/);
      expect(result).not.toMatch(/faker\.string\.alphanumeric/);
    });

    it('field.number() named "apiKeyCount" → faker.number, not faker.string', () => {
      const result = fieldToFakerCall('apiKeyCount', numberField(), defaultConfig);
      expect(result).toMatch(/faker\.number/);
      expect(result).not.toMatch(/faker\.string\.alphanumeric/);
    });
  });

  describe('string fields still match name patterns', () => {
    it('field.string() named "tokenName" → faker.string.alphanumeric (name pattern valid for strings)', () => {
      const result = fieldToFakerCall('tokenName', stringField(), defaultConfig);
      expect(result).toMatch(/faker\.string\.alphanumeric/);
    });

    it('field.string() named "secretKey" → faker.string.alphanumeric', () => {
      const result = fieldToFakerCall('secretKey', stringField(), defaultConfig);
      expect(result).toMatch(/faker\.string\.alphanumeric/);
    });
  });

  describe('number constraints are preserved', () => {
    it('field.number({ min: 1000, max: 9999 }) named "secretCode" → includes constraints', () => {
      const result = fieldToFakerCall('secretCode', numberField({ min: 1000, max: 9999 }), defaultConfig);
      expect(result).toMatch(/faker\.number\.int/);
      expect(result).toContain('1000');
      expect(result).toContain('9999');
    });

    it('field.number({ min: 0, max: 100 }) named "tokenLimit" → includes constraints', () => {
      const result = fieldToFakerCall('tokenLimit', numberField({ min: 0, max: 100 }), defaultConfig);
      expect(result).toMatch(/faker\.number\.int/);
      expect(result).toContain('min: 0');
      expect(result).toContain('max: 100');
    });
  });

  describe('standard name patterns still work for matching types', () => {
    it('field.string() named "email" → faker.internet.email', () => {
      const result = fieldToFakerCall('email', stringField(), defaultConfig);
      expect(result).toBe('faker.internet.email()');
    });

    it('field.string() named "title" → faker.lorem.sentence', () => {
      const result = fieldToFakerCall('title', stringField(), defaultConfig);
      expect(result).toMatch(/faker\.lorem\.sentence/);
    });
  });
});
