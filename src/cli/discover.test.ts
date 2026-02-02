/**
 * Tests for Schemock schema discovery
 *
 * @module cli/discover.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { discoverSchemas } from './discover';

// Test fixtures directory
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');
const SCHEMAS_DIR = join(FIXTURES_DIR, 'schemas');
const ENDPOINTS_DIR = join(FIXTURES_DIR, 'endpoints');
const MIDDLEWARE_DIR = join(FIXTURES_DIR, 'middleware');

describe('discoverSchemas', () => {
  beforeAll(async () => {
    await mkdir(SCHEMAS_DIR, { recursive: true });
    await mkdir(ENDPOINTS_DIR, { recursive: true });
    await mkdir(MIDDLEWARE_DIR, { recursive: true });

    // Create test schema files
    await writeFile(
      join(SCHEMAS_DIR, 'user.ts'),
      `
        export const userSchema = {
          name: 'user',
          fields: {
            id: { type: 'uuid' },
            name: { type: 'string' },
          },
        };
      `
    );

    await writeFile(
      join(SCHEMAS_DIR, 'post.ts'),
      `
        export const postSchema = {
          name: 'post',
          fields: {
            id: { type: 'uuid' },
            title: { type: 'string' },
          },
        };
      `
    );

    // Create test endpoint file
    await writeFile(
      join(ENDPOINTS_DIR, 'search.ts'),
      `
        export const searchEndpoint = {
          path: '/api/search',
          method: 'GET',
          params: {},
          body: {},
          response: {},
          mockResolver: () => ({ results: [] }),
          _endpoint: true as const,
        };
      `
    );

    // Create test middleware file
    await writeFile(
      join(MIDDLEWARE_DIR, 'tenant.ts'),
      `
        export const tenantMiddleware = {
          name: 'tenant',
          config: {},
          handler: async () => {},
          order: 'early' as const,
          _middleware: true as const,
        };
      `
    );

    await writeFile(
      join(MIDDLEWARE_DIR, 'auth.ts'),
      `
        export const authMiddleware = {
          name: 'auth',
          config: {},
          handler: async () => {},
          order: 'early' as const,
          _middleware: true as const,
        };
      `
    );
  });

  afterAll(async () => {
    await rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe('schema discovery', () => {
    it('should discover schemas from glob pattern', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`);

      expect(result.schemas).toHaveLength(2);
      expect(result.schemas.map((s) => s.name)).toContain('user');
      expect(result.schemas.map((s) => s.name)).toContain('post');
    });

    it('should discover schemas from direct file path', async () => {
      const result = await discoverSchemas(join(SCHEMAS_DIR, 'user.ts'));

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0].name).toBe('user');
    });
  });

  describe('endpoint discovery', () => {
    it('should discover endpoints from endpointsGlob option', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        endpointsGlob: `${ENDPOINTS_DIR}/**/*.ts`,
      });

      expect(result.schemas).toHaveLength(2);
      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0].path).toBe('/api/search');
    });

    it('should track endpoint source files', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        endpointsGlob: `${ENDPOINTS_DIR}/**/*.ts`,
      });

      expect(result.endpointFiles?.get('/api/search')).toContain('search.ts');
    });
  });

  describe('middleware discovery', () => {
    it('should discover middleware from middlewareGlob option', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        middlewareGlob: `${MIDDLEWARE_DIR}/**/*.ts`,
      });

      expect(result.middleware).toHaveLength(2);
      expect(result.middleware.map((m) => m.name)).toContain('tenant');
      expect(result.middleware.map((m) => m.name)).toContain('auth');
    });

    it('should track middleware source files', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        middlewareGlob: `${MIDDLEWARE_DIR}/**/*.ts`,
      });

      expect(result.middlewareFiles?.get('tenant')).toContain('tenant.ts');
      expect(result.middlewareFiles?.get('auth')).toContain('auth.ts');
    });

    it('should deduplicate middleware by name', async () => {
      // Add a duplicate middleware file
      await writeFile(
        join(MIDDLEWARE_DIR, 'tenant-copy.ts'),
        `
          export const tenantMiddleware = {
            name: 'tenant',  // Same name as original
            config: {},
            handler: async () => {},
            order: 'early' as const,
            _middleware: true as const,
          };
        `
      );

      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        middlewareGlob: `${MIDDLEWARE_DIR}/**/*.ts`,
      });

      // Should only have 2 unique middleware (tenant + auth)
      const tenantMiddleware = result.middleware.filter((m) => m.name === 'tenant');
      expect(tenantMiddleware).toHaveLength(1);
    });
  });

  describe('combined discovery', () => {
    it('should discover schemas, endpoints, and middleware together', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        endpointsGlob: `${ENDPOINTS_DIR}/**/*.ts`,
        middlewareGlob: `${MIDDLEWARE_DIR}/**/*.ts`,
      });

      expect(result.schemas.length).toBeGreaterThan(0);
      expect(result.endpoints.length).toBeGreaterThan(0);
      expect(result.middleware.length).toBeGreaterThan(0);
    });

    it('should include all file paths in files array', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        endpointsGlob: `${ENDPOINTS_DIR}/**/*.ts`,
        middlewareGlob: `${MIDDLEWARE_DIR}/**/*.ts`,
      });

      // files array should include schema files, endpoint files, and middleware files
      expect(result.files.some((f) => f.includes('user.ts'))).toBe(true);
      expect(result.files.some((f) => f.includes('search.ts'))).toBe(true);
      // Middleware files should be included in the files array
      // Could be tenant.ts or auth.ts depending on order
      expect(result.files.some((f) => f.includes('middleware/'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent middleware glob gracefully', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        middlewareGlob: `${FIXTURES_DIR}/nonexistent/**/*.ts`,
      });

      // Should still return schemas but no middleware
      expect(result.schemas.length).toBeGreaterThan(0);
      expect(result.middleware).toHaveLength(0);
    });

    it('should handle non-existent endpoints glob gracefully', async () => {
      const result = await discoverSchemas(`${SCHEMAS_DIR}/**/*.ts`, {
        endpointsGlob: `${FIXTURES_DIR}/nonexistent/**/*.ts`,
      });

      // Should still return schemas but no endpoints
      expect(result.schemas.length).toBeGreaterThan(0);
      expect(result.endpoints).toHaveLength(0);
    });
  });
});
