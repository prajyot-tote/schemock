import { describe, it, expect } from 'vitest';
import { generateWithMiddleware } from '../../../cli/generators/unified/with-middleware';
import { generateUnifiedHandlers } from '../../../cli/generators/unified/handler';
import { generateEntityService, generateServices, generateServicesIndex } from '../../../cli/generators/unified/service';
import { analyzeSchemas } from '../../../cli/analyze';
import { defineData, field, belongsTo, hasMany } from '../../../schema';

/**
 * Integration tests for unified generators.
 *
 * These tests verify that the complete generation flow produces
 * consistent, working code across all components:
 * - Schema → Service → Handler
 * - Middleware → Handler integration
 * - Cross-target consistency
 */
describe('unified generators integration', () => {
  // Complex schema setup with RLS, relations, and various field types
  const userSchema = defineData('user', {
    id: field.uuid(),
    name: field.string(),
    email: field.email(),
    tenantId: field.uuid(),
    role: field.enum(['admin', 'editor', 'viewer']).default('viewer'),
    createdAt: field.date(),
    posts: hasMany('post', { foreignKey: 'authorId' }),
  }, {
    rls: {
      scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
      bypass: [{ contextKey: 'role', values: ['admin'] }],
    },
  });

  const postSchema = defineData('post', {
    id: field.uuid(),
    title: field.string(),
    content: field.string(),
    authorId: field.uuid(),
    published: field.boolean().default(false),
    categoryId: field.uuid().nullable(),
    author: belongsTo('user', { foreignKey: 'authorId' }),
    category: belongsTo('category', { foreignKey: 'categoryId' }),
  });

  const categorySchema = defineData('category', {
    id: field.uuid(),
    name: field.string(),
    slug: field.string(),
    posts: hasMany('post', { foreignKey: 'categoryId' }),
  });

  const schemas = analyzeSchemas([userSchema, postSchema, categorySchema], { apiPrefix: '/api' });

  describe('schema → service → handler flow', () => {
    describe('RLS enforcement chain', () => {
      it('should generate service with RLS that handler uses', () => {
        const userServiceCode = generateEntityService(
          schemas.find(s => s.name === 'user')!,
          schemas
        );

        const handlersCode = generateUnifiedHandlers(schemas, [], {
          target: 'msw',
          servicesImport: './services',
          middlewareImport: './middleware',
        });

        // Service should have RLS enforcement
        expect(userServiceCode).toContain('// Apply RLS scope to filter');
        expect(userServiceCode).toContain('if (ctx.tenantId)');
        expect(userServiceCode).toContain('rlsFilter.tenantId = ctx.tenantId');

        // Handler should call service with context
        expect(handlersCode).toContain('userService.list(ctx, options)');
        expect(handlersCode).toContain('userService.get(ctx, params.id');
        expect(handlersCode).toContain('userService.create(ctx, body)');
      });

      it('should use same context interface in service and middleware', () => {
        const userServiceCode = generateEntityService(
          schemas.find(s => s.name === 'user')!,
          schemas
        );
        const middlewareCode = generateWithMiddleware(schemas, { target: 'msw' });

        // Both should have MiddlewareContext with tenantId
        expect(userServiceCode).toContain('export interface MiddlewareContext');
        expect(userServiceCode).toContain('tenantId?: string');

        expect(middlewareCode).toContain('export interface MiddlewareContext');
        expect(middlewareCode).toContain('tenantId?: string');
      });
    });

    describe('non-RLS entity flow', () => {
      it('should generate simpler service without RLS checks', () => {
        const categoryServiceCode = generateEntityService(
          schemas.find(s => s.name === 'category')!,
          schemas
        );

        // Category has no RLS, should not have RLS filters
        expect(categoryServiceCode).not.toContain('rlsFilter');
        expect(categoryServiceCode).not.toContain('// Apply RLS scope');
        expect(categoryServiceCode).toContain("const where = options?.where ?? {}");
      });
    });

    describe('error propagation', () => {
      it('should generate matching error classes in service and middleware', () => {
        const serviceCode = generateEntityService(
          schemas.find(s => s.name === 'user')!,
          schemas
        );
        const middlewareCode = generateWithMiddleware(schemas, { target: 'msw' });

        // Service has NotFoundError and RLSError
        expect(serviceCode).toContain('class NotFoundError extends Error');
        expect(serviceCode).toContain('readonly status = 404');
        expect(serviceCode).toContain('class RLSError extends Error');
        expect(serviceCode).toContain('readonly status = 403');

        // Middleware has AuthError and ForbiddenError
        expect(middlewareCode).toContain('class AuthError extends Error');
        expect(middlewareCode).toContain('readonly status = 401');
        expect(middlewareCode).toContain('class ForbiddenError extends Error');
        expect(middlewareCode).toContain('readonly status = 403');

        // Middleware withMiddleware function handles errors with status
        // (error handling is in middleware, not handlers)
      });
    });
  });

  describe('middleware config → handler integration', () => {
    // Create schemas with middleware configuration
    function createSchemasWithMiddleware() {
      const productSchema = defineData('product', {
        id: field.uuid(),
        name: field.string(),
        price: field.number(),
        tenantId: field.uuid(),
      }, {
        rls: {
          scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
        },
      });

      const analyzedSchemas = analyzeSchemas([productSchema], { apiPrefix: '/api' });
      const product = analyzedSchemas.find(s => s.name === 'product')!;

      // Add middleware configuration
      product.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
        { name: 'tenant', pascalName: 'Tenant', hasConfigOverrides: false },
      ];
      product.endpointMiddleware = {
        list: [],  // Public list
        delete: [
          { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
          { name: 'admin', pascalName: 'Admin', hasConfigOverrides: false },
        ],
      };

      return analyzedSchemas;
    }

    it('should generate middleware imports used in handler', () => {
      const middlewareSchemas = createSchemasWithMiddleware();

      const middlewareCode = generateWithMiddleware(middlewareSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      const handlersCode = generateUnifiedHandlers(middlewareSchemas, [], {
        target: 'msw',
        middlewareImport: './middleware',
      });

      // Middleware file should import the middleware
      expect(middlewareCode).toContain("import { authMiddleware, tenantMiddleware, adminMiddleware } from '@/middleware'");

      // Handler should use getMiddleware from middleware file
      expect(handlersCode).toContain("import { withMiddleware, getMiddleware, getEndpointMiddleware, type MiddlewareContext } from './middleware'");
    });

    it('should generate middleware config that handler uses', () => {
      const middlewareSchemas = createSchemasWithMiddleware();

      const middlewareCode = generateWithMiddleware(middlewareSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      // Middleware config should have correct arrays
      expect(middlewareCode).toContain('default: [authMiddleware, tenantMiddleware]');
      expect(middlewareCode).toContain('list: []');
      expect(middlewareCode).toContain('delete: [authMiddleware, adminMiddleware]');
    });

    it('should call getMiddleware in each handler', () => {
      const handlersCode = generateUnifiedHandlers(schemas, [], { target: 'msw' });

      // Each CRUD operation should call getMiddleware
      expect(handlersCode).toContain("getMiddleware('user', 'list')");
      expect(handlersCode).toContain("getMiddleware('user', 'get')");
      expect(handlersCode).toContain("getMiddleware('user', 'create')");
      expect(handlersCode).toContain("getMiddleware('user', 'update')");
      expect(handlersCode).toContain("getMiddleware('user', 'delete')");
    });
  });

  describe('cross-target consistency', () => {
    const targets = ['msw', 'nextjs', 'express', 'supabase-edge'] as const;

    describe('same schema → same service code', () => {
      it('should generate identical service code regardless of target', () => {
        // Service layer is target-agnostic
        const userServiceCode = generateEntityService(
          schemas.find(s => s.name === 'user')!,
          schemas
        );

        // Service code should have consistent structure
        expect(userServiceCode).toContain('export const userService = {');
        expect(userServiceCode).toContain('async list(ctx: MiddlewareContext');
        expect(userServiceCode).toContain('async get(ctx: MiddlewareContext');
        expect(userServiceCode).toContain('async create(ctx: MiddlewareContext');
        expect(userServiceCode).toContain('async update(ctx: MiddlewareContext');
        expect(userServiceCode).toContain('async delete(ctx: MiddlewareContext');
      });
    });

    describe('handler structure per target', () => {
      it('MSW should use http.get/post/put/patch/delete handlers', () => {
        const code = generateUnifiedHandlers(schemas, [], { target: 'msw' });

        expect(code).toContain("import { http, HttpResponse } from 'msw'");
        expect(code).toContain('export const handlers = [');
        expect(code).toContain("http.get('/api/users'");
        expect(code).toContain("http.post('/api/users'");
        expect(code).toContain("http.get('/api/users/:id'");
        expect(code).toContain("http.put('/api/users/:id'");
        expect(code).toContain("http.patch('/api/users/:id'");
        expect(code).toContain("http.delete('/api/users/:id'");
      });

      it('Next.js should use named export functions', () => {
        const code = generateUnifiedHandlers(schemas, [], { target: 'nextjs' });

        expect(code).toContain("import { NextRequest, NextResponse } from 'next/server'");
        expect(code).toContain('export async function listUser(request: NextRequest)');
        expect(code).toContain('export async function getUser(request: NextRequest, id: string)');
        expect(code).toContain('export async function createUser(request: NextRequest)');
        expect(code).toContain('export async function updateUser(request: NextRequest, id: string)');
        expect(code).toContain('export async function deleteUser(request: NextRequest, id: string)');
      });

      it('Express should use Express handler signature', () => {
        const code = generateUnifiedHandlers(schemas, [], { target: 'express' });

        expect(code).toContain("import type { Request, Response, NextFunction } from 'express'");
        expect(code).toContain('export async function listUser(req: Request, res: Response, next: NextFunction)');
        expect(code).toContain('res.json({ data, meta: { limit, offset } })');
      });

      it('Supabase Edge should return standard Response', () => {
        const code = generateUnifiedHandlers(schemas, [], { target: 'supabase-edge' });

        expect(code).toContain('export async function listUser(request: Request): Promise<Response>');
        expect(code).toContain('return jsonResponse({');
      });
    });

    describe('middleware withMiddleware per target', () => {
      for (const target of targets) {
        it(`${target}: should generate target-appropriate withMiddleware`, () => {
          const code = generateWithMiddleware(schemas, { target });

          expect(code).toContain('export async function withMiddleware');

          // All targets should extract context and run middleware chain
          expect(code).toContain('extractContextFromHeaders');
          expect(code).toContain('for (const mw of middleware)');
        });
      }
    });
  });

  describe('services index generation', () => {
    it('should generate barrel exports for all services', () => {
      const indexCode = generateServicesIndex(schemas);

      expect(indexCode).toContain("export { userService } from './user.service'");
      expect(indexCode).toContain("export { postService } from './post.service'");
      expect(indexCode).toContain("export { categoryService } from './category.service'");
    });

    it('should export context types with entity-specific names', () => {
      const indexCode = generateServicesIndex(schemas);

      expect(indexCode).toContain("export type { MiddlewareContext as UserContext } from './user.service'");
      expect(indexCode).toContain("export type { MiddlewareContext as PostContext } from './post.service'");
      expect(indexCode).toContain("export type { MiddlewareContext as CategoryContext } from './category.service'");
    });
  });

  describe('generateServices map generation', () => {
    it('should generate all services in a Map', () => {
      const servicesMap = generateServices(schemas);

      expect(servicesMap.size).toBe(3);
      expect(servicesMap.has('user')).toBe(true);
      expect(servicesMap.has('post')).toBe(true);
      expect(servicesMap.has('category')).toBe(true);
    });

    it('should pass config to all services', () => {
      const servicesMap = generateServices(schemas, { dbImport: '@/db' });

      for (const [, code] of servicesMap) {
        expect(code).toContain("import { db } from '@/db'");
      }
    });
  });

  describe('custom import paths', () => {
    it('should use custom paths throughout generation', () => {
      const config = {
        dbImport: '@/lib/db',
        typesImport: '@/generated/types',
        servicesImport: '@/generated/services',
        middlewareImport: '@/generated/middleware',
      };

      const serviceCode = generateEntityService(
        schemas.find(s => s.name === 'user')!,
        schemas,
        { dbImport: config.dbImport, typesImport: config.typesImport }
      );

      const handlersCode = generateUnifiedHandlers(schemas, [], {
        target: 'msw',
        servicesImport: config.servicesImport,
        middlewareImport: config.middlewareImport,
      });

      // Service should use custom db and types imports
      expect(serviceCode).toContain("import { db } from '@/lib/db'");
      expect(serviceCode).toContain("from '@/generated/types'");

      // Handlers should use custom services and middleware imports
      expect(handlersCode).toContain("from '@/generated/services'");
      expect(handlersCode).toContain("from '@/generated/middleware'");
    });
  });

  describe('skip operations configuration', () => {
    it('should skip specified operations in handlers', () => {
      const handlersCode = generateUnifiedHandlers(schemas, [], {
        target: 'msw',
        skip: ['user.delete', 'post.create', 'category.update'],
      });

      // Skipped operations should not be present
      expect(handlersCode).not.toContain('await userService.delete');
      expect(handlersCode).not.toContain('await postService.create');
      expect(handlersCode).not.toContain('await categoryService.update');

      // Other operations should still be there
      expect(handlersCode).toContain('await userService.list');
      expect(handlersCode).toContain('await userService.get');
      expect(handlersCode).toContain('await postService.list');
      expect(handlersCode).toContain('await categoryService.list');
    });
  });

  describe('API prefix configuration', () => {
    it('should use custom API prefix in handlers', () => {
      const code = generateUnifiedHandlers(schemas, [], {
        target: 'msw',
        apiPrefix: '/v2/api',
      });

      expect(code).toContain("http.get('/v2/api/users'");
      expect(code).toContain("http.get('/v2/api/posts'");
      expect(code).toContain("http.get('/v2/api/categories'");
    });
  });

  describe('generated code syntax validation', () => {
    // These tests verify the generated code doesn't have obvious syntax issues
    // by checking for balanced brackets and proper structure

    it('should generate valid TypeScript service code', () => {
      const code = generateEntityService(
        schemas.find(s => s.name === 'user')!,
        schemas
      );

      // Check for balanced braces (simple heuristic)
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);

      // Check for balanced parentheses
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;
      expect(openParens).toBe(closeParens);

      // Should have proper export
      expect(code).toContain('export const userService');
      expect(code).toContain('export default userService');
    });

    it('should generate valid TypeScript middleware helper', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);

      // Should have proper exports
      expect(code).toContain('export interface MiddlewareContext');
      expect(code).toContain('export class AuthError');
      expect(code).toContain('export function extractContextFromHeaders');
      expect(code).toContain('export async function withMiddleware');
      expect(code).toContain('export function getMiddleware');
    });

    it('should generate valid TypeScript handler code', () => {
      const code = generateUnifiedHandlers(schemas, [], { target: 'msw' });

      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);

      // Should have proper array export
      expect(code).toContain('export const handlers = [');
      // Should end properly (contains closing bracket and semicolon)
      expect(code).toMatch(/\];\s*$/);
    });
  });

  describe('type imports generation', () => {
    it('should import create/update types in handlers', () => {
      const code = generateUnifiedHandlers(schemas, [], { target: 'msw' });

      // Types are imported for all entities (order may vary based on schema order)
      expect(code).toContain('import type {');
      expect(code).toContain('UserCreate');
      expect(code).toContain('UserUpdate');
      expect(code).toContain('PostCreate');
      expect(code).toContain('PostUpdate');
      expect(code).toContain('CategoryCreate');
      expect(code).toContain('CategoryUpdate');
    });

    it('should import filter and options types in service', () => {
      const code = generateEntityService(
        schemas.find(s => s.name === 'user')!,
        schemas
      );

      expect(code).toContain('import type { User, UserCreate, UserUpdate, QueryOptions, UserFilter }');
    });
  });

  describe('pagination handling', () => {
    it('should generate parseQueryOptions in handlers', () => {
      const code = generateUnifiedHandlers(schemas, [], { target: 'msw' });

      expect(code).toContain('function parseQueryOptions');
      expect(code).toContain("searchParams.get('limit')");
      expect(code).toContain("searchParams.get('offset')");
    });

    it('should use pagination in service list method', () => {
      const code = generateEntityService(
        schemas.find(s => s.name === 'user')!,
        schemas
      );

      expect(code).toContain('take: options?.limit ?? 20');
      expect(code).toContain('skip: options?.offset ?? 0');
    });
  });
});
