import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generatePGliteClient } from '../../../cli/generators/pglite/client';
import { generatePGliteDb } from '../../../cli/generators/pglite/db';
import { generateTypes } from '../../../cli/generators/types';
import { analyzeTestSchemas, createTempDir, cleanupTempDir, writeGeneratedFile } from '../utils/test-helpers';
import { checkTypeScriptCompiles } from '../utils/compile-checker';
import { defineData, field, belongsTo } from '../../../schema';

// Simple blog schema for testing (no RLS)
const simpleSchemas = [
  defineData('user', {
    id: field.uuid(),
    email: field.email().unique(),
    name: field.string(),
    role: field.enum(['admin', 'user']).default('user'),
  }),
  defineData(
    'post',
    {
      id: field.uuid(),
      title: field.string(),
      content: field.string(),
      authorId: field.ref('user'),
      published: field.boolean().default(false),
    },
    {
      relations: {
        author: belongsTo('user', 'authorId'),
      },
    }
  ),
];

// Schema with RLS for testing auth (using array format for scope)
const rlsSchemas = [
  defineData('user', {
    id: field.uuid(),
    email: field.email(),
    role: field.enum(['admin', 'user']),
  }),
  defineData(
    'task',
    {
      id: field.uuid(),
      title: field.string(),
      ownerId: field.ref('user'),
    },
    {
      relations: {
        owner: belongsTo('user', 'ownerId'),
      },
      rls: {
        scope: [{ field: 'ownerId', contextKey: 'userId' }],
        bypass: [{ contextKey: 'role', values: ['admin'] }],
      },
    }
  ),
];

describe('PGlite Client Generator', () => {
  describe('Generated Code Structure', () => {
    it('generates createClient factory function', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // Should export createClient factory
      expect(code).toContain('export function createClient(config?: ClientConfig): ApiClient');

      // Should export default api for backwards compatibility
      expect(code).toContain('export const api = createClient()');
    });

    it('generates ClientConfig interface with interceptors', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('export interface ClientConfig');
      expect(code).toContain('onRequest?: (ctx: RequestContext) => RequestContext | Promise<RequestContext>');
      expect(code).toContain('onError?: (error: ApiError) => void | Promise<void>');
    });

    it('generates RequestContext interface', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('export interface RequestContext');
      expect(code).toContain('headers: Record<string, string>');
      expect(code).toContain('operation: string');
    });

    it('generates ApiError class with status codes and details', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('export class ApiError extends Error');
      expect(code).toContain('readonly status: number');
      expect(code).toContain('readonly code: string');
      expect(code).toContain('readonly operation: string');
      expect(code).toContain('readonly details?: unknown');
    });

    it('generates ApiClient type interface', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('export interface ApiClient');
      expect(code).toContain('user: {');
      expect(code).toContain('post: {');
      expect(code).toContain('list:');
      expect(code).toContain('get:');
      expect(code).toContain('create:');
      expect(code).toContain('update:');
      expect(code).toContain('delete:');
    });

    it('generates executeRequest helper with interceptor calls', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // Should have executeRequest function
      expect(code).toContain('async function executeRequest<T>');

      // Should call onRequest interceptor
      expect(code).toContain('if (interceptors.onRequest)');
      expect(code).toContain('requestCtx = await interceptors.onRequest(requestCtx)');

      // Should extract context from headers
      expect(code).toContain('const rlsCtx = extractContextFromHeaders(requestCtx.headers)');

      // Should call onError interceptor
      expect(code).toContain('if (interceptors.onError)');
      expect(code).toContain('await interceptors.onError(error)');
    });

    it('generates entity methods that use executeRequest', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // Methods should call executeRequest with operation name
      expect(code).toContain("executeRequest('user.list'");
      expect(code).toContain("executeRequest('user.get'");
      expect(code).toContain("executeRequest('user.create'");
      expect(code).toContain("executeRequest('user.update'");
      expect(code).toContain("executeRequest('user.delete'");

      expect(code).toContain("executeRequest('post.list'");
      expect(code).toContain("executeRequest('post.get'");
    });
  });

  describe('PostgreSQL Error Mapping', () => {
    it('generates wrapPGliteError function', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function wrapPGliteError(error: unknown, operation: string): ApiError');
    });

    it('maps PostgreSQL 23505 (unique violation) to 409 Conflict', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("case '23505': status = 409; break;");
    });

    it('maps PostgreSQL 23503 (foreign key violation) to 400 Bad Request', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("case '23503': status = 400; break;");
    });

    it('maps PostgreSQL 42501 (RLS violation) to 403 Forbidden', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("case '42501': status = 403; break;");
    });

    it('maps PostgreSQL 23502 (not null violation) to 400 Bad Request', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("case '23502': status = 400; break;");
    });

    it('maps PostgreSQL 42P01 (undefined table) to 404 Not Found', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("case '42P01': status = 404; break;");
    });
  });

  describe('RLS Integration', () => {
    it('generates RLS error helpers', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generatePGliteClient(analyzed);

      // Should have createRLSError helper
      expect(code).toContain('function createRLSError(operation: string, entity: string): ApiError');
      expect(code).toContain('403');
      expect(code).toContain('"RLS_DENIED"');

      // Should have createNotFoundError helper
      expect(code).toContain('function createNotFoundError(entity: string, id: string): ApiError');
      expect(code).toContain('404');
      expect(code).toContain('"NOT_FOUND"');
    });

    it('generates RLS filter functions', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('const rlsTaskSelect');
      expect(code).toContain('const rlsTaskInsert');
      expect(code).toContain('const rlsTaskUpdate');
      expect(code).toContain('const rlsTaskDelete');
    });

    it('generates bypass check for admin role', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function checkBypass');
      expect(code).toContain("'admin'");
      expect(code).toContain('ctx.role');
    });

    it('applies RLS context from interceptor headers', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generatePGliteClient(analyzed);

      // RLS should use ctx passed from executeRequest (from headers)
      expect(code).toContain('rlsTaskSelect(item as unknown as Record<string, unknown>, ctx)');
    });

    it('uses withContext for RLS transaction scoping', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // RLS context is passed to the function
      expect(code).toContain('withContext(rlsCtx ?? {}, () => fn(rlsCtx))');
    });
  });

  describe('JWT Decoding', () => {
    it('generates decodeJwtPayload function', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function decodeJwtPayload(token: string): RLSContext | null');
      expect(code).toContain('token.split(".")');
      expect(code).toContain('parts.length !== 3');
      expect(code).toContain('atob');
      expect(code).toContain('Buffer.from');
    });

    it('generates extractContextFromHeaders that accepts headers param', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // Should accept headers as parameter (not read from global)
      expect(code).toContain('function extractContextFromHeaders(headers: Record<string, string>): RLSContext | null');
      expect(code).toContain('headers["Authorization"]');
      expect(code).toContain('headers["authorization"]');
      expect(code).toContain('Bearer ');
    });
  });

  describe('SQL Query Building', () => {
    it('generates buildWhere helper for filters', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function buildWhere');
      expect(code).toContain("'equals' in f");
      expect(code).toContain("'not' in f");
      expect(code).toContain("'in' in f");
      expect(code).toContain("'contains' in f");
      expect(code).toContain("'gt' in f");
      expect(code).toContain("'lt' in f");
    });

    it('generates buildOrderBy helper', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function buildOrderBy');
      expect(code).toContain('ORDER BY');
    });

    it('generates parseRow helper for JSONB fields', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain('function parseRow<T>');
      expect(code).toContain('JSON.parse');
    });

    it('uses parameterized queries to prevent SQL injection', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      // Should use $1, $2 style parameters
      expect(code).toContain('$${paramIndex++}');
      expect(code).toContain('params.push');
    });
  });

  describe('Database Imports', () => {
    it('imports db utilities from db.ts', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("import { db, initDb, tables, setContext, withContext } from './db'");
    });

    it('imports RLSContext type from db.ts', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generatePGliteClient(analyzed);

      expect(code).toContain("import type { RLSContext } from './db'");
    });
  });
});

