import { describe, it, expect } from 'vitest';
import { generateMockClient } from '../../../cli/generators/mock/client';
import { analyzeTestSchemas } from '../utils/test-helpers';
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

describe('Mock Client Generator', () => {
  describe('Generated Code Structure', () => {
    it('generates createClient factory function', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      // Should export createClient factory
      expect(code).toContain('export function createClient(config?: ClientConfig): ApiClient');

      // Should export default api for backwards compatibility
      expect(code).toContain('export const api = createClient()');
    });

    it('generates ClientConfig interface with interceptors', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      expect(code).toContain('export interface ClientConfig');
      expect(code).toContain('onRequest?: (ctx: RequestContext) => RequestContext | Promise<RequestContext>');
      expect(code).toContain('onError?: (error: ApiError) => void | Promise<void>');
    });

    it('generates RequestContext interface', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      expect(code).toContain('export interface RequestContext');
      expect(code).toContain('headers: Record<string, string>');
      expect(code).toContain('operation: string');
    });

    it('generates ApiError class with status codes', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      expect(code).toContain('export class ApiError extends Error');
      expect(code).toContain('readonly status: number');
      expect(code).toContain('readonly code: string');
      expect(code).toContain('readonly operation: string');
    });

    it('generates ApiClient type interface', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

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
      const code = generateMockClient(analyzed);

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
      const code = generateMockClient(analyzed);

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

  describe('RLS Integration', () => {
    it('generates RLS error helpers', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generateMockClient(analyzed);

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
      const code = generateMockClient(analyzed);

      expect(code).toContain('const rlsTaskSelect');
      expect(code).toContain('const rlsTaskInsert');
      expect(code).toContain('const rlsTaskUpdate');
      expect(code).toContain('const rlsTaskDelete');
    });

    it('generates bypass check for admin role', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generateMockClient(analyzed);

      expect(code).toContain('function checkBypass');
      expect(code).toContain("'admin'");
      expect(code).toContain('ctx.role');
    });

    it('applies RLS context from interceptor headers', () => {
      const analyzed = analyzeTestSchemas(rlsSchemas);
      const code = generateMockClient(analyzed);

      // RLS should use ctx passed from executeRequest (from headers)
      expect(code).toContain('rlsTaskSelect(item as unknown as Record<string, unknown>, ctx)');
    });
  });

  describe('JWT Decoding', () => {
    it('generates decodeJwtPayload function', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      expect(code).toContain('function decodeJwtPayload(token: string): RLSContext | null');
      expect(code).toContain('token.split(".")');
      expect(code).toContain('parts.length !== 3');
      expect(code).toContain('atob');
      expect(code).toContain('Buffer.from');
    });

    it('generates extractContextFromHeaders that accepts headers param', () => {
      const analyzed = analyzeTestSchemas(simpleSchemas);
      const code = generateMockClient(analyzed);

      // Should accept headers as parameter (not read from global)
      expect(code).toContain('function extractContextFromHeaders(headers: Record<string, string>): RLSContext | null');
      expect(code).toContain('headers["Authorization"]');
      expect(code).toContain('headers["authorization"]');
      expect(code).toContain('Bearer ');
    });
  });
});

describe('Generated Code Output Example', () => {
  it('shows complete generated client structure', () => {
    const analyzed = analyzeTestSchemas(rlsSchemas);
    const code = generateMockClient(analyzed);

    // Log the generated code for inspection
    console.log('\n========== GENERATED MOCK CLIENT ==========\n');
    console.log(code);
    console.log('\n============================================\n');

    // Basic validation
    expect(code).toContain('GENERATED BY SCHEMOCK');
    expect(code.length).toBeGreaterThan(1000);
  });
});
