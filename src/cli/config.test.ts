/**
 * Tests for Schemock configuration loading and validation
 *
 * @module cli/config.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from './config';

// Test fixtures directory
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');
const CONFIG_DIR = join(FIXTURES_DIR, 'configs');

describe('config validation', () => {
  beforeAll(async () => {
    await mkdir(CONFIG_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(CONFIG_DIR, { recursive: true, force: true });
  });

  describe('backend.services config', () => {
    it('should accept valid backend.services config', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            services: {
              output: './src/generated/services',
              dbImport: '@/lib/db',
            },
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-services.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.backend?.services?.output).toBe('./src/generated/services');
      expect(config.backend?.services?.dbImport).toBe('@/lib/db');
    });

    it('should require dbImport in services config', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            services: {
              output: './src/generated/services',
              // missing dbImport
            },
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'invalid-services-no-db.cjs');
      await writeFile(configPath, configContent);

      await expect(loadConfig(configPath)).rejects.toThrow('dbImport');
    });
  });

  describe('backend.routes config', () => {
    it('should accept valid backend.routes config', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            routes: {
              output: './app/api',
              overwrite: true,
              skip: ['DELETE /api/users/:id'],
              skipEntities: ['payment'],
            },
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-routes.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.backend?.routes?.output).toBe('./app/api');
      expect(config.backend?.routes?.overwrite).toBe(true);
      expect(config.backend?.routes?.skip).toContain('DELETE /api/users/:id');
      expect(config.backend?.routes?.skipEntities).toContain('payment');
    });

    it('should validate skip format', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            routes: {
              output: './app/api',
              skip: ['invalid-format'],  // Should be 'METHOD /path'
            },
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'invalid-routes-skip.cjs');
      await writeFile(configPath, configContent);

      await expect(loadConfig(configPath)).rejects.toThrow('METHOD /path');
    });

    it('should accept valid skip formats', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            routes: {
              output: './app/api',
              skip: [
                'GET /api/users',
                'POST /api/users',
                'PUT /api/users/:id',
                'PATCH /api/users/:id',
                'DELETE /api/users/:id',
              ],
            },
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-routes-skip.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.backend?.routes?.skip).toHaveLength(5);
    });
  });

  describe('middlewareImport config', () => {
    it('should accept middlewareImport path', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            middlewareImport: '@/middleware',
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-middleware-import.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.backend?.middlewareImport).toBe('@/middleware');
    });
  });

  describe('root config fields', () => {
    it('should accept endpoints glob pattern', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          endpoints: './src/endpoints/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-endpoints.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.endpoints).toBe('./src/endpoints/**/*.ts');
    });

    it('should accept middlewareGlob pattern', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          middlewareGlob: './src/middleware/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
        };
      `;

      const configPath = join(CONFIG_DIR, 'valid-middleware-glob.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.middlewareGlob).toBe('./src/middleware/**/*.ts');
    });
  });

  describe('complete backend config', () => {
    it('should accept full backend configuration', async () => {
      const configContent = `
        module.exports = {
          schemas: './src/schemas/**/*.ts',
          endpoints: './src/endpoints/**/*.ts',
          middlewareGlob: './src/middleware/**/*.ts',
          output: './src/generated',
          adapter: 'mock',
          apiPrefix: '/api',
          backend: {
            framework: 'nextjs',
            output: './src/generated/api',
            database: {
              type: 'supabase',
              connectionEnvVar: 'SUPABASE_URL',
            },
            services: {
              output: './src/generated/services',
              dbImport: '@/lib/db',
            },
            routes: {
              output: './app/api',
              overwrite: false,
              skip: ['DELETE /api/users/:id'],
              skipEntities: ['payment', 'audit'],
            },
            middlewareImport: '@/middleware',
          },
        };
      `;

      const configPath = join(CONFIG_DIR, 'full-backend.cjs');
      await writeFile(configPath, configContent);

      const config = await loadConfig(configPath);
      expect(config.backend?.framework).toBe('nextjs');
      expect(config.backend?.database?.type).toBe('supabase');
      expect(config.backend?.services?.dbImport).toBe('@/lib/db');
      expect(config.backend?.routes?.skipEntities).toContain('payment');
      expect(config.backend?.middlewareImport).toBe('@/middleware');
    });
  });
});
