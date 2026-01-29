/**
 * E2E Compilation Tests
 *
 * Verify ALL generated code compiles in its target tech stack context.
 * This catches issues that unit tests miss - like cross-file imports,
 * missing types, and incompatible patterns.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// Import generators
import { generateTypes } from '../../cli/generators/types';
import { generateMockDb } from '../../cli/generators/mock/db';
import { generateMockClient } from '../../cli/generators/mock/client';
import { generateMockHandlers } from '../../cli/generators/mock/handlers';
import { generateMockSeed } from '../../cli/generators/mock/seed';
import { generateRoutes } from '../../cli/generators/mock/routes';
import { generateSupabaseClient } from '../../cli/generators/supabase/client';
import { generateFirebaseClient } from '../../cli/generators/firebase/client';
import { generateFetchClient } from '../../cli/generators/fetch/client';
import { generatePGliteDb, generatePGliteClient } from '../../cli/generators/pglite';
import { generateHooks } from '../../cli/generators/hooks';
import { generateProvider } from '../../cli/generators/provider';
import { generateHandlerFile } from '../../cli/generators/node-handlers/handler-template';
import { generateEndpointHandlerFile as generateNodeEndpointHandler } from '../../cli/generators/node-handlers/endpoint-handler-template';
import { generateRouterFile } from '../../cli/generators/node-handlers/router-template';
import { generateHandlerFile as generateNeonHandlerFile } from '../../cli/generators/neon/handler-template';
import { generateEndpointHandlerFile as generateNeonEndpointHandler } from '../../cli/generators/neon/endpoint-handler-template';
import { generateRouterFile as generateNeonRouterFile } from '../../cli/generators/neon/router-template';
import { generateNeonLibFiles } from '../../cli/generators/neon/lib-template';
import { generateEndpointRouteFile, pathToNextjsSegments } from '../../cli/generators/nextjs-api/endpoint-route-template';
import { generateEndpointEdgeFunction } from '../../cli/generators/supabase-edge/endpoint-function-template';
import { generateAllEndpointInterfaces } from '../../cli/generators/shared/endpoint-helpers';

// Import analyzer
import { analyzeSchemas } from '../../cli/analyze';

// Import schema definitions
import { defineData, field, belongsTo, hasMany, hasOne } from '../../schema';

// Import types
import type { AnalyzedSchema, AnalyzedEndpoint, SchemockConfig, GenerationTarget } from '../../cli/types';

const execAsync = promisify(exec);

// Default config used for schema analysis
const defaultConfig: SchemockConfig = {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',
  apiPrefix: '/api',
};

// Path to E2E type stubs
const TYPE_STUBS_DIR = join(dirname(import.meta.url.replace('file://', '')), 'type-stubs');

// Project root
const PROJECT_ROOT = join(dirname(import.meta.url.replace('file://', '')), '../../../');

// Temp directory for E2E tests
const E2E_TEMP_DIR = join(PROJECT_ROOT, '.e2e-temp');

/**
 * Create test schemas representing common patterns
 */
function createTestSchemas() {
  const userSchema = defineData('user', {
    id: field.uuid(),
    email: field.email().unique(),
    name: field.string(),
    role: field.enum(['admin', 'user']).default('user'),
    avatar: field.url().nullable(),
    permissions: field.array(field.string()),  // Test array of primitives
    tags: field.array(field.string()).nullable(),  // Test nullable array
    createdAt: field.date().readOnly(),
    updatedAt: field.date().readOnly(),
  });

  const profileSchema = defineData('profile', {
    id: field.uuid(),
    userId: field.uuid(),
    bio: field.string().nullable(),
    website: field.url().nullable(),
    createdAt: field.date().readOnly(),
  });

  const postSchema = defineData('post', {
    id: field.uuid(),
    title: field.string(),
    content: field.string(),
    authorId: field.uuid(),
    published: field.boolean().default(false),
    viewCount: field.number().default(0),
    createdAt: field.date().readOnly(),
    updatedAt: field.date().readOnly(),
  }, {
    rls: {
      scope: [{ field: 'authorId', contextKey: 'userId' }],
      bypass: [{ contextKey: 'role', values: ['admin'] }],
    },
  });

  const commentSchema = defineData('comment', {
    id: field.uuid(),
    content: field.string(),
    postId: field.uuid(),
    userId: field.uuid(),
    createdAt: field.date().readOnly(),
  });

  // Adversarial schema: field type vs name pattern conflicts
  // Tests that non-string types with names matching string-oriented patterns
  // still generate type-correct faker calls:
  //   - field.number() named "tokenLimit" → faker.number.int(), NOT faker.string.alphanumeric(32)
  //   - field.date() named "resetHourlyAt" → faker.date.recent(), NOT faker.internet.url()
  const tokenUsageSchema = defineData('tokenUsage', {
    id: field.uuid(),
    tokenLimit: field.number().default(100000),              // number + "token" name
    apiKeyCount: field.number(),                              // number + "key" name
    secretCode: field.number({ min: 1000, max: 9999 }),       // number + "secret" name
    tokenName: field.string(),                                // string + "token" name (control: name pattern is valid here)
    resetHourlyAt: field.date().nullable(),                   // date + name containing "url" substring
    resetDailyAt: field.date().nullable(),                    // date control (no pattern conflict)
    isUrlEnabled: field.boolean().default(false),             // boolean + "url" name
    createdAt: field.date().readOnly(),
  });

  return [userSchema, profileSchema, postSchema, commentSchema, tokenUsageSchema];
}

