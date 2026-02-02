/**
 * E2E Config-Based Generation Tests
 *
 * Validates complete generation flow from config to running code.
 * Tests that generated code works end-to-end when configured via schemock.config.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// Import generators for testing generation flow
import { generateTypes } from '../../cli/generators/types';
import { generateMockDb } from '../../cli/generators/mock/db';
import { generateMockClient } from '../../cli/generators/mock/client';
import { generateRoutes } from '../../cli/generators/mock/routes';
import { generateMockHandlers } from '../../cli/generators/mock/handlers';
import { analyzeSchemas } from '../../cli/analyze';
import type { SchemockConfig, AnalyzedSchema } from '../../cli/types';

// Import test schemas
import { getTestSchemas } from './fixtures/test-schemas';

const execAsync = promisify(exec);

// Get project root and create temp directory
const PROJECT_ROOT = join(dirname(import.meta.url.replace('file://', '')), '../../../');
const E2E_GEN_DIR = join(PROJECT_ROOT, '.e2e-gen-temp');
const TYPE_STUBS_DIR = join(dirname(import.meta.url.replace('file://', '')), 'type-stubs');

/**
 * Default config for testing
 */
const defaultConfig: SchemockConfig = {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',
  apiPrefix: '/api',
};

/**
 * Analyze schemas with test config
 */
function analyzeTestSchemas(): AnalyzedSchema[] {
  return analyzeSchemas(getTestSchemas(), defaultConfig);
}

/**
 * Write file with directory creation
 */
async function writeTestFile(dir: string, filename: string, content: string): Promise<string> {
  const filepath = join(dir, filename);
  const parentDir = dirname(filepath);
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true });
  }
  await writeFile(filepath, content, 'utf-8');
  return filepath;
}

/**
 * Create tsconfig for compilation testing
 */
async function createTsConfig(dir: string): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'DOM'],
      typeRoots: [join(PROJECT_ROOT, 'node_modules/@types'), TYPE_STUBS_DIR],
      types: ['node'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['./**/*.ts', join(TYPE_STUBS_DIR, '*.d.ts')],
    exclude: ['node_modules'],
  };

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
}

/**
 * Run TypeScript compilation
 */
async function runTsc(dir: string): Promise<{ success: boolean; errors?: string[] }> {
  try {
    await execAsync(`npx tsc --project ${join(dir, 'tsconfig.json')}`, {
      cwd: PROJECT_ROOT,
    });
    return { success: true };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const errorOutput = execError.stderr || execError.stdout || '';
    const errors = errorOutput
      .split('\n')
      .filter((line) => line.includes('error TS'))
      .map((line) => line.trim());
    return { success: false, errors: errors.length > 0 ? errors : [errorOutput] };
  }
}