describe('PGlite DB Generator - Security', () => {
  it('generates setContext with key validation', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generatePGliteDb(analyzed, { persistence: 'memory' });

    // Should validate key format
    expect(code).toContain('/^[a-zA-Z][a-zA-Z0-9_]*$/');
    expect(code).toContain('Invalid context key');
  });

  it('generates setContext with value escaping', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generatePGliteDb(analyzed, { persistence: 'memory' });

    // Should escape single quotes
    expect(code).toContain("replace(/'/g, \"''\")");
  });

  it('skips null/undefined context values', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generatePGliteDb(analyzed, { persistence: 'memory' });

    expect(code).toContain('if (value === undefined || value === null) continue');
  });

  it('early returns on null context', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generatePGliteDb(analyzed, { persistence: 'memory' });

    expect(code).toContain('if (!ctx) return');
  });
});

describe('Generated Code Output Example', () => {
  it('shows complete generated client structure', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generatePGliteClient(analyzed);

    // Log the generated code for inspection
    console.log('\n========== GENERATED PGLITE CLIENT ==========\n');
    console.log(code);
    console.log('\n==============================================\n');

    // Basic validation
    expect(code).toContain('GENERATED BY SCHEMOCK');
    expect(code.length).toBeGreaterThan(1000);
  });
});

describe('Generated Code Compilation', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir('pglite-client-compile-');
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  it('pglite client compiles without TypeScript errors', async () => {
    const analyzed = analyzeTestSchemas(simpleSchemas);

    // Generate all required files
    const typesCode = generateTypes(analyzed);
    const dbCode = generatePGliteDb(analyzed, { persistence: 'memory' });
    const clientCode = generatePGliteClient(analyzed);

    // Write files to temp directory
    const typesPath = await writeGeneratedFile(tempDir, 'types.ts', typesCode);
    const dbPath = await writeGeneratedFile(tempDir, 'db.ts', dbCode);
    const clientPath = await writeGeneratedFile(tempDir, 'client.ts', clientCode);

    // Compile and check for errors
    const result = await checkTypeScriptCompiles(clientPath, [typesPath, dbPath]);

    if (!result.success) {
      console.error('Compilation errors:', result.errors);
    }
    expect(result.success).toBe(true);
  });

  it('pglite client with RLS compiles without errors', async () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);

    const typesCode = generateTypes(analyzed);
    const dbCode = generatePGliteDb(analyzed, { persistence: 'memory' });
    const clientCode = generatePGliteClient(analyzed);

    // Write RLS versions with unique names to avoid conflicts
    const typesPath = await writeGeneratedFile(tempDir, 'types-rls.ts', typesCode);
    const dbPath = await writeGeneratedFile(tempDir, 'db-rls.ts', dbCode);
    const clientPath = await writeGeneratedFile(
      tempDir,
      'client-rls.ts',
      clientCode.replace("'./types'", "'./types-rls'").replace("'./db'", "'./db-rls'")
    );

    const result = await checkTypeScriptCompiles(clientPath, [typesPath, dbPath]);

    if (!result.success) {
      console.error('RLS compilation errors:', result.errors);
    }
    expect(result.success).toBe(true);
  });
});
