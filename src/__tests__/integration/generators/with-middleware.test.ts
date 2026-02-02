import { describe, it, expect } from 'vitest';
import { generateWithMiddleware } from '../../../cli/generators/unified/with-middleware';
import { analyzeSchemas } from '../../../cli/analyze';
import { defineData, field, belongsTo } from '../../../schema';

describe('with-middleware generator', () => {
  // Test schemas with RLS configuration
  const userSchema = defineData('user', {
    id: field.uuid(),
    name: field.string(),
    email: field.email(),
    tenantId: field.uuid(),
    orgId: field.uuid(),
    role: field.enum(['admin', 'user']).default('user'),
  }, {
    rls: {
      scope: [
        { field: 'tenantId', contextKey: 'tenantId' },
        { field: 'orgId', contextKey: 'orgId' },
      ],
      bypass: [{ contextKey: 'role', values: ['admin'] }],
    },
  });

  const postSchema = defineData('post', {
    id: field.uuid(),
    title: field.string(),
    content: field.string(),
    authorId: field.uuid(),
    published: field.boolean().default(false),
    author: belongsTo('user', { foreignKey: 'authorId' }),
  });

  // Schema without RLS (public)
  const publicSettingsSchema = defineData('setting', {
    id: field.uuid(),
    key: field.string(),
    value: field.string(),
  });

  const schemas = analyzeSchemas([userSchema, postSchema, publicSettingsSchema], { apiPrefix: '/api' });

  describe('MiddlewareContext interface', () => {
    it('should include userId and role as base context', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('export interface MiddlewareContext');
      expect(code).toContain('userId?: string');
      expect(code).toContain('role?: string');
    });

    it('should include RLS scope keys from all schemas', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      // tenantId and orgId from userSchema RLS scope
      expect(code).toContain('tenantId?: string');
      expect(code).toContain('orgId?: string');
    });

    it('should include custom headers as context keys', () => {
      const code = generateWithMiddleware(schemas, {
        target: 'msw',
        customHeaders: ['X-Tenant-ID', 'X-Request-ID', 'X-Correlation-ID'],
      });

      // Custom headers are listed for extraction in extractContextFromHeaders
      expect(code).toContain("getHeader('X-Tenant-ID')");
      expect(code).toContain("getHeader('X-Request-ID')");
      expect(code).toContain("getHeader('X-Correlation-ID')");
    });

    it('should have index signature for additional properties', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('[key: string]: unknown');
    });
  });

  describe('error classes', () => {
    it('should generate AuthError with status 401', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('export class AuthError extends Error');
      expect(code).toContain('readonly status = 401');
      expect(code).toContain("readonly code = 'AUTH_REQUIRED'");
      expect(code).toContain("this.name = 'AuthError'");
    });

    it('should generate ForbiddenError with status 403', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('export class ForbiddenError extends Error');
      expect(code).toContain('readonly status = 403');
      expect(code).toContain("readonly code = 'FORBIDDEN'");
      expect(code).toContain("this.name = 'ForbiddenError'");
    });

    it('should include default error messages', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('Authentication required');
      expect(code).toContain('Access denied');
    });
  });

  describe('JWT extraction (decodeJwtPayload)', () => {
    it('should generate decodeJwtPayload function', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('function decodeJwtPayload(token: string): Record<string, unknown> | null');
    });

    it('should validate JWT structure (3 parts)', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("const parts = token.split('.')");
      expect(code).toContain('if (parts.length !== 3) return null');
    });

    it('should handle both atob and Buffer decoding', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("typeof atob !== 'undefined'");
      expect(code).toContain('atob(payload)');
      expect(code).toContain("Buffer.from(payload, 'base64')");
    });

    it('should handle base64url encoding', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("replace(/-/g, '+')");
      expect(code).toContain("replace(/_/g, '/')");
    });

    it('should return null on errors', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('} catch {');
      expect(code).toContain('return null');
    });

    it('should be skipped when includeJwtExtraction is false', () => {
      const code = generateWithMiddleware(schemas, {
        target: 'msw',
        includeJwtExtraction: false,
      });

      expect(code).not.toContain('function decodeJwtPayload');
    });
  });

  describe('context extraction (extractContextFromHeaders)', () => {
    it('should export extractContextFromHeaders function', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('export function extractContextFromHeaders');
      expect(code).toContain('headers: Headers | Record<string, string>');
      expect(code).toContain('MiddlewareContext');
    });

    it('should handle both Headers object and plain object', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('if (headers instanceof Headers) return headers.get(name)');
      expect(code).toContain('headers[name] ?? headers[name.toLowerCase()]');
    });

    it('should extract userId from JWT sub claim', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("ctx.userId = payload.sub as string ?? payload.userId as string");
    });

    it('should extract role from JWT', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("ctx.role = payload.role as string ?? payload.user_role as string");
    });

    it('should extract common JWT claims (tenant_id, org_id)', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("if (payload.tenant_id) ctx.tenantId = payload.tenant_id as string");
      expect(code).toContain("if (payload.org_id) ctx.orgId = payload.org_id as string");
    });

    it('should handle Bearer token prefix', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("const authHeader = getHeader('Authorization')");
      expect(code).toContain("if (authHeader?.startsWith('Bearer '))");
      expect(code).toContain('const token = authHeader.slice(7)');
    });

    it('should extract custom headers to context', () => {
      const code = generateWithMiddleware(schemas, {
        target: 'msw',
        customHeaders: ['X-Tenant-ID', 'X-Request-ID'],
      });

      expect(code).toContain("const tenantIDHeader = getHeader('X-Tenant-ID')");
      expect(code).toContain("const requestIDHeader = getHeader('X-Request-ID')");
      expect(code).toContain('if (tenantIDHeader) ctx.tenantID = tenantIDHeader');
      expect(code).toContain('if (requestIDHeader) ctx.requestID = requestIDHeader');
    });
  });

  describe('MiddlewareHandler type', () => {
    describe('MSW target', () => {
      it('should use standard Request type', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('export type MiddlewareHandler = (');
        expect(code).toContain('ctx: MiddlewareContext');
        expect(code).toContain('request: Request');
        expect(code).toContain('Promise<MiddlewareContext | Response>');
      });
    });

    describe('Next.js target', () => {
      it('should use NextRequest and NextResponse types', () => {
        const code = generateWithMiddleware(schemas, { target: 'nextjs' });

        expect(code).toContain('request: NextRequest');
        expect(code).toContain('Promise<MiddlewareContext | NextResponse>');
      });
    });

    describe('Express target', () => {
      it('should use Express Request/Response types', () => {
        const code = generateWithMiddleware(schemas, { target: 'express' });

        expect(code).toContain('req: Request');
        expect(code).toContain('res: Response');
        expect(code).toContain('Promise<MiddlewareContext | void>');
      });
    });

    describe('Supabase Edge target', () => {
      it('should use standard Request/Response types', () => {
        const code = generateWithMiddleware(schemas, { target: 'supabase-edge' });

        expect(code).toContain('request: Request');
        expect(code).toContain('Promise<MiddlewareContext | Response>');
      });
    });
  });

  describe('withMiddleware function', () => {
    describe('MSW target', () => {
      it('should generate withMiddleware function signature', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('export async function withMiddleware(');
        expect(code).toContain('middleware: MiddlewareHandler[]');
        expect(code).toContain('request: Request');
        expect(code).toContain('handler: (ctx: MiddlewareContext) => Promise<Response>');
        expect(code).toContain('): Promise<Response>');
      });

      it('should extract initial context from headers', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('let ctx = extractContextFromHeaders(request.headers)');
      });

      it('should run middleware chain', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('for (const mw of middleware)');
        expect(code).toContain('const result = await mw(ctx, request)');
      });

      it('should handle early Response return from middleware', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('if (result instanceof Response)');
        expect(code).toContain('return result');
      });

      it('should update context from middleware', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('ctx = result');
      });

      it('should handle AuthError and return 401', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('if (error instanceof AuthError)');
        expect(code).toContain('HttpResponse.json({ error: error.message }, { status: 401 })');
      });

      it('should handle ForbiddenError and return 403', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain('if (error instanceof ForbiddenError)');
        expect(code).toContain('HttpResponse.json({ error: error.message }, { status: 403 })');
      });

      it('should handle service errors with status', () => {
        const code = generateWithMiddleware(schemas, { target: 'msw' });

        expect(code).toContain("if (error instanceof Error && 'status' in error)");
        expect(code).toContain('const status = (error as { status: number }).status');
        expect(code).toContain('return HttpResponse.json({ error: error.message }, { status })');
      });
    });

    describe('Next.js target', () => {
      it('should use NextResponse for error responses', () => {
        const code = generateWithMiddleware(schemas, { target: 'nextjs' });

        expect(code).toContain('NextResponse.json({ error: error.message }, { status: 401 })');
        expect(code).toContain('NextResponse.json({ error: error.message }, { status: 403 })');
      });

      it('should use NextRequest type', () => {
        const code = generateWithMiddleware(schemas, { target: 'nextjs' });

        expect(code).toContain('request: NextRequest');
        expect(code).toContain('handler: (ctx: MiddlewareContext) => Promise<NextResponse>');
      });
    });

    describe('Express target', () => {
      it('should use Express request/response pattern', () => {
        const code = generateWithMiddleware(schemas, { target: 'express' });

        expect(code).toContain('req: Request');
        expect(code).toContain('res: Response');
        expect(code).toContain('handler: (ctx: MiddlewareContext) => Promise<void>');
      });

      it('should check res.headersSent for early response', () => {
        const code = generateWithMiddleware(schemas, { target: 'express' });

        expect(code).toContain('if (result === undefined && res.headersSent)');
      });

      it('should use res.status().json() for errors', () => {
        const code = generateWithMiddleware(schemas, { target: 'express' });

        expect(code).toContain('res.status(401).json({ error: error.message })');
        expect(code).toContain('res.status(403).json({ error: error.message })');
      });

      it('should cast headers to Record<string, string>', () => {
        const code = generateWithMiddleware(schemas, { target: 'express' });

        expect(code).toContain('extractContextFromHeaders(req.headers as Record<string, string>)');
      });
    });

    describe('Supabase Edge target', () => {
      it('should use standard Response constructor', () => {
        const code = generateWithMiddleware(schemas, { target: 'supabase-edge' });

        expect(code).toContain('new Response(JSON.stringify({ error: error.message })');
        expect(code).toContain('status: 401');
        expect(code).toContain('status: 403');
      });

      it('should set Content-Type header', () => {
        const code = generateWithMiddleware(schemas, { target: 'supabase-edge' });

        expect(code).toContain("headers: { 'Content-Type': 'application/json' }");
      });
    });
  });

  describe('middleware resolution (getMiddleware)', () => {
    it('should generate Operation type', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("export type Operation = 'list' | 'get' | 'create' | 'update' | 'delete'");
    });

    it('should generate getMiddleware function', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('export function getMiddleware(entity: string, operation: Operation): MiddlewareHandler[]');
    });

    it('should look up entity config', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('const config = middlewareConfig[entity]');
      expect(code).toContain('if (!config) return []');
    });

    it('should check for per-operation override', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('const override = config.operations[operation]');
      expect(code).toContain('if (override !== undefined)');
      expect(code).toContain('return override');
    });

    it('should fall back to default middleware', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('return config.default');
    });
  });

  describe('middlewareConfig generation', () => {
    it('should generate config for each non-junction schema', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('const middlewareConfig');
      expect(code).toContain('user: {');
      expect(code).toContain('post: {');
      expect(code).toContain('setting: {');
    });

    it('should have default and operations properties', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('default: MiddlewareHandler[]');
      expect(code).toContain('operations: Partial<Record<Operation, MiddlewareHandler[]>>');
    });
  });

  describe('middleware imports', () => {
    // Helper to create schema with middleware
    function createSchemaWithMiddleware() {
      const schemaWithMiddleware = defineData('product', {
        id: field.uuid(),
        name: field.string(),
        price: field.number(),
        tenantId: field.uuid(),
      }, {
        rls: {
          scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
        },
      });
      const analyzedSchemas = analyzeSchemas([schemaWithMiddleware], { apiPrefix: '/api' });
      const productSchema = analyzedSchemas.find(s => s.name === 'product')!;
      return { analyzedSchemas, productSchema };
    }

    it('should import from configured middlewareImport path', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
        { name: 'tenant', pascalName: 'Tenant', hasConfigOverrides: false },
      ];

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain("import { authMiddleware, tenantMiddleware } from '@/middleware'");
    });

    it('should group imports by sourceFile when no middlewareImport', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false, sourceFile: './middleware/auth' },
        { name: 'tenant', pascalName: 'Tenant', hasConfigOverrides: false, sourceFile: './middleware/tenant' },
        { name: 'log', pascalName: 'Log', hasConfigOverrides: false, sourceFile: './middleware/auth' },
      ];

      const code = generateWithMiddleware(analyzedSchemas, { target: 'msw' });

      expect(code).toContain("import { authMiddleware, logMiddleware } from './middleware/auth'");
      expect(code).toContain("import { tenantMiddleware } from './middleware/tenant'");
    });

    it('should generate actual middleware arrays', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
        { name: 'tenant', pascalName: 'Tenant', hasConfigOverrides: false },
      ];

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain('default: [authMiddleware, tenantMiddleware]');
    });

    it('should generate .with() calls for config overrides', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        {
          name: 'rateLimit',
          pascalName: 'RateLimit',
          hasConfigOverrides: true,
          configOverrides: { max: 100, windowMs: 60000 },
        },
      ];

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain('rateLimitMiddleware.with({"max":100,"windowMs":60000})');
    });

    it('should generate per-operation middleware overrides', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
      ];
      productSchema.endpointMiddleware = {
        create: [
          { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
          { name: 'validate', pascalName: 'Validate', hasConfigOverrides: false },
        ],
        delete: [
          { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
          { name: 'admin', pascalName: 'Admin', hasConfigOverrides: false },
        ],
      };

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain('create: [authMiddleware, validateMiddleware]');
      expect(code).toContain('delete: [authMiddleware, adminMiddleware]');
    });

    it('should generate empty arrays for public endpoints', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      productSchema.middleware = [
        { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
      ];
      productSchema.endpointMiddleware = {
        list: [],  // Public list endpoint
        get: [],   // Public get endpoint
      };

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain('list: []');
      expect(code).toContain('get: []');
    });

    it('should not generate imports when no middleware configured', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      // Base schemas have no middleware configured
      expect(code).not.toContain("import { authMiddleware");
      expect(code).not.toContain("from '@/middleware'");
    });

    it('should collect middleware from per-operation overrides', () => {
      const { analyzedSchemas, productSchema } = createSchemaWithMiddleware();
      // No default middleware, but per-operation middleware
      productSchema.middleware = [];
      productSchema.endpointMiddleware = {
        delete: [
          { name: 'adminOnly', pascalName: 'AdminOnly', hasConfigOverrides: false },
        ],
      };

      const code = generateWithMiddleware(analyzedSchemas, {
        target: 'msw',
        middlewareImport: '@/middleware',
      });

      expect(code).toContain('adminOnlyMiddleware');
    });
  });

  describe('imports per target', () => {
    it('MSW: should import HttpResponse from msw', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain("import { HttpResponse } from 'msw'");
    });

    it('Next.js: should import NextResponse and NextRequest', () => {
      const code = generateWithMiddleware(schemas, { target: 'nextjs' });

      expect(code).toContain("import { NextResponse, type NextRequest } from 'next/server'");
    });

    it('Express: should import Express types', () => {
      const code = generateWithMiddleware(schemas, { target: 'express' });

      expect(code).toContain("import type { Request, Response, NextFunction } from 'express'");
    });

    it('Supabase Edge: should add comment about standard Request/Response', () => {
      const code = generateWithMiddleware(schemas, { target: 'supabase-edge' });

      expect(code).toContain('// Supabase Edge Functions use standard Request/Response');
    });
  });

  describe('header-to-context key conversion', () => {
    it('should convert X- prefixed headers to camelCase', () => {
      const code = generateWithMiddleware(schemas, {
        target: 'msw',
        customHeaders: ['X-Tenant-ID'],
      });

      // X-Tenant-ID becomes tenantID
      expect(code).toContain("getHeader('X-Tenant-ID')");
      expect(code).toContain('tenantIDHeader');
    });

    it('should handle multi-word headers', () => {
      const code = generateWithMiddleware(schemas, {
        target: 'msw',
        customHeaders: ['X-Custom-Header-Name'],
      });

      expect(code).toContain("getHeader('X-Custom-Header-Name')");
    });
  });

  describe('code generation markers', () => {
    it('should include generated file header', () => {
      const code = generateWithMiddleware(schemas, { target: 'msw' });

      expect(code).toContain('// GENERATED BY SCHEMOCK - DO NOT EDIT');
      expect(code).toContain('// Middleware helper for route handlers');
    });
  });
});
