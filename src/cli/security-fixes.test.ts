/**
 * Tests for critical security fixes
 *
 * These tests verify that SQL injection and other security vulnerabilities
 * have been properly fixed in the code generation pipeline.
 */

import { describe, it, expect } from 'vitest';
import { escapeSqlString } from './generators/sql/pg-types';

describe('SQL Injection Prevention', () => {
  describe('escapeSqlString', () => {
    it('should escape single quotes by doubling them', () => {
      expect(escapeSqlString("admin")).toBe("admin");
      expect(escapeSqlString("it's")).toBe("it''s");
      expect(escapeSqlString("don't")).toBe("don''t");
    });

    it('should handle multiple quotes', () => {
      expect(escapeSqlString("'test'")).toBe("''test''");
      expect(escapeSqlString("'''")).toBe("''''''");
    });

    it('should prevent SQL injection attempts', () => {
      const malicious = "admin'; DROP TABLE users; --";
      const escaped = escapeSqlString(malicious);
      expect(escaped).toBe("admin''; DROP TABLE users; --");
      // The escaped version is safe because the single quote is doubled
      // and won't terminate the SQL string literal
    });

    it('should handle empty strings', () => {
      expect(escapeSqlString("")).toBe("");
    });

    it('should handle strings without quotes', () => {
      expect(escapeSqlString("normal string")).toBe("normal string");
      expect(escapeSqlString("123")).toBe("123");
    });

    it('should handle Unicode characters', () => {
      expect(escapeSqlString("café")).toBe("café");
      expect(escapeSqlString("日本語")).toBe("日本語");
      expect(escapeSqlString("emoji 🎉")).toBe("emoji 🎉");
    });

    it('should handle newlines and special characters', () => {
      expect(escapeSqlString("line1\nline2")).toBe("line1\nline2");
      expect(escapeSqlString("tab\there")).toBe("tab\there");
    });
  });
});

describe('JavaScript String Escaping', () => {
  // Import the escapeJsString function - it's internal but we can test via faker-mapping
  // For now, we'll test the output format

  it('should properly escape enum values in generated faker code', async () => {
    const { fieldToFakerCall } = await import('./utils/faker-mapping');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    // Test enum with quote in value
    const field = {
      type: 'enum',
      values: ["it's", "don't", "normal"] as readonly string[],
    };

    const result = fieldToFakerCall('status', field, config);

    // Should have properly escaped quotes
    expect(result).toContain("it\\'s");
    expect(result).toContain("don\\'t");
    expect(result).toContain("'normal'");
    expect(result).toBe("faker.helpers.arrayElement(['it\\'s', 'don\\'t', 'normal'])");
  });

  it('should escape backslashes in enum values', async () => {
    const { fieldToFakerCall } = await import('./utils/faker-mapping');
    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };

    const field = {
      type: 'enum',
      values: ["path\\to\\file", "normal"] as readonly string[],
    };

    const result = fieldToFakerCall('path', field, config);

    // Backslashes should be escaped
    expect(result).toContain("path\\\\to\\\\file");
  });
});

describe('RLS SQL Generation Security', () => {
  it('should escape bypass values in generated RLS policies', async () => {
    const { generateRLSPolicies } = await import('./generators/sql/rls');
    const { analyzeSchemas } = await import('./analyze');

    // Create a schema with malicious bypass value
    const schemas = [{
      name: 'post',
      fields: {
        id: { type: 'uuid' },
        title: { type: 'string' },
        authorId: { type: 'ref', target: 'user' },
      },
      rls: {
        scope: [{ field: 'authorId', contextKey: 'userId' }],
        bypass: [{ contextKey: 'role', values: ["admin'; DROP TABLE posts; --", 'superuser'] }],
      },
    }];

    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };
    const analyzed = analyzeSchemas(schemas as any, config);

    const sql = generateRLSPolicies(analyzed);

    // The malicious value should be escaped
    expect(sql).toContain("admin''; DROP TABLE posts; --");
    // Should NOT contain unescaped version that would break SQL
    expect(sql).not.toContain("('admin'; DROP TABLE posts; --')");
  });

  it('should escape context keys in RLS policies', async () => {
    const { generateRLSPolicies } = await import('./generators/sql/rls');
    const { analyzeSchemas } = await import('./analyze');

    // Create a schema with special characters in context key
    const schemas = [{
      name: 'post',
      fields: {
        id: { type: 'uuid' },
        tenantId: { type: 'ref', target: 'tenant' },
      },
      rls: {
        scope: [{ field: 'tenantId', contextKey: "tenant'Id" }],
      },
    }];

    const config = { schemas: '', output: '', adapter: 'mock' as const, apiPrefix: '/api' };
    const analyzed = analyzeSchemas(schemas as any, config);

    const sql = generateRLSPolicies(analyzed);

    // The context key should be escaped
    expect(sql).toContain("tenant''Id");
  });
});

describe('Config Loading Security', () => {
  it('should not use shell interpolation for file paths', async () => {
    // We can't easily test shell injection prevention without actually creating
    // malicious files, but we can verify the code structure is safe
    const configSource = await import('fs').then(fs =>
      fs.readFileSync('./src/cli/config.ts', 'utf-8')
    );

    // Should NOT use execSync with template literals containing file paths
    expect(configSource).not.toMatch(/execSync\s*\(\s*`[^`]*\$\{.*fullPath.*\}/);

    // Should use spawnSync instead
    expect(configSource).toContain('spawnSync');

    // Should have shell: false to prevent shell injection
    expect(configSource).toContain('shell: false');
  });
});

describe('RLS Context - Interceptor Pattern', () => {
  it('should generate production-ready interceptor infrastructure', async () => {
    const { generateRLSContextType, getRLSImports } = await import('./generators/shared/rls');
    const { CodeBuilder } = await import('./utils/code-builder');

    const code = new CodeBuilder();
    generateRLSContextType(code);
    const generated = code.toString();

    // Should NOT use global state or Node.js-only features
    expect(generated).not.toContain('AsyncLocalStorage');
    expect(generated).not.toContain('async_hooks');

    // Should provide ClientConfig interface for interceptors
    expect(generated).toContain('interface ClientConfig');
    expect(generated).toContain('onRequest');
    expect(generated).toContain('onError');

    // Should provide RequestContext interface
    expect(generated).toContain('interface RequestContext');
    expect(generated).toContain('headers: Record<string, string>');
    expect(generated).toContain('operation: string');

    // Should provide ApiError class with status codes
    expect(generated).toContain('class ApiError');
    expect(generated).toContain('status: number');
    expect(generated).toContain('code: string');

    // Should have context extraction from headers
    expect(generated).toContain('extractContextFromHeaders');
    expect(generated).toContain('decodeJwtPayload');

    // getRLSImports should return empty string (no Node.js-only imports)
    const imports = getRLSImports();
    expect(imports).toBe('');
  });

  it('should extract context from Authorization header param', async () => {
    const { generateRLSContextType } = await import('./generators/shared/rls');
    const { CodeBuilder } = await import('./utils/code-builder');

    const code = new CodeBuilder();
    generateRLSContextType(code);
    const generated = code.toString();

    // extractContextFromHeaders should accept headers as parameter (not read from global)
    expect(generated).toContain('extractContextFromHeaders(headers: Record<string, string>)');
    expect(generated).toContain('Authorization');
    expect(generated).toContain('Bearer ');
    expect(generated).toContain('decodeJwtPayload(token)');
  });
});