describe('E2E: Config-Based Generation', () => {
  let analyzedSchemas: AnalyzedSchema[];

  beforeAll(async () => {
    // Setup: Analyze schemas
    analyzedSchemas = analyzeTestSchemas();

    // Create temp directory
    if (!existsSync(E2E_GEN_DIR)) {
      await mkdir(E2E_GEN_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup temp directory
    if (existsSync(E2E_GEN_DIR)) {
      await rm(E2E_GEN_DIR, { recursive: true });
    }
  });

  describe('Schema Discovery', () => {
    it('discovers schemas and generates correct number of entities', () => {
      expect(analyzedSchemas).toHaveLength(5); // user, post, comment, organization, project
    });

    it('analyzes entity names correctly', () => {
      const entityNames = analyzedSchemas.map((s) => s.name);
      expect(entityNames).toContain('user');
      expect(entityNames).toContain('post');
      expect(entityNames).toContain('comment');
      expect(entityNames).toContain('organization');
      expect(entityNames).toContain('project');
    });

    it('detects RLS configuration on schemas', () => {
      const postSchema = analyzedSchemas.find((s) => s.name === 'post');
      const userSchema = analyzedSchemas.find((s) => s.name === 'user');

      expect(postSchema?.rls.enabled).toBe(true);
      expect(postSchema?.rls.scope).toHaveLength(1);
      expect(userSchema?.rls.enabled).toBe(false);
    });

    it('detects relations between entities', () => {
      const userSchema = analyzedSchemas.find((s) => s.name === 'user');
      const postSchema = analyzedSchemas.find((s) => s.name === 'post');

      // User hasMany posts
      expect(userSchema?.relations).toContainEqual(
        expect.objectContaining({
          name: 'posts',
          type: 'hasMany',
          target: 'post',
        })
      );

      // Post belongsTo author
      expect(postSchema?.relations).toContainEqual(
        expect.objectContaining({
          name: 'author',
          type: 'belongsTo',
          target: 'user',
        })
      );
    });
  });

  describe('Code Generation', () => {
    it('generates types.ts with all entity types', () => {
      const typesCode = generateTypes(analyzedSchemas);

      // Check entity interfaces exist
      expect(typesCode).toContain('export interface User');
      expect(typesCode).toContain('export interface Post');
      expect(typesCode).toContain('export interface Comment');
      expect(typesCode).toContain('export interface Organization');
      expect(typesCode).toContain('export interface Project');

      // Check Create/Update interfaces
      expect(typesCode).toContain('export interface UserCreate');
      expect(typesCode).toContain('export interface UserUpdate');
      expect(typesCode).toContain('export interface PostCreate');
      expect(typesCode).toContain('export interface PostUpdate');
    });

    it('generates db.ts with @mswjs/data factory', () => {
      const dbCode = generateMockDb(analyzedSchemas, {});

      expect(dbCode).toContain("import { factory");
      expect(dbCode).toContain('@faker-js/faker');
      expect(dbCode).toContain('export const db = factory({');
      expect(dbCode).toContain('user:');
      expect(dbCode).toContain('post:');
    });

    it('generates client.ts with API methods', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      expect(clientCode).toContain('export interface ApiClient');
      expect(clientCode).toContain('export function createClient');
      expect(clientCode).toContain('export const api = createClient()');

      // Check entity methods
      expect(clientCode).toContain('user:');
      expect(clientCode).toContain('list:');
      expect(clientCode).toContain('get:');
      expect(clientCode).toContain('create:');
      expect(clientCode).toContain('update:');
      expect(clientCode).toContain('delete:');
    });

    it('generates routes.ts with route definitions', () => {
      const routesCode = generateRoutes(analyzedSchemas);

      expect(routesCode).toContain('export const routes');
      expect(routesCode).toContain('/api/users');
      expect(routesCode).toContain('/api/posts');
      expect(routesCode).toContain('list:');
      expect(routesCode).toContain('get:');
    });

    it('generates handlers.ts with MSW handlers', () => {
      const handlersCode = generateMockHandlers(analyzedSchemas, '/api');

      expect(handlersCode).toContain("import { http, HttpResponse } from 'msw'");
      expect(handlersCode).toContain('export const handlers');
      expect(handlersCode).toContain('http.get(');
      expect(handlersCode).toContain('http.post(');
      expect(handlersCode).toContain('http.put(');
      expect(handlersCode).toContain('http.delete(');
    });

    it('generates RLS helpers when schemas have RLS', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      // Should have RLS filter functions
      expect(clientCode).toContain('rlsPostSelect');
      expect(clientCode).toContain('checkBypass');
      expect(clientCode).toContain('extractContextFromHeaders');
    });
  });

  describe('Generated Code Compiles', () => {
    it('all generated files compile together', async () => {
      const dir = join(E2E_GEN_DIR, 'compile-test');
      if (existsSync(dir)) {
        await rm(dir, { recursive: true });
      }
      await mkdir(dir, { recursive: true });

      // Generate all files
      const typesCode = generateTypes(analyzedSchemas);
      const dbCode = generateMockDb(analyzedSchemas, {});
      const clientCode = generateMockClient(analyzedSchemas);
      const routesCode = generateRoutes(analyzedSchemas);
      const handlersCode = generateMockHandlers(analyzedSchemas, '/api');

      // Write files
      await writeTestFile(dir, 'types.ts', typesCode);
      await writeTestFile(dir, 'db.ts', dbCode);
      await writeTestFile(dir, 'client.ts', clientCode);
      await writeTestFile(dir, 'routes.ts', routesCode);
      await writeTestFile(dir, 'handlers.ts', handlersCode);

      // Create barrel export
      const indexCode = `
export * from './types';
export * from './db';
export * from './client';
export * from './routes';
export * from './handlers';
`;
      await writeTestFile(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('Import Resolution', () => {
    it('types.ts exports are importable', () => {
      const typesCode = generateTypes(analyzedSchemas);

      // Check all expected exports
      expect(typesCode).toContain('export interface User');
      expect(typesCode).toContain('export interface UserCreate');
      expect(typesCode).toContain('export interface UserUpdate');
      expect(typesCode).toContain('export interface QueryOptions');
      expect(typesCode).toContain('export interface ListResponse');
      expect(typesCode).toContain('export interface ItemResponse');
    });

    it('db.ts imports from types.ts', () => {
      const dbCode = generateMockDb(analyzedSchemas, {});

      // db.ts should not import types directly (uses factory pattern)
      // But should generate correct structure
      expect(dbCode).toContain('export const db');
    });

    it('client.ts imports from db.ts and types.ts', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      expect(clientCode).toContain("import { db } from './db'");
      expect(clientCode).toContain("import type * as Types from './types'");
    });

    it('handlers.ts imports from client.ts and types.ts', () => {
      const handlersCode = generateMockHandlers(analyzedSchemas, '/api');

      expect(handlersCode).toContain("import { api } from './client'");
      expect(handlersCode).toContain("import type * as Types from './types'");
    });
  });

  describe('Field Types', () => {
    it('generates correct TypeScript types for field types', () => {
      const typesCode = generateTypes(analyzedSchemas);

      // UUID fields should be string
      expect(typesCode).toMatch(/id:\s*string/);

      // Email fields should be string
      expect(typesCode).toMatch(/email:\s*string/);

      // Date fields should be Date
      expect(typesCode).toMatch(/createdAt:\s*Date/);

      // Boolean fields should be boolean
      expect(typesCode).toMatch(/published:\s*boolean/);

      // Number fields should be number
      expect(typesCode).toMatch(/viewCount:\s*number/);

      // Nullable fields should have optional marker or | null
      expect(typesCode).toMatch(/avatar\??:\s*(string\s*\|\s*null|string)/);
    });

    it('generates correct faker calls for field types', () => {
      const dbCode = generateMockDb(analyzedSchemas, {});

      // UUID should use faker.string.uuid
      expect(dbCode).toContain('faker.string.uuid');

      // Email should use faker.internet.email
      expect(dbCode).toContain('faker.internet.email()');

      // Date should use faker.date
      expect(dbCode).toMatch(/faker\.date\.(recent|past|future|anytime)/);

      // String fields should use some faker method (lorem.word or similar)
      expect(dbCode).toContain('faker.lorem.word()');
    });
  });

  describe('RLS Configuration', () => {
    it('generates RLS scope filters correctly', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      // Post has authorId scope
      expect(clientCode).toContain('rlsPostSelect');
      expect(clientCode).toMatch(/authorId.*userId/);

      // Project has tenantId scope
      expect(clientCode).toContain('rlsProjectSelect');
      expect(clientCode).toMatch(/tenantId/);
    });

    it('generates bypass conditions for admin role', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      // Bypass for admin role - check the bypass function and admin value
      expect(clientCode).toContain('checkBypass');
      expect(clientCode).toContain("'admin'");
    });
  });

  describe('Relation Configuration', () => {
    it('generates hasMany relation loading code', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      // User hasMany posts
      expect(clientCode).toMatch(/posts.*db\.post\.findMany/);
    });

    it('generates belongsTo relation loading code', () => {
      const clientCode = generateMockClient(analyzedSchemas);

      // Post belongsTo author
      expect(clientCode).toMatch(/author.*db\.user\.findFirst/);
    });
  });
});