/**
 * Create test endpoints for endpoint code generation tests
 */
function createTestEndpoints(): AnalyzedEndpoint[] {
  return [
    {
      name: 'search',
      method: 'GET',
      path: '/api/search',
      pascalName: 'Search',
      pathParams: [],
      params: [
        { name: 'q', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'limit', type: 'number', tsType: 'number', required: false, hasDefault: true, default: 20, isArray: false, isObject: false },
      ],
      body: [],
      response: [
        { name: 'results', type: 'object', tsType: 'unknown[]', required: true, hasDefault: false, isArray: true, isObject: false,
          itemType: { name: 'item', type: 'object', tsType: 'unknown', required: true, hasDefault: false, isArray: false, isObject: false } },
        { name: 'total', type: 'number', tsType: 'number', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      mockResolverSource: 'async () => ({ results: [], total: 0 })',
      description: 'Search across entities',
    },
    {
      name: 'authLogin',
      method: 'POST',
      path: '/api/auth/login',
      pascalName: 'AuthLogin',
      pathParams: [],
      params: [],
      body: [
        { name: 'email', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'password', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      response: [
        { name: 'token', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'user', type: 'object', tsType: '{ id: string; email: string }', required: true, hasDefault: false, isArray: false, isObject: true,
          shape: [
            { name: 'id', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
            { name: 'email', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
          ] },
      ],
      mockResolverSource: 'async () => ({ token: "abc", user: { id: "1", email: "a@b.c" } })',
      description: 'Authenticate a user',
    },
    {
      name: 'userStats',
      method: 'GET',
      path: '/api/users/:userId/stats',
      pascalName: 'UserStats',
      pathParams: ['userId'],
      params: [
        { name: 'userId', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      body: [],
      response: [
        { name: 'postCount', type: 'number', tsType: 'number', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'commentCount', type: 'number', tsType: 'number', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      mockResolverSource: 'async () => ({ postCount: 0, commentCount: 0 })',
      description: 'Get user statistics',
    },
    // Test endpoint with array params and response (catches array type generation issues)
    {
      name: 'inviteUsers',
      method: 'POST',
      path: '/api/auth/invite',
      pascalName: 'InviteUsers',
      pathParams: [],
      params: [
        { name: 'permissions', type: 'array', tsType: 'Array<string>', required: true, hasDefault: false, isArray: true, isObject: false,
          itemType: { name: 'item', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false } },
        { name: 'reason', type: 'string', tsType: 'string | null', required: false, hasDefault: false, isArray: false, isObject: false },
      ],
      body: [
        { name: 'emails', type: 'array', tsType: 'Array<string>', required: true, hasDefault: false, isArray: true, isObject: false,
          itemType: { name: 'item', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false } },
        { name: 'organizationId', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      response: [
        { name: 'profileId', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'teamMemberId', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'permissionMapId', type: 'string', tsType: 'string', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'success', type: 'boolean', tsType: 'boolean', required: true, hasDefault: false, isArray: false, isObject: false },
        { name: 'isNewUser', type: 'boolean', tsType: 'boolean', required: true, hasDefault: false, isArray: false, isObject: false },
      ],
      mockResolverSource: 'async () => ({ profileId: "1", teamMemberId: "2", permissionMapId: "3", success: true, isNewUser: false })',
      description: 'Invite users to organization',
    },
  ];
}

/**
 * Analyze schemas for code generation
 */
function analyzeTestSchemas(schemas: ReturnType<typeof defineData>[]): AnalyzedSchema[] {
  return analyzeSchemas(schemas, defaultConfig);
}

/**
 * Create temporary directory for a target
 */
async function createTempDir(targetName: string): Promise<string> {
  const dir = join(E2E_TEMP_DIR, targetName);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true });
  }
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Write a TypeScript file to temp directory
 */
async function writeFile2(dir: string, filename: string, content: string): Promise<string> {
  const filepath = join(dir, filename);
  const parentDir = dirname(filepath);
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true });
  }
  await writeFile(filepath, content, 'utf-8');
  return filepath;
}

/**
 * Create tsconfig.json for compilation
 */
async function createTsConfig(dir: string, typeStubs: string[], options?: { jsx?: boolean }): Promise<void> {
  const compilerOptions: Record<string, unknown> = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022', 'DOM'],
    typeRoots: [
      join(PROJECT_ROOT, 'node_modules/@types'),
      TYPE_STUBS_DIR,
    ],
    types: ['node'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    forceConsistentCasingInFileNames: true,
  };

  // Enable JSX if specified
  if (options?.jsx || typeStubs.includes('react')) {
    compilerOptions.jsx = 'react-jsx';
  }

  const tsConfig = {
    compilerOptions,
    include: [
      './**/*.ts',
      './**/*.tsx',
      ...typeStubs.map(stub => join(TYPE_STUBS_DIR, `${stub}.d.ts`)),
    ],
    exclude: ['node_modules'],
  };

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
}

/**
 * Run TypeScript compilation check
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
      .filter(line => line.includes('error TS'))
      .map(line => line.trim());

    return {
      success: false,
      errors: errors.length > 0 ? errors : [errorOutput],
    };
  }
}

describe('E2E: All Targets Compile', () => {
  let analyzedSchemas: AnalyzedSchema[];

  beforeAll(async () => {
    // Setup test schemas
    const schemas = createTestSchemas();
    analyzedSchemas = analyzeTestSchemas(schemas);

    // Ensure E2E temp directory exists
    if (!existsSync(E2E_TEMP_DIR)) {
      await mkdir(E2E_TEMP_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup temp directory
    if (existsSync(E2E_TEMP_DIR)) {
      await rm(E2E_TEMP_DIR, { recursive: true });
    }
  });

  describe('Client Targets', () => {
    it('mock target compiles', async () => {
      const dir = await createTempDir('mock');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const dbCode = generateMockDb(analyzedSchemas, {});
      const clientCode = generateMockClient(analyzedSchemas);
      const routesCode = generateRoutes(analyzedSchemas);
      const handlersCode = generateMockHandlers(analyzedSchemas, '/api');
      const seedCode = generateMockSeed(analyzedSchemas, {});

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'db.ts', dbCode);
      await writeFile2(dir, 'client.ts', clientCode);
      await writeFile2(dir, 'routes.ts', routesCode);
      await writeFile2(dir, 'handlers.ts', handlersCode);
      await writeFile2(dir, 'seed.ts', seedCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './db';
export * from './client';
export * from './routes';
export * from './handlers';
export * from './seed';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig with required type stubs
      await createTsConfig(dir, ['mswjs-data', 'faker-js', 'msw']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Mock target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('supabase target compiles', async () => {
      const dir = await createTempDir('supabase');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const clientCode = generateSupabaseClient(analyzedSchemas, {});

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'client.ts', clientCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './client';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['supabase']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Supabase target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('firebase target compiles', async () => {
      const dir = await createTempDir('firebase');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const clientCode = generateFirebaseClient(analyzedSchemas, {});

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'client.ts', clientCode);

      // Create lib/firebase stub at parent level (import is '../lib/firebase')
      // The generated client expects the lib folder to be a sibling directory
      const libDir = join(dirname(dir), 'lib');
      await mkdir(libDir, { recursive: true });
      const firebaseStub = `
import { getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const app = initializeApp({
  apiKey: 'test-key',
  projectId: 'test-project',
});

export const db = getFirestore(app);
`;
      await writeFile2(libDir, 'firebase.ts', firebaseStub);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './client';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['firebase']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Firebase target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('fetch target compiles', async () => {
      const dir = await createTempDir('fetch');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const clientCode = generateFetchClient(analyzedSchemas, {});

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'client.ts', clientCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './client';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig (fetch is pure TS, no external deps)
      await createTsConfig(dir, []);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Fetch target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('pglite target compiles', async () => {
      const dir = await createTempDir('pglite');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const dbCode = generatePGliteDb(analyzedSchemas, {});
      const clientCode = generatePGliteClient(analyzedSchemas);

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'db.ts', dbCode);
      await writeFile2(dir, 'client.ts', clientCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './db';
export * from './client';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['electric-sql-pglite']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('PGlite target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('React Integration', () => {
    it('hooks compile', async () => {
      const dir = await createTempDir('hooks');

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      const hooksCode = generateHooks(analyzedSchemas);
      const providerCode = generateProvider();

      // Write files
      await writeFile2(dir, 'types.ts', typesCode);
      await writeFile2(dir, 'hooks.ts', hooksCode);
      await writeFile2(dir, 'provider.tsx', providerCode);

      // Create mock client stub for hooks - use generated types
      const clientStubCode = `
import type {
  User, UserCreate, UserUpdate,
  Post, PostCreate, PostUpdate,
  Comment, CommentCreate, CommentUpdate,
  Profile, ProfileCreate, ProfileUpdate,
  Tokenusage, TokenusageCreate, TokenusageUpdate
} from './types';

export interface ApiClient {
  user: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<{ data: User[]; meta: { total: number } }>;
    get: (id: string) => Promise<User>;
    create: (data: UserCreate) => Promise<User>;
    update: (id: string, data: UserUpdate) => Promise<User>;
    delete: (id: string) => Promise<void>;
  };
  post: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<{ data: Post[]; meta: { total: number } }>;
    get: (id: string) => Promise<Post>;
    create: (data: PostCreate) => Promise<Post>;
    update: (id: string, data: PostUpdate) => Promise<Post>;
    delete: (id: string) => Promise<void>;
  };
  comment: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<{ data: Comment[]; meta: { total: number } }>;
    get: (id: string) => Promise<Comment>;
    create: (data: CommentCreate) => Promise<Comment>;
    update: (id: string, data: CommentUpdate) => Promise<Comment>;
    delete: (id: string) => Promise<void>;
  };
  profile: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<{ data: Profile[]; meta: { total: number } }>;
    get: (id: string) => Promise<Profile>;
    create: (data: ProfileCreate) => Promise<Profile>;
    update: (id: string, data: ProfileUpdate) => Promise<Profile>;
    delete: (id: string) => Promise<void>;
  };
  tokenUsage: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<{ data: Tokenusage[]; meta: { total: number } }>;
    get: (id: string) => Promise<Tokenusage>;
    create: (data: TokenusageCreate) => Promise<Tokenusage>;
    update: (id: string, data: TokenusageUpdate) => Promise<Tokenusage>;
    delete: (id: string) => Promise<void>;
  };
}

export const api: ApiClient = {} as ApiClient;
`;
      await writeFile2(dir, 'client.ts', clientStubCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './hooks';
export * from './client';
export * from './provider';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['react', 'react-query']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Hooks compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('provider compiles', async () => {
      const dir = await createTempDir('provider');

      // Generate files
      const providerCode = generateProvider();

      // Write files
      await writeFile2(dir, 'provider.tsx', providerCode);

      // Create mock client stub for provider
      const clientStubCode = `
export interface ApiClient {
  user: Record<string, unknown>;
  post: Record<string, unknown>;
}

export const api: ApiClient = {} as ApiClient;
`;
      await writeFile2(dir, 'client.ts', clientStubCode);

      // Create tsconfig
      await createTsConfig(dir, ['react', 'react-query']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Provider compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('Server Targets', () => {
    it('node-handlers target compiles', async () => {
      const dir = await createTempDir('node-handlers');

      const target: GenerationTarget = {
        name: 'node',
        type: 'node-handlers',
        output: dir,
        backend: 'supabase',
      };

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(dir, 'types.ts', typesCode);

      // Generate db.ts stub
      const dbCode = `
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
`;
      await writeFile2(dir, 'db.ts', dbCode);

      // Generate handlers directory
      await mkdir(join(dir, 'handlers'), { recursive: true });

      // Generate handlers for each entity
      for (const schema of analyzedSchemas) {
        if (schema.isJunctionTable) continue;
        const handlerCode = generateHandlerFile(schema, target, defaultConfig);
        await writeFile2(dir, `handlers/${schema.pluralName}.ts`, handlerCode);
      }

      // Generate router
      const routerCode = generateRouterFile(analyzedSchemas, target, defaultConfig);
      await writeFile2(dir, 'router.ts', routerCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './router';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['express', 'supabase']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Node handlers compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('neon target compiles', async () => {
      const dir = await createTempDir('neon');

      const target: GenerationTarget = {
        name: 'neon',
        type: 'neon',
        output: dir,
      };

      // Generate files
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(dir, 'types.ts', typesCode);

      // Generate db.ts
      const libFiles = generateNeonLibFiles(target, defaultConfig);
      for (const [filename, content] of Object.entries(libFiles)) {
        await writeFile2(dir, filename, content);
      }

      // Generate handlers directory
      await mkdir(join(dir, 'handlers'), { recursive: true });

      // Generate handlers for each entity
      for (const schema of analyzedSchemas) {
        if (schema.isJunctionTable) continue;
        const handlerCode = generateNeonHandlerFile(schema, target, defaultConfig);
        await writeFile2(dir, `handlers/${schema.pluralName}.ts`, handlerCode);
      }

      // Generate router
      const routerCode = generateNeonRouterFile(analyzedSchemas, target, defaultConfig);
      await writeFile2(dir, 'router.ts', routerCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './router';
export * from './db';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['express', 'neon']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Neon target compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('Server Targets with Endpoints', () => {
    let testEndpoints: AnalyzedEndpoint[];

    beforeAll(() => {
      testEndpoints = createTestEndpoints();
    });

    it('node-handlers with endpoints compiles', async () => {
      const dir = await createTempDir('node-handlers-endpoints');

      const target: GenerationTarget = {
        name: 'node-endpoints',
        type: 'node-handlers',
        output: dir,
        backend: 'supabase',
      };

      // Generate types
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(dir, 'types.ts', typesCode);

      // Generate endpoint types
      const endpointTypesCode = generateAllEndpointInterfaces(testEndpoints);
      await writeFile2(dir, 'endpoint-types.ts', endpointTypesCode);

      // Generate db.ts stub
      const dbCode = `
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);
`;
      await writeFile2(dir, 'db.ts', dbCode);

      // Generate handlers directory
      await mkdir(join(dir, 'handlers'), { recursive: true });

      // Generate CRUD handlers
      for (const schema of analyzedSchemas) {
        if (schema.isJunctionTable) continue;
        const handlerCode = generateHandlerFile(schema, target, defaultConfig);
        await writeFile2(dir, `handlers/${schema.pluralName}.ts`, handlerCode);
      }

      // Generate endpoint handlers
      for (const endpoint of testEndpoints) {
        const handlerCode = generateNodeEndpointHandler(endpoint, target, defaultConfig);
        await writeFile2(dir, `handlers/${endpoint.name}.ts`, handlerCode);
      }

      // Generate router with endpoints
      const routerCode = generateRouterFile(analyzedSchemas, target, defaultConfig, testEndpoints);
      await writeFile2(dir, 'router.ts', routerCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './endpoint-types';
export * from './router';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['express', 'supabase']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Node handlers with endpoints compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('neon with endpoints compiles', async () => {
      const dir = await createTempDir('neon-endpoints');

      const target: GenerationTarget = {
        name: 'neon-endpoints',
        type: 'neon',
        output: dir,
      };

      // Generate types
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(dir, 'types.ts', typesCode);

      // Generate endpoint types
      const endpointTypesCode = generateAllEndpointInterfaces(testEndpoints);
      await writeFile2(dir, 'endpoint-types.ts', endpointTypesCode);

      // Generate db.ts
      const libFiles = generateNeonLibFiles(target, defaultConfig);
      for (const [filename, content] of Object.entries(libFiles)) {
        await writeFile2(dir, filename, content);
      }

      // Generate handlers directory
      await mkdir(join(dir, 'handlers'), { recursive: true });

      // Generate CRUD handlers
      for (const schema of analyzedSchemas) {
        if (schema.isJunctionTable) continue;
        const handlerCode = generateNeonHandlerFile(schema, target, defaultConfig);
        await writeFile2(dir, `handlers/${schema.pluralName}.ts`, handlerCode);
      }

      // Generate endpoint handlers
      for (const endpoint of testEndpoints) {
        const handlerCode = generateNeonEndpointHandler(endpoint, target, defaultConfig);
        await writeFile2(dir, `handlers/${endpoint.name}.ts`, handlerCode);
      }

      // Generate router with endpoints
      const routerCode = generateNeonRouterFile(analyzedSchemas, target, defaultConfig, testEndpoints);
      await writeFile2(dir, 'router.ts', routerCode);

      // Create index barrel
      const indexCode = `
export * from './types';
export * from './endpoint-types';
export * from './router';
export * from './db';
`;
      await writeFile2(dir, 'index.ts', indexCode);

      // Create tsconfig
      await createTsConfig(dir, ['express', 'neon']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Neon with endpoints compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('nextjs-api with endpoints compiles', async () => {
      const dir = await createTempDir('nextjs-api-endpoints');

      const target: GenerationTarget = {
        name: 'nextjs-endpoints',
        type: 'nextjs-api',
        output: dir,
        backend: 'supabase',
      };

      // Create _lib directory
      const libDir = join(dir, '_lib');
      await mkdir(libDir, { recursive: true });

      // Generate types in _lib
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(libDir, 'types.ts', typesCode);

      // Generate endpoint types in _lib
      const endpointTypesCode = generateAllEndpointInterfaces(testEndpoints);
      await writeFile2(libDir, 'endpoint-types.ts', endpointTypesCode);

      // Generate supabase stub in _lib
      const supabaseStub = `
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);
`;
      await writeFile2(libDir, 'supabase.ts', supabaseStub);

      // Generate endpoint route files
      const apiPrefix = '/api';
      for (const endpoint of testEndpoints) {
        const segments = pathToNextjsSegments(endpoint.path, apiPrefix);
        const routeDir = join(dir, ...segments);
        await mkdir(routeDir, { recursive: true });

        const depth = segments.length;
        const libRelativePath = '../'.repeat(depth) + '_lib';

        const routeCode = generateEndpointRouteFile(endpoint, target, defaultConfig, libRelativePath);
        await writeFile2(routeDir, 'route.ts', routeCode);
      }

      // Create tsconfig
      await createTsConfig(dir, ['next', 'supabase']);

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Next.js API with endpoints compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);

    it('supabase-edge with endpoints compiles', async () => {
      const dir = await createTempDir('supabase-edge-endpoints');

      const target: GenerationTarget = {
        name: 'edge-endpoints',
        type: 'supabase-edge',
        output: dir,
        backend: 'supabase',
      };

      // Create _shared directory
      const sharedDir = join(dir, '_shared');
      await mkdir(sharedDir, { recursive: true });

      // Generate types in _shared
      const typesCode = generateTypes(analyzedSchemas);
      await writeFile2(sharedDir, 'types.ts', typesCode);

      // Generate endpoint types in _shared
      const endpointTypesCode = generateAllEndpointInterfaces(testEndpoints);
      await writeFile2(sharedDir, 'endpoint-types.ts', endpointTypesCode);

      // Generate supabase client stub in _shared
      const supabaseStub = `
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
`;
      await writeFile2(sharedDir, 'supabase.ts', supabaseStub);

      // Generate CORS helper in _shared
      const corsStub = `
export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
`;
      await writeFile2(sharedDir, 'cors.ts', corsStub);

      // Generate endpoint edge functions
      for (const endpoint of testEndpoints) {
        const functionName = endpoint.path
          .replace(/^\//, '')
          .replace(/:(\w+)/g, '$1')
          .replace(/\//g, '-');
        const functionDir = join(dir, functionName);
        await mkdir(functionDir, { recursive: true });

        const functionCode = generateEndpointEdgeFunction(endpoint, target, defaultConfig);
        await writeFile2(functionDir, 'index.ts', functionCode);
      }

      // Create tsconfig with Deno-like environment
      // Use supabase type stubs (which provide @supabase/supabase-js)
      // and add Deno namespace stub
      const denoStub = `
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}
`;
      await writeFile2(dir, 'deno-env.d.ts', denoStub);

      // Supabase Edge uses Deno conventions with .ts imports
      // Need allowImportingTsExtensions for that
      const tsConfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          lib: ['ES2022', 'DOM'],
          typeRoots: [
            join(PROJECT_ROOT, 'node_modules/@types'),
            TYPE_STUBS_DIR,
          ],
          types: ['node'],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          forceConsistentCasingInFileNames: true,
          allowImportingTsExtensions: true,
        },
        include: [
          './**/*.ts',
          join(TYPE_STUBS_DIR, 'supabase.d.ts'),
        ],
        exclude: ['node_modules'],
      };
      await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

      // Run compilation
      const result = await runTsc(dir);

      if (!result.success) {
        console.error('Supabase Edge with endpoints compilation errors:', result.errors);
      }
      expect(result.success).toBe(true);
    }, 30000);
  });
});
