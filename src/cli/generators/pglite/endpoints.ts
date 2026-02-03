/**
 * Code generators for custom endpoints (PGlite adapter)
 *
 * Generates TypeScript types, client methods, and resolvers
 * for custom endpoints defined with defineEndpoint().
 *
 * @module cli/generators/pglite/endpoints
 * @category CLI
 */

import * as path from 'path';
import type { AnalyzedEndpoint, AnalyzedEndpointField } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

// ============================================================================
// Deduplication Helper
// ============================================================================

/**
 * Deduplicate endpoints by method+path (defensive)
 *
 * Even though discovery should already deduplicate, this provides a safety net
 * to prevent duplicate type definitions which cause TypeScript compilation errors.
 */
function deduplicateEndpoints(endpoints: AnalyzedEndpoint[]): AnalyzedEndpoint[] {
  const seen = new Set<string>();
  return endpoints.filter((ep) => {
    const key = `${ep.method}:${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Inject type annotation into resolver function parameters
 *
 * Transforms arrow functions to include explicit type annotations on parameters:
 *   async ({ body, db }) => { ... }
 * Into:
 *   async ({ body, db }: AuthLoginResolverContext) => { ... }
 */
function injectResolverTypeAnnotation(source: string, contextType: string): string {
  const match = source.match(/^(async\s*)?\(([^)]*)\)\s*=>/);

  if (match) {
    const [fullMatch, asyncPart = '', params] = match;
    if (params.includes(':')) {
      return source;
    }
    if (params.trim() === '') {
      return source;
    }
    const replacement = `${asyncPart}(${params}: ${contextType}) =>`;
    return source.replace(fullMatch, replacement);
  }

  return source;
}

/**
 * Add `: any` type to untyped parameters in function source
 *
 * Transforms:
 *   const fn = (a, b) => { ... }
 *   function fn(a, b) { ... }
 * Into:
 *   const fn = (a: any, b: any) => { ... }
 *   function fn(a: any, b: any) { ... }
 */
function addAnyTypeToUntypedParams(source: string): string {
  // Match function parameters: (param1, param2, ...) for both arrow and regular functions
  return source.replace(
    /\(([^)]*)\)\s*(=>|{)/g,
    (match, params, arrow) => {
      if (!params.trim()) return match; // Empty params

      const typedParams = params
        .split(',')
        .map((p: string) => {
          const param = p.trim();
          if (!param) return p;
          // Skip if already has type annotation or is destructuring
          if (param.includes(':') || param.startsWith('{') || param.startsWith('[')) {
            return p;
          }
          // Skip rest parameters that already have type
          if (param.startsWith('...') && param.includes(':')) {
            return p;
          }
          // Add : any to the parameter
          if (param.startsWith('...')) {
            return p.replace(/^(\.\.\.\w+)/, '$1: any[]');
          }
          // Handle default values: param = default -> param: any = default
          if (param.includes('=')) {
            return param.replace(/^(\w+)\s*=/, '$1: any =');
          }
          return `${param}: any`;
        })
        .join(',');

      return `(${typedParams}) ${arrow}`;
    }
  );
}

// ============================================================================
// Type Generation
// ============================================================================

/**
 * Generate TypeScript types for all endpoints
 *
 * @param endpoints - Analyzed endpoints
 * @returns Generated TypeScript code for types
 */
export function generatePGliteEndpointTypes(endpoints: AnalyzedEndpoint[]): string {
  // Defensive deduplication to prevent duplicate type definitions
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.line();
  code.comment('=============================================================================');
  code.comment('Custom Endpoint Types');
  code.comment('=============================================================================');
  code.line();

  for (const endpoint of dedupedEndpoints) {
    generateEndpointTypeSet(code, endpoint);
  }

  return code.toString();
}

/**
 * Generate types for a single endpoint (params, body, response)
 */
function generateEndpointTypeSet(code: CodeBuilder, endpoint: AnalyzedEndpoint): void {
  const { pascalName, params, body, response } = endpoint;

  // Generate params type if there are parameters
  if (params.length > 0) {
    code.comment(`Parameters for ${endpoint.path}`);
    code.block(`export interface ${pascalName}Params {`, () => {
      for (const param of params) {
        const optional = !param.required ? '?' : '';
        code.line(`${param.name}${optional}: ${param.tsType};`);
      }
    });
    code.line();
  }

  // Generate body type if there's a body
  if (body.length > 0) {
    code.comment(`Request body for ${endpoint.path}`);
    code.block(`export interface ${pascalName}Body {`, () => {
      for (const field of body) {
        const optional = !field.required ? '?' : '';
        code.line(`${field.name}${optional}: ${field.tsType};`);
      }
    });
    code.line();
  }

  // Generate response type
  code.comment(`Response from ${endpoint.path}`);
  code.block(`export interface ${pascalName}Response {`, () => {
    for (const field of response) {
      code.line(`${field.name}: ${field.tsType};`);
    }
  });
  code.line();
}

// ============================================================================
// Client Generation
// ============================================================================

/**
 * Generate client methods for all endpoints (PGlite version)
 *
 * Unlike the mock adapter which uses MSW, PGlite endpoints are executed
 * directly against the database using the resolver functions.
 *
 * @param endpoints - Analyzed endpoints
 * @returns Generated TypeScript code for endpoint client
 */
export function generatePGliteEndpointClient(endpoints: AnalyzedEndpoint[]): string {
  // Defensive deduplication
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('Client methods for custom endpoints (PGlite)');
  code.line();

  code.line("import { db, initDb, withContext } from './db';");
  code.line("import type { RLSContext } from './db';");
  code.line("import type * as Types from './types';");
  code.line("import { endpointResolvers } from './endpoint-resolvers';");
  code.line("import type { ClientConfig, RequestContext, ApiError } from './client';");
  code.line();

  // JWT decoding for RLS context extraction
  code.comment('Decode JWT payload');
  code.block('function decodeJwtPayload(token: string): RLSContext | undefined {', () => {
    code.block('try {', () => {
      code.line('const parts = token.split(".");');
      code.line('if (parts.length !== 3) return undefined;');
      code.line('const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");');
      code.line('const decoded = typeof atob === "function"');
      code.line('  ? atob(payload)');
      code.line('  : Buffer.from(payload, "base64").toString("utf-8");');
      code.line('return JSON.parse(decoded);');
    }, '} catch {');
    code.indent();
    code.line('return undefined;');
    code.dedent();
    code.line('}');
  });
  code.line();

  code.comment('Extract RLS context from headers');
  code.block('function extractContextFromHeaders(headers: Record<string, string>): RLSContext | undefined {', () => {
    code.line('const authHeader = headers["Authorization"] || headers["authorization"];');
    code.line('if (!authHeader) return undefined;');
    code.line('const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;');
    code.line('return token ? decodeJwtPayload(token) : undefined;');
  });
  code.line();

  // Generate the endpoints type
  code.comment('Endpoints client type');
  code.block('export interface EndpointsClient {', () => {
    for (const endpoint of dedupedEndpoints) {
      const { name, pascalName, params, body } = endpoint;
      const args: string[] = [];
      if (params.length > 0) {
        args.push(`params: Types.${pascalName}Params`);
      }
      if (body.length > 0) {
        args.push(`body: Types.${pascalName}Body`);
      }
      code.line(`${name}: (${args.join(', ')}) => Promise<Types.${pascalName}Response>;`);
    }
  }, '}');
  code.line();

  // Generate the createEndpointsClient factory
  code.multiDocComment([
    'Create a configured endpoints client with interceptors.',
    '',
    'Endpoints are executed directly against PGlite database.',
    '',
    '@param config - Client configuration with interceptors',
    '@returns Configured endpoints client',
  ]);
  code.block('export function createEndpointsClient(config?: ClientConfig): EndpointsClient {', () => {
    code.line('const interceptors = config ?? {};');
    code.line();

    code.comment('Internal helper to run request through interceptors');
    code.block('async function executeEndpoint<T>(', () => {
      code.line('operation: string,');
      code.line('fn: (ctx: RLSContext | null, headers: Record<string, string>) => T | Promise<T>');
    }, '): Promise<T> {');
    code.indent();

    code.line('let requestCtx: RequestContext = { headers: {}, operation };');
    code.line();
    code.block('if (interceptors.onRequest) {', () => {
      code.line('requestCtx = await interceptors.onRequest(requestCtx);');
    });
    code.line();
    code.line('const rlsCtx = extractContextFromHeaders(requestCtx.headers);');
    code.line();

    code.block('try {', () => {
      code.line('await initDb();');
      code.line('return await withContext(rlsCtx ?? {}, () => fn(rlsCtx, requestCtx.headers));');
    }, '} catch (err) {');
    code.indent();
    code.block('if (interceptors.onError && err instanceof Error && "status" in err) {', () => {
      code.line('await interceptors.onError(err as ApiError);');
    });
    code.line('throw err;');
    code.dedent();
    code.line('}');

    code.dedent();
    code.line('}');
    code.line();

    code.block('return {', () => {
      for (const endpoint of dedupedEndpoints) {
        generateEndpointClientMethod(code, endpoint);
      }
    }, '};');
  });
  code.line();

  // Export default unconfigured client
  code.comment('Default endpoints client (no interceptors)');
  code.line('export const endpoints = createEndpointsClient();');

  return code.toString();
}

/**
 * Generate a single endpoint client method
 */
function generateEndpointClientMethod(code: CodeBuilder, endpoint: AnalyzedEndpoint): void {
  const { name, pascalName, params, body } = endpoint;

  const args: string[] = [];
  if (params.length > 0) {
    args.push(`params: Types.${pascalName}Params`);
  }
  if (body.length > 0) {
    args.push(`body: Types.${pascalName}Body`);
  }

  const paramsArg = params.length > 0 ? 'params' : '{}';
  const bodyArg = body.length > 0 ? 'body' : '{}';

  // Generate arrow function expression (no block braces)
  code.line(`${name}: (${args.join(', ')}) =>`);
  code.indent();
  code.line(`executeEndpoint('endpoints.${name}', async (ctx, headers) => {`);
  code.indent();
  code.line(`return endpointResolvers.${name}({`);
  code.line(`  params: ${paramsArg},`);
  code.line(`  body: ${bodyArg},`);
  code.line('  db,');
  code.line('  headers,');
  code.line('  rlsContext: ctx,');
  code.line('});');
  code.dedent();
  code.line('}),');
  code.dedent();
  code.line();
}

// ============================================================================
// Resolver Generation
// ============================================================================

/**
 * Generate endpoint resolvers file for PGlite
 *
 * Contains the serialized mock resolver functions from endpoint definitions.
 *
 * @param endpoints - Analyzed endpoints
 * @param outputDir - Output directory for generated files
 * @returns Generated TypeScript code for resolvers
 */
export function generatePGliteEndpointResolvers(endpoints: AnalyzedEndpoint[], outputDir?: string): string {
  // Defensive deduplication to prevent duplicate resolver definitions
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('PGlite resolvers for custom endpoints');
  code.comment('');
  code.comment('These resolvers are copied from your defineEndpoint() calls.');
  code.comment('They receive { params, body, db, headers, rlsContext } and return the response.');
  code.line();

  code.line("import type { RLSContext } from './db';");
  code.line("import type * as Types from './types';");
  code.line();

  // Create a base resolver context interface
  code.comment('Base resolver context with PGlite database access');
  code.block('export interface PGliteResolverContext<TParams = Record<string, unknown>, TBody = Record<string, unknown>> {', () => {
    code.line('params: TParams;');
    code.line('body: TBody;');
    code.line('db: any;');
    code.line('headers: Record<string, string>;');
    code.line('rlsContext?: RLSContext;');
  });
  code.line();

  // Generate per-endpoint typed context interfaces
  code.comment('Per-endpoint typed resolver contexts');
  for (const endpoint of dedupedEndpoints) {
    const { pascalName, params, body } = endpoint;
    const paramsType = params.length > 0 ? `Types.${pascalName}Params` : 'Record<string, never>';
    const bodyType = body.length > 0 ? `Types.${pascalName}Body` : 'Record<string, never>';
    code.line(`export type ${pascalName}ResolverContext = PGliteResolverContext<${paramsType}, ${bodyType}>;`);
  }
  code.line();

  // Add HttpError class for resolver error handling
  code.comment('Error class for HTTP errors in resolvers');
  code.block('export class HttpError extends Error {', () => {
    code.line('readonly status: number;');
    code.line('readonly code?: string;');
    code.line();
    code.block('constructor(message: string, status: number, code?: string) {', () => {
      code.line('super(message);');
      code.line('this.name = "HttpError";');
      code.line('this.status = status;');
      code.line('this.code = code;');
    });
  });
  code.line();

  // Collect unique external resolvers to import
  const externalResolvers = new Map<string, { name: string; importPath: string }>();
  const inlineDependencies = new Map<string, { name: string; importPath: string; sourceFile?: string }>();

  for (const endpoint of dedupedEndpoints) {
    if (endpoint.mockResolverName && endpoint.mockResolverImportPath) {
      const key = `${endpoint.mockResolverImportPath}:${endpoint.mockResolverName}`;
      if (!externalResolvers.has(key)) {
        externalResolvers.set(key, {
          name: endpoint.mockResolverName,
          importPath: endpoint.mockResolverImportPath,
        });
      }
    }

    if (endpoint.resolverDependencies) {
      for (const dep of endpoint.resolverDependencies) {
        const key = `${dep.from}:${dep.name}`;
        if (!inlineDependencies.has(key)) {
          inlineDependencies.set(key, {
            name: dep.name,
            importPath: dep.from,
            sourceFile: endpoint.sourceFile,
          });
        }
      }
    }
  }

  // Helper to calculate relative import path
  const calculateRelativePath = (importPath: string): string => {
    if (!outputDir) return importPath;

    const absOutputDir = path.resolve(outputDir);
    const absImportPath = path.resolve(importPath);
    let rel = path.relative(absOutputDir, absImportPath);
    rel = rel.replace(/\\/g, '/');

    if (!rel.startsWith('.') && !rel.startsWith('/')) {
      rel = './' + rel;
    }

    rel = rel.replace(/\.(ts|js)$/, '');
    return rel;
  };

  // Generate imports for external resolvers
  if (externalResolvers.size > 0) {
    code.line();
    code.comment('External resolver imports');

    const importsByPath = new Map<string, string[]>();
    for (const resolver of Array.from(externalResolvers.values())) {
      const { name, importPath } = resolver;
      if (!importsByPath.has(importPath)) {
        importsByPath.set(importPath, []);
      }
      importsByPath.get(importPath)!.push(name);
    }

    for (const [importPath, names] of Array.from(importsByPath.entries())) {
      const relativePath = calculateRelativePath(importPath);
      code.line(`import { ${names.join(', ')} } from '${relativePath}';`);
    }
  }

  // Generate imports for inline resolver dependencies
  if (inlineDependencies.size > 0) {
    code.line();
    code.comment('Dependencies used by inline resolvers');

    const importsByResolvedPath = new Map<string, string[]>();
    for (const dep of Array.from(inlineDependencies.values())) {
      const { name, importPath, sourceFile } = dep;
      let resolvedPath = importPath;

      if (importPath.startsWith('.') && sourceFile && outputDir) {
        const toPosix = (p: string) => p.replace(/\\/g, '/');
        const sourceDir = toPosix(sourceFile).replace(/\/[^/]+$/, '');
        const parts = sourceDir.split('/').filter(Boolean);
        const importParts = importPath.split('/');
        for (const part of importParts) {
          if (part === '..') {
            parts.pop();
          } else if (part !== '.') {
            parts.push(part);
          }
        }
        const absolutePath = '/' + parts.join('/');
        resolvedPath = calculateRelativePath(absolutePath);
      }

      if (!importsByResolvedPath.has(resolvedPath)) {
        importsByResolvedPath.set(resolvedPath, []);
      }
      const names = importsByResolvedPath.get(resolvedPath)!;
      if (!names.includes(name)) {
        names.push(name);
      }
    }

    for (const [resolvedPath, names] of Array.from(importsByResolvedPath.entries())) {
      code.line(`import { ${names.join(', ')} } from '${resolvedPath}';`);
    }
  }

  // Collect all local functions from endpoints
  const allLocalFunctions = new Map<string, string>();
  for (const endpoint of dedupedEndpoints) {
    if (endpoint.localFunctions) {
      for (const fn of endpoint.localFunctions) {
        if (!allLocalFunctions.has(fn.name)) {
          allLocalFunctions.set(fn.name, fn.source);
        }
      }
    }
  }

  // Generate local functions
  if (allLocalFunctions.size > 0) {
    code.line();
    code.comment('Local helper functions (copied from source files)');
    for (const [, source] of Array.from(allLocalFunctions.entries())) {
      code.line(addAnyTypeToUntypedParams(source));
      code.line();
    }
  }

  code.line();

  // Generate typed resolver function types for each endpoint
  code.comment('Typed resolver function types');
  for (const endpoint of dedupedEndpoints) {
    const { pascalName } = endpoint;
    code.line(
      `type ${pascalName}ResolverFn = (ctx: ${pascalName}ResolverContext) => Types.${pascalName}Response | Promise<Types.${pascalName}Response>;`
    );
  }
  code.line();

  // Generate the resolver interface
  code.comment('Typed endpoint resolvers interface');
  code.block('export interface EndpointResolvers {', () => {
    for (const endpoint of dedupedEndpoints) {
      const { name, pascalName } = endpoint;
      code.line(`${name}: ${pascalName}ResolverFn;`);
    }
  });
  code.line();

  code.block('export const endpointResolvers: EndpointResolvers = {', () => {
    for (const endpoint of dedupedEndpoints) {
      code.comment(`${endpoint.method} ${endpoint.path}`);
      if (endpoint.description) {
        code.comment(endpoint.description);
      }

      if (endpoint.mockResolverName) {
        code.line(`${endpoint.name}: ${endpoint.mockResolverName} as ${endpoint.pascalName}ResolverFn,`);
      } else {
        const typedSource = injectResolverTypeAnnotation(
          endpoint.mockResolverSource,
          `${endpoint.pascalName}ResolverContext`
        );
        code.line(`${endpoint.name}: ${typedSource},`);
      }
      code.line();
    }
  }, '};');

  return code.toString();
}
