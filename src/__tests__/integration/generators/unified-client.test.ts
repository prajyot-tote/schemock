import { describe, it, expect } from 'vitest';
import { generateUnifiedClient } from '../../../cli/generators/unified/client';
import { analyzeSchemas } from '../../../cli/analyze';
import { analyzeEndpoints } from '../../../cli/analyze-endpoints';
import { defineData, field, hasMany, belongsTo, defineEndpoint } from '../../../schema';

describe('Unified Client Generator', () => {
  // Test schemas
  const userSchema = defineData('user', {
    id: field.uuid(),
    name: field.string(),
    email: field.email(),
    role: field.enum(['admin', 'user']).default('user'),
  });

  const postSchema = defineData('post', {
    id: field.uuid(),
    title: field.string(),
    content: field.string(),
    authorId: field.uuid(),
    published: field.boolean().default(false),
    author: belongsTo('user', { foreignKey: 'authorId' }),
  });

  const schemas = analyzeSchemas([userSchema, postSchema], { apiPrefix: '/api' });

  describe('generates fetch-only client', () => {
    it('should not import db', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).not.toContain("import { db }");
      expect(code).not.toContain("from './db'");
      expect(code).toContain("import type * as Types from './types'");
    });

    it('should use fetch for all operations', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('await fetch(url, {');
      expect(code).toContain('method,');
      // Check that different HTTP methods are used in request calls
      expect(code).toContain("'GET'");
      expect(code).toContain("'POST'");
      expect(code).toContain("'PATCH'");
      expect(code).toContain("'DELETE'");
    });

    it('should generate ApiError class', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export class ApiError extends Error');
      expect(code).toContain('readonly status: number');
      expect(code).toContain('readonly code: string');
      expect(code).toContain('readonly operation?: string');
    });

    it('should generate RequestContext interface', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export interface RequestContext');
      expect(code).toContain('method: string');
      expect(code).toContain('path: string');
      expect(code).toContain('headers: Record<string, string>');
      expect(code).toContain('body?: unknown');
      expect(code).toContain('operation: string');
    });

    it('should generate ClientConfig interface', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export interface ClientConfig');
      expect(code).toContain('baseUrl?: string');
      expect(code).toContain('onRequest?: (ctx: RequestContext)');
      expect(code).toContain('onError?: (error: ApiError)');
    });
  });

  describe('generates createClient factory', () => {
    it('should export createClient function', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export function createClient(config?: ClientConfig): ApiClient');
    });

    it('should support baseUrl configuration', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('const baseUrl = config?.baseUrl ?? ""');
      expect(code).toContain('`${baseUrl}${path}`');
    });

    it('should call onRequest interceptor', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('if (config?.onRequest) {');
      expect(code).toContain('ctx = await config.onRequest(ctx)');
    });

    it('should call onError interceptor on failure', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('if (config?.onError) {');
      expect(code).toContain('await config.onError(error)');
    });

    it('should handle network errors', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("'NETWORK_ERROR'");
      expect(code).toContain('Network error');
    });
  });

  describe('generates entity CRUD operations', () => {
    it('should generate list operation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("list: (options?: Types.QueryOptions<Types.UserFilter");
      expect(code).toContain("request<Types.ListResponse<Types.User>>('GET', '/api/users'");
      expect(code).toContain("'user.list'");
    });

    it('should generate get operation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("get: (id: string, options?:");
      expect(code).toContain("request<Types.ItemResponse<Types.User>>('GET', `/api/users/${id}`");
      expect(code).toContain("'user.get'");
    });

    it('should generate create operation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("create: (input: Types.UserCreate)");
      expect(code).toContain("request<Types.ItemResponse<Types.User>>('POST', '/api/users'");
      expect(code).toContain("'user.create'");
      expect(code).toContain('{ body: input }');
    });

    it('should generate update operation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("update: (id: string, input: Types.UserUpdate)");
      expect(code).toContain("request<Types.ItemResponse<Types.User>>('PATCH', `/api/users/${id}`");
      expect(code).toContain("'user.update'");
    });

    it('should generate delete operation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain("delete: (id: string)");
      expect(code).toContain("request<void>('DELETE', `/api/users/${id}`");
      expect(code).toContain("'user.delete'");
    });
  });

  describe('generates ApiClient interface', () => {
    it('should include all entities', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export interface ApiClient {');
      expect(code).toContain('user: {');
      expect(code).toContain('post: {');
    });

    it('should handle relations in include types', () => {
      const code = generateUnifiedClient(schemas);

      // User has no relations
      expect(code).toContain('Types.QueryOptions<Types.UserFilter, never>');

      // Post has author relation
      expect(code).toContain('Types.QueryOptions<Types.PostFilter, Types.PostInclude>');
    });
  });

  describe('generates default api export', () => {
    it('should export default api instance', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('export const api = createClient()');
    });

    it('should include documentation', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('Default API client (no interceptors configured)');
      expect(code).toContain('For production, use createClient() with interceptors instead');
    });
  });

  describe('handles custom endpoints', () => {
    const searchEndpoint = defineEndpoint('/api/search', {
      method: 'POST',
      params: {
        q: field.string(),
        limit: field.number().default(20),
      },
      body: {
        filters: field.object({ category: field.string().nullable() }).nullable(),
      },
      response: {
        results: field.array(field.object({ id: field.uuid(), name: field.string() })),
        total: field.number(),
      },
      mockResolver: async ({ params, body, db }) => ({ results: [], total: 0 }),
    });

    const healthEndpoint = defineEndpoint('/api/health', {
      method: 'GET',
      response: {
        status: field.string(),
        timestamp: field.date(),
      },
      mockResolver: async () => ({ status: 'ok', timestamp: new Date() }),
    });

    const endpoints = analyzeEndpoints([searchEndpoint, healthEndpoint]);

    it('should include custom endpoints in ApiClient type', () => {
      const code = generateUnifiedClient(schemas, endpoints);

      expect(code).toContain('// Custom endpoints');
      expect(code).toContain('search:');
      expect(code).toContain('health:');
    });

    it('should generate endpoint methods with correct signatures', () => {
      const code = generateUnifiedClient(schemas, endpoints);

      // Search has params and body
      expect(code).toContain('search: (params: Types.SearchParams, body: Types.SearchBody)');

      // Health has no params or body
      expect(code).toContain('health: ()');
    });

    it('should generate endpoint implementation', () => {
      const code = generateUnifiedClient(schemas, endpoints);

      expect(code).toContain("request<Types.SearchResponse>('POST', '/api/search'");
      expect(code).toContain("request<Types.HealthResponse>('GET', '/api/health'");
    });
  });

  describe('handles path parameters', () => {
    const userPostsEndpoint = defineEndpoint('/api/users/:userId/posts', {
      method: 'GET',
      params: {
        userId: field.uuid(),
      },
      response: {
        posts: field.array(field.object({ id: field.uuid(), title: field.string() })),
      },
      mockResolver: async ({ params, db }) => ({ posts: [] }),
    });

    const endpoints = analyzeEndpoints([userPostsEndpoint]);

    it('should convert path params to template literals', () => {
      const code = generateUnifiedClient(schemas, endpoints);

      expect(code).toContain('`/api/users/${params.userId}/posts`');
    });
  });

  describe('custom apiPrefix configuration', () => {
    it('should use custom apiPrefix when schemas have no endpoint', () => {
      // Create schemas without explicit apiPrefix (so generator's apiPrefix is used)
      const simpleSchemas = analyzeSchemas([
        defineData('item', { id: field.uuid(), name: field.string() }),
      ], {});
      const code = generateUnifiedClient(simpleSchemas, [], { apiPrefix: '/v1' });

      expect(code).toContain("'/v1/items'");
    });

    it('should use schema endpoint when available', () => {
      // The schemas were analyzed with apiPrefix: '/api'
      const code = generateUnifiedClient(schemas, []);

      expect(code).toContain("'/api/users'");
      expect(code).toContain("'/api/posts'");
    });
  });

  describe('handles response status codes', () => {
    it('should handle 204 No Content', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('if (response.status === 204) return undefined as T');
    });

    it('should parse error responses', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('errorBody = await response.json()');
      expect(code).toContain('(errorBody.message as string)');
      expect(code).toContain('(errorBody.code as string)');
    });
  });

  describe('query string building', () => {
    it('should generate buildQuery helper', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('function buildQuery(options?: Record<string, unknown>): string');
      expect(code).toContain('const params = new URLSearchParams()');
      expect(code).toContain('JSON.stringify(value)');
    });

    it('should pass query options to list operations', () => {
      const code = generateUnifiedClient(schemas);

      expect(code).toContain('{ query: options as Record<string, unknown> }');
    });
  });
});
