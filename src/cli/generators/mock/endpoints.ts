/**
 * Code generators for custom endpoints
 *
 * Generates TypeScript types, client methods, MSW handlers, and resolvers
 * for custom endpoints defined with defineEndpoint().
 *
 * @module cli/generators/mock/endpoints
 * @category CLI
 */

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
 *
 * This enables proper type-checking of params/body/db within the function body,
 * rather than relying on `as Type` casts which don't validate the function internals.
 *
 * @param source - The resolver function source code
 * @param contextType - The type name to inject (e.g., 'AuthLoginResolverContext')
 * @returns The function source with type annotation injected
 */
function injectResolverTypeAnnotation(source: string, contextType: string): string {
  // Match arrow function patterns:
  // - async ({ body, db }) =>
  // - ({ body }) =>
  // - async (ctx) =>
  // - (ctx) =>
  //
  // Pattern: optional async, open paren, params (destructure or identifier), close paren, arrow
  const match = source.match(/^(async\s*)?\(([^)]*)\)\s*=>/);

  if (match) {
    const [fullMatch, asyncPart = '', params] = match;
    // Check if already has type annotation (params contains ':')
    if (params.includes(':')) {
      return source; // Already typed, return as-is
    }
    // Skip injection for empty parameter lists - can't type annotate ()
    if (params.trim() === '') {
      return source;
    }
    const replacement = `${asyncPart}(${params}: ${contextType}) =>`;
    return source.replace(fullMatch, replacement);
  }

  // No pattern matched - return original
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

/**
 * Add type annotations to function body code where TypeScript types were stripped
 *
 * When tsx/ts-node compiles TypeScript, type annotations are stripped but whitespace
 * is preserved (for sourcemaps). Function.toString() returns this compiled JS with
 * extra spaces where types used to be.
 *
 * This function adds type annotations back to common patterns:
 *
 * 1. Variable declarations: `let profiles ;` → `let profiles: any;`
 * 2. Callback arrow params: `.map((m )` → `.map((m: any)`
 * 3. Generic constructors: `new Set ();` → `new Set<unknown>();`
 * 4. Type assertions (partial): `userId ;` after `=` → cleaned up spacing
 *
 * @param source - The function source code with stripped types
 * @returns Source code with type annotations added
 */
function addAnyTypesToBody(source: string): string {
  let result = source;

  // Pattern 1: Variable declarations without types
  // `let varname ;` or `let varname =` where there's suspicious spacing
  // Matches: let profiles ; or let profiles =
  result = result.replace(
    /\b(let|var)\s+(\w+)\s+;/g,
    '$1 $2: any;'
  );
  result = result.replace(
    /\b(let|var)\s+(\w+)\s+=\s/g,
    '$1 $2: any = '
  );

  // Pattern 2: Clean up trailing spaces before semicolons
  // `const callerId = context?.userId ;` - the ; with space before it indicates stripped type assertion
  // We can't know what type it was, but we can clean up the suspicious spacing
  // Match space(s) before semicolon in any context
  result = result.replace(/\s+;/g, ';');

  // Pattern 3: Generic constructors with space before parens
  // `new Set ();` → `new Set<unknown>();`
  // `new Map ();` → `new Map<unknown, unknown>();`
  result = result.replace(/\bnew\s+Set\s+\(\)/g, 'new Set<unknown>()');
  result = result.replace(/\bnew\s+Map\s+\(\)/g, 'new Map<unknown, unknown>()');
  result = result.replace(/\bnew\s+Array\s+\(\)/g, 'new Array<unknown>()');
  result = result.replace(/\bnew\s+WeakSet\s+\(\)/g, 'new WeakSet<object>()');
  result = result.replace(/\bnew\s+WeakMap\s+\(\)/g, 'new WeakMap<object, unknown>()');

  // Pattern 4: Arrow function params in callbacks with stripped types
  // `.map((m )` → `.map((m: any)` - space before ) indicates stripped type
  // `.filter((item )` → `.filter((item: any)`
  // `.forEach((x )` → `.forEach((x: any)`
  // `.find((el )` → `.find((el: any)`
  // `.some((v )` → `.some((v: any)`
  // `.every((e )` → `.every((e: any)`
  // `.reduce((acc, curr )` → `.reduce((acc: any, curr: any)`
  const callbackMethods = ['map', 'filter', 'forEach', 'find', 'findIndex', 'some', 'every', 'reduce', 'flatMap', 'sort'];
  for (const method of callbackMethods) {
    // Single param: .method((param ) =>
    result = result.replace(
      new RegExp(`\\.${method}\\(\\((\\w+)\\s+\\)\\s*=>`, 'g'),
      `.${method}(($1: any) =>`
    );
    // Multiple params: .method((a , b ) =>
    result = result.replace(
      new RegExp(`\\.${method}\\(\\((\\w+)\\s*,\\s*(\\w+)\\s+\\)\\s*=>`, 'g'),
      `.${method}(($1: any, $2: any) =>`
    );
  }

  // Pattern 5: Standalone arrow functions with stripped param types
  // Used in: const fn = (x ) => or just (x ) =>
  // Match: (identifier space) => but not if already typed
  result = result.replace(
    /\((\w+)\s+\)\s*=>/g,
    '($1: any) =>'
  );

  // Pattern 6: Multiple params with stripped types in arrow functions
  // (a , b ) => but not (a: type, b: type) =>
  result = result.replace(
    /\((\w+)\s*,\s*(\w+)\s+\)\s*=>/g,
    '($1: any, $2: any) =>'
  );

  return result;
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
export function generateEndpointTypes(endpoints: AnalyzedEndpoint[]): string {
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
 * Generate client methods for all endpoints
 *
 * Uses a factory pattern with interceptors for centralized auth and error handling,
 * matching the pattern used in client.ts for entity CRUD operations.
 *
 * @param endpoints - Analyzed endpoints
 * @returns Generated TypeScript code for endpoint client
 */
export function generateEndpointClient(endpoints: AnalyzedEndpoint[]): string {
  // Defensive deduplication
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('Client methods for custom endpoints');
  code.line();

  code.line("import type * as Types from './types';");
  code.line("import { ApiError, type ClientConfig, type RequestContext } from './client';");
  code.line();

  code.comment('API base URL - configure based on environment');
  code.line("const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';");
  code.line();

  // Generate EndpointsClient type
  code.comment('Endpoints client type');
  code.block('export interface EndpointsClient {', () => {
    for (const endpoint of dedupedEndpoints) {
      const { name, pascalName, params, body } = endpoint;
      const hasParams = params.length > 0;
      const hasBody = body.length > 0;

      const args: string[] = [];
      if (hasParams) args.push(`params: Types.${pascalName}Params`);
      if (hasBody) args.push(`body: Types.${pascalName}Body`);

      code.line(`${name}: (${args.join(', ')}) => Promise<Types.${pascalName}Response>;`);
    }
  }, '}');
  code.line();

  // Generate createEndpoints factory
  code.multiDocComment([
    'Create a configured endpoints client with interceptors.',
    '',
    'Use this for production code to centralize auth and error handling.',
    '',
    '@param config - Client configuration with interceptors',
    '@returns Configured endpoints client',
    '',
    '@example',
    '```typescript',
    "import { createEndpoints } from './generated/mock/endpoints';",
    '',
    'const endpoints = createEndpoints({',
    '  onRequest: (ctx) => {',
    '    ctx.headers.Authorization = `Bearer ${getToken()}`;',
    '    return ctx;',
    '  },',
    '  onError: (error) => {',
    '    if (error.status === 401) {',
    '      window.location.href = "/login";',
    '    }',
    '  }',
    '});',
    '',
    'const result = await endpoints.authLogin({ email, password });',
    '```',
  ]);
  code.block('export function createEndpoints(config?: ClientConfig): EndpointsClient {', () => {
    code.line('const interceptors = config ?? {};');
    code.line();

    code.comment('Internal helper to run request through interceptors');
    code.block('async function executeRequest<T>(', () => {
      code.line('operation: string,');
      code.line('fn: (headers: Record<string, string>) => Promise<T>');
    }, '): Promise<T> {');
    code.indent();

    code.comment('Build request context');
    code.line('let requestCtx: RequestContext = { headers: {}, operation };');
    code.line();

    code.comment('Run onRequest interceptor (user adds auth headers here)');
    code.block('if (interceptors.onRequest) {', () => {
      code.line('requestCtx = await interceptors.onRequest(requestCtx);');
    });
    code.line();

    code.block('try {', () => {
      code.line('return await fn(requestCtx.headers);');
    }, '} catch (err) {');
    code.indent();
    code.comment('Enhance error if not already ApiError');
    code.line('const error = err instanceof ApiError ? err : new ApiError(');
    code.line('  err instanceof Error ? err.message : String(err),');
    code.line('  500,');
    code.line('  "INTERNAL_ERROR",');
    code.line('  operation');
    code.line(');');
    code.line();
    code.comment('Run onError interceptor');
    code.block('if (interceptors.onError) {', () => {
      code.line('await interceptors.onError(error);');
    });
    code.line();
    code.line('throw error;');
    code.dedent();
    code.line('}');

    code.dedent();
    code.line('}');
    code.line();

    code.comment('Build endpoints client');
    code.block('return {', () => {
      for (const endpoint of dedupedEndpoints) {
        generateClientMethodFactory(code, endpoint);
      }
    }, '};');
  });
  code.line();

  // Default export
  code.multiDocComment([
    'Default endpoints client (no interceptors configured).',
    'For production, use createEndpoints() with interceptors instead.',
  ]);
  code.line('export const endpoints = createEndpoints();');

  return code.toString();
}

/**
 * Generate a single client method (factory version with interceptor support)
 */
function generateClientMethodFactory(code: CodeBuilder, endpoint: AnalyzedEndpoint): void {
  const { name, pascalName, method, path, params, body, pathParams } = endpoint;

  // Determine if this is a method that typically sends a body
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);

  // For POST/PUT/PATCH without explicit body, non-path params should be sent as body
  const nonPathParams = params.filter((p) => !pathParams.includes(p.name));
  const shouldSendParamsAsBody = isBodyMethod && body.length === 0 && nonPathParams.length > 0;

  // Build function signature
  const args: string[] = [];
  if (params.length > 0) {
    args.push(`params: Types.${pascalName}Params`);
  }
  if (body.length > 0) {
    args.push(`body: Types.${pascalName}Body`);
  }

  const returnType = `Promise<Types.${pascalName}Response>`;

  code.line(`${name}: (${args.join(', ')}): ${returnType} =>`);
  code.indent();
  code.line(`executeRequest('endpoints.${name}', async (headers) => {`);
  code.indent();

    // Build URL with path parameter substitution
    let urlExpr: string;

    if (pathParams.length > 0) {
      // URL with path parameters - use template literal
      let pathTemplate = path;
      for (const param of pathParams) {
        pathTemplate = pathTemplate.replace(`:${param}`, `\${params.${param}}`);
      }
      urlExpr = `\`\${API_BASE}${pathTemplate}\``;
    } else {
      urlExpr = `\`\${API_BASE}${path}\``;
    }

    if (method === 'GET' && params.length > 0) {
      // GET with query parameters
      code.line(`const url = new URL(${urlExpr});`);

      // Add non-path query parameters
      const queryParams = params.filter((p) => !pathParams.includes(p.name));
      for (const param of queryParams) {
        code.block(`if (params.${param.name} !== undefined) {`, () => {
          code.line(`url.searchParams.set('${param.name}', String(params.${param.name}));`);
        });
      }

      code.line('const response = await fetch(url.toString(), { headers });');
    } else if (body.length > 0) {
      // POST/PUT/PATCH with explicit body
      code.line(`const response = await fetch(${urlExpr}, {`);
      code.line(`  method: '${method}',`);
      code.line("  headers: { 'Content-Type': 'application/json', ...headers },");
      code.line('  body: JSON.stringify(body),');
      code.line('});');
    } else if (shouldSendParamsAsBody) {
      // POST/PUT/PATCH with params but no body - send non-path params as body
      if (pathParams.length > 0) {
        // Extract non-path params to send as body
        code.line('const { ' + pathParams.join(', ') + ', ...bodyParams } = params;');
        code.line(`const response = await fetch(${urlExpr}, {`);
        code.line(`  method: '${method}',`);
        code.line("  headers: { 'Content-Type': 'application/json', ...headers },");
        code.line('  body: JSON.stringify(bodyParams),');
        code.line('});');
      } else {
        // No path params - send all params as body
        code.line(`const response = await fetch(${urlExpr}, {`);
        code.line(`  method: '${method}',`);
        code.line("  headers: { 'Content-Type': 'application/json', ...headers },");
        code.line('  body: JSON.stringify(params),');
        code.line('});');
      }
    } else {
      // Simple request without body (DELETE, or methods with only path params)
      code.line(`const response = await fetch(${urlExpr}, { method: '${method}', headers });`);
    }

    code.line();
    code.block('if (!response.ok) {', () => {
      code.line('const errorData = await response.json().catch(() => ({}));');
      code.line(`throw new ApiError(`);
      code.line(`  errorData.message || \`HTTP \${response.status}\`,`);
      code.line('  response.status,');
      code.line(`  errorData.code || 'HTTP_ERROR',`);
      code.line(`  'endpoints.${name}'`);
      code.line(');');
    });
    code.line();
    code.line('return response.json();');
    code.dedent();
    code.line('}),');
  code.dedent();
  code.line();
}

// ============================================================================
// Handler Generation
// ============================================================================

/**
 * Generate MSW handlers for all endpoints
 *
 * @param endpoints - Analyzed endpoints
 * @returns Generated TypeScript code for MSW handlers
 */
export function generateEndpointHandlers(endpoints: AnalyzedEndpoint[]): string {
  // Defensive deduplication
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('MSW handlers for custom endpoints');
  code.line();

  code.line("import { http, HttpResponse } from 'msw';");
  code.line("import { db } from './db';");
  code.line("import { endpointResolvers } from './endpoint-resolvers';");
  code.line("import type * as Types from './types';");
  code.line();

  // Generate error handling infrastructure
  code.comment('Error classes for typed error handling');
  code.block('class ApiError extends Error {', () => {
    code.line('readonly status: number;');
    code.line('readonly code: string;');
    code.line();
    code.block('constructor(message: string, status: number, code?: string) {', () => {
      code.line('super(message);');
      code.line('this.name = "ApiError";');
      code.line('this.status = status;');
      code.line('this.code = code ?? "API_ERROR";');
    });
  });
  code.line();

  code.block('class RLSError extends Error {', () => {
    code.block('constructor(message: string = "Access denied") {', () => {
      code.line('super(message);');
      code.line('this.name = "RLSError";');
    });
  });
  code.line();

  code.comment('Centralized error handler for endpoint handlers');
  code.block('function handleError(error: unknown): Response {', () => {
    code.block('if (error instanceof ApiError) {', () => {
      code.line('return HttpResponse.json({ error: error.message, code: error.code }, { status: error.status });');
    });
    code.block('if (error instanceof RLSError) {', () => {
      code.line('return HttpResponse.json({ error: error.message }, { status: 403 });');
    });
    code.block('if (error instanceof Error) {', () => {
      code.block('if (error.message.toLowerCase().includes("not found")) {', () => {
        code.line('return HttpResponse.json({ error: error.message }, { status: 404 });');
      });
      code.line('console.error("Endpoint error:", error);');
      code.line('return HttpResponse.json({ error: error.message }, { status: 500 });');
    });
    code.line('console.error("Unknown endpoint error:", error);');
    code.line('return HttpResponse.json({ error: "Internal server error" }, { status: 500 });');
  });
  code.line();

  // Generate JWT decoding and context extraction for middleware support
  code.comment('Decode JWT payload for context extraction (middleware support)');
  code.block('function decodeJwtPayload(token: string): Record<string, unknown> | undefined {', () => {
    code.block('try {', () => {
      code.line("const base64Url = token.split('.')[1];");
      code.line('if (!base64Url) return undefined;');
      code.line("const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');");
      code.line("const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>");
      code.line("  '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)");
      code.line(").join(''));");
      code.line('return JSON.parse(jsonPayload);');
    }, '} catch {');
    code.indent();
    code.line('return undefined;');
    code.dedent();
    code.line('}');
  });
  code.line();

  code.comment('Extract context from request headers (JWT Bearer token)');
  code.block('function extractContextFromHeaders(headers: Record<string, string>): Record<string, unknown> | undefined {', () => {
    code.line('const authHeader = headers["Authorization"] || headers["authorization"];');
    code.line('if (!authHeader) return undefined;');
    code.line();
    code.line('const token = authHeader.startsWith("Bearer ")');
    code.line('  ? authHeader.slice(7)');
    code.line('  : authHeader;');
    code.line();
    code.line('return token ? decodeJwtPayload(token) : undefined;');
  });
  code.line();

  code.block('export const endpointHandlers = [', () => {
    for (const endpoint of dedupedEndpoints) {
      generateHandler(code, endpoint);
    }
  }, '];');

  return code.toString();
}

/**
 * Generate a single MSW handler
 */
function generateHandler(code: CodeBuilder, endpoint: AnalyzedEndpoint): void {
  const { name, pascalName, method, path, params, body, pathParams } = endpoint;
  const httpMethod = method.toLowerCase();
  const hasBody = body.length > 0;
  const hasParams = params.length > 0 || pathParams.length > 0;

  // Determine if this is a method that typically sends a body
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);

  // For POST/PUT/PATCH without explicit body, non-path params should come from request body
  const nonPathParams = params.filter((p) => !pathParams.includes(p.name));
  const shouldParseBodyAsParams = isBodyMethod && !hasBody && nonPathParams.length > 0;

  code.comment(`${method} ${path}`);
  code.block(`http.${httpMethod}('${path}', async ({ request, params: pathParams }) => {`, () => {
    // Parse query parameters for GET
    if (method === 'GET' && params.length > 0) {
      code.line('const url = new URL(request.url);');
      code.block('const params = {', () => {
        for (const param of params) {
          if (pathParams.includes(param.name)) {
            // Path parameter
            code.line(`${param.name}: pathParams.${param.name} as string,`);
          } else {
            // Query parameter
            generateParamParsing(code, param);
          }
        }
      }, '};');
      code.line();
    } else if (shouldParseBodyAsParams) {
      // POST/PUT/PATCH with params but no body - parse request body as params
      code.line('const requestBody = await request.json();');
      if (pathParams.length > 0) {
        // Combine path params with body params
        code.block('const params = {', () => {
          for (const paramName of pathParams) {
            code.line(`${paramName}: pathParams.${paramName} as string,`);
          }
          code.line('...requestBody,');
        }, '};');
      } else {
        code.line('const params = requestBody;');
      }
      code.line();
    } else if (pathParams.length > 0) {
      // Only path params, no query params
      code.block('const params = {', () => {
        for (const paramName of pathParams) {
          code.line(`${paramName}: pathParams.${paramName} as string,`);
        }
      }, '};');
      code.line();
    } else {
      // No params - provide empty object for consistent context
      code.line('const params = {};');
      code.line();
    }

    // Parse body for POST/PUT/PATCH, or provide empty object for GET
    if (hasBody) {
      code.line('const body = await request.json();');
    } else if (shouldParseBodyAsParams) {
      // Body was already parsed into params above
      code.line('const body = {};');
    } else {
      // No body - provide empty object for consistent context
      code.line('const body = {};');
    }
    code.line();

    // Build headers object
    code.line('const headers: Record<string, string> = {};');
    code.line("request.headers.forEach((value, key) => { headers[key] = value; });");
    code.line();

    // Extract context from JWT token in headers (for middleware support)
    code.line('const context = extractContextFromHeaders(headers);');
    code.line();

    // Call resolver with complete context (always includes params, body, db, headers, context)
    // Type assertions ensure proper typing through the resolver chain
    const paramsArg = hasParams ? `params as Types.${pascalName}Params` : 'params';
    const bodyArg = hasBody ? `body as Types.${pascalName}Body` : 'body';
    code.block('try {', () => {
      code.line(`const result = await endpointResolvers.${name}({ db, params: ${paramsArg}, body: ${bodyArg}, headers, context });`);
      code.line('return HttpResponse.json(result);');
    }, '} catch (error) {');
    code.indent();
    code.line('return handleError(error);');
    code.dedent();
    code.line('}');
  }, '}),');
  code.line();
}

/**
 * Generate parameter parsing code
 */
function generateParamParsing(code: CodeBuilder, param: AnalyzedEndpointField): void {
  const { name, tsType, hasDefault } = param;
  const defaultVal = hasDefault ? JSON.stringify(param.default) : 'undefined';

  if (tsType === 'number' || tsType.includes('number')) {
    if (hasDefault) {
      code.line(`${name}: Number(url.searchParams.get('${name}') ?? ${defaultVal}),`);
    } else {
      code.line(`${name}: url.searchParams.has('${name}') ? Number(url.searchParams.get('${name}')) : undefined,`);
    }
  } else if (tsType === 'boolean' || tsType.includes('boolean')) {
    if (hasDefault) {
      code.line(`${name}: url.searchParams.has('${name}') ? url.searchParams.get('${name}') === 'true' : ${defaultVal},`);
    } else {
      code.line(`${name}: url.searchParams.has('${name}') ? url.searchParams.get('${name}') === 'true' : undefined,`);
    }
  } else {
    // String or enum
    if (hasDefault) {
      code.line(`${name}: url.searchParams.get('${name}') ?? ${defaultVal},`);
    } else {
      code.line(`${name}: url.searchParams.get('${name}') ?? undefined,`);
    }
  }
}

// ============================================================================
// Resolver Generation
// ============================================================================

/**
 * Generate endpoint resolvers file
 *
 * Contains the serialized mock resolver functions from endpoint definitions.
 *
 * @param endpoints - Analyzed endpoints
 * @param outputDir - Output directory for generated files
 * @returns Generated TypeScript code for resolvers
 */
export function generateEndpointResolvers(endpoints: AnalyzedEndpoint[], outputDir?: string): string {
  // Defensive deduplication to prevent duplicate resolver definitions
  const dedupedEndpoints = deduplicateEndpoints(endpoints);
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('Mock resolvers for custom endpoints');
  code.comment('');
  code.comment('These resolvers are copied from your defineEndpoint() calls.');
  code.comment('They receive { params, body, db, headers } and return the response.');
  code.comment('');
  code.comment('NOTE: If your inline resolvers use external functions (e.g., hashPassword, generateToken),');
  code.comment('consider using named exported functions instead - they will be automatically imported.');
  code.line();

  // Type imports for endpoint types
  code.line("import type * as Types from './types';");
  code.line();

  // Create a base resolver context interface
  code.comment('Base resolver context with typed database access');
  code.block('export interface ResolverContext<TParams = Record<string, unknown>, TBody = Record<string, unknown>> {', () => {
    code.line('params: TParams;');
    code.line('body: TBody;');
    code.line('db: any;');
    code.line('headers: Record<string, string>;');
    code.line('/** Context populated by middleware (e.g., auth middleware adds userId, role) */');
    code.line('context?: Record<string, unknown>;');
  });
  code.line();

  // Generate per-endpoint typed context interfaces
  code.comment('Per-endpoint typed resolver contexts');
  for (const endpoint of dedupedEndpoints) {
    const { pascalName, params, body } = endpoint;
    const paramsType = params.length > 0 ? `Types.${pascalName}Params` : 'Record<string, never>';
    const bodyType = body.length > 0 ? `Types.${pascalName}Body` : 'Record<string, never>';
    code.line(`export type ${pascalName}ResolverContext = ResolverContext<${paramsType}, ${bodyType}>;`);
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

  // Collect unique external resolvers to import (named functions)
  const externalResolvers = new Map<string, { name: string; importPath: string }>();

  // Collect unique inline resolver dependencies (functions used in inline resolvers)
  // Track source file for relative path resolution
  const inlineDependencies = new Map<string, { name: string; importPath: string; sourceFile?: string }>();

  for (const endpoint of dedupedEndpoints) {
    if (endpoint.mockResolverName && endpoint.mockResolverImportPath) {
      // Named function resolver
      const key = `${endpoint.mockResolverImportPath}:${endpoint.mockResolverName}`;
      if (!externalResolvers.has(key)) {
        externalResolvers.set(key, {
          name: endpoint.mockResolverName,
          importPath: endpoint.mockResolverImportPath,
        });
      }
    }

    // Collect dependencies from inline resolvers
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    // Resolve both paths to absolute to ensure correct calculation
    const absOutputDir = path.resolve(outputDir);
    const absImportPath = path.resolve(importPath);

    // Use Node's path.relative for reliable calculation
    let rel = path.relative(absOutputDir, absImportPath);

    // Convert to POSIX-style paths for imports (handles Windows backslashes)
    rel = rel.replace(/\\/g, '/');

    // Ensure starts with ./ or ../ for valid ES module import
    if (!rel.startsWith('.') && !rel.startsWith('/')) {
      rel = './' + rel;
    }

    // Remove .ts or .js extension for imports
    rel = rel.replace(/\.(ts|js)$/, '');

    return rel;
  };

  // Generate imports for external resolvers (named functions)
  if (externalResolvers.size > 0) {
    code.line();
    code.comment('External resolver imports');

    // Group by import path
    const importsByPath = new Map<string, string[]>();
    for (const { name, importPath } of externalResolvers.values()) {
      if (!importsByPath.has(importPath)) {
        importsByPath.set(importPath, []);
      }
      importsByPath.get(importPath)!.push(name);
    }

    // Generate import statements
    for (const [importPath, names] of importsByPath) {
      const relativePath = calculateRelativePath(importPath);
      code.line(`import { ${names.join(', ')} } from '${relativePath}';`);
    }
  }

  // Generate imports for inline resolver dependencies
  if (inlineDependencies.size > 0) {
    code.line();
    code.comment('Dependencies used by inline resolvers');

    // Group by resolved import path (after resolving relative paths)
    const importsByResolvedPath = new Map<string, string[]>();
    for (const { name, importPath, sourceFile } of inlineDependencies.values()) {
      let resolvedPath = importPath;

      // If path is relative (starts with '.'), resolve from source file's directory
      if (importPath.startsWith('.') && sourceFile && outputDir) {
        // Get the directory of the source file
        const toPosix = (p: string) => p.replace(/\\/g, '/');
        const sourceDir = toPosix(sourceFile).replace(/\/[^/]+$/, ''); // dirname
        // Resolve the relative import to an absolute path
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
        // Calculate relative path from output directory to the resolved path
        resolvedPath = calculateRelativePath(absolutePath);
      }

      if (!importsByResolvedPath.has(resolvedPath)) {
        importsByResolvedPath.set(resolvedPath, []);
      }
      // Avoid duplicates within same path
      const names = importsByResolvedPath.get(resolvedPath)!;
      if (!names.includes(name)) {
        names.push(name);
      }
    }

    // Generate import statements
    for (const [resolvedPath, names] of importsByResolvedPath) {
      code.line(`import { ${names.join(', ')} } from '${resolvedPath}';`);
    }
  }

  // Collect all local functions from endpoints
  const allLocalFunctions = new Map<string, string>();
  for (const endpoint of dedupedEndpoints) {
    if (endpoint.localFunctions) {
      for (const fn of endpoint.localFunctions) {
        // Only add if not already present (avoid duplicates)
        if (!allLocalFunctions.has(fn.name)) {
          allLocalFunctions.set(fn.name, fn.source);
        }
      }
    }
  }

  // Generate local functions (copied from source files)
  if (allLocalFunctions.size > 0) {
    code.line();
    code.comment('Local helper functions (copied from source files)');
    for (const [, source] of allLocalFunctions) {
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

  // Generate the resolver interface for type safety
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

      // Use the named resolver if available, otherwise use serialized source
      if (endpoint.mockResolverName) {
        // Named function - cast to typed resolver function
        code.line(`${endpoint.name}: ${endpoint.mockResolverName} as ${endpoint.pascalName}ResolverFn,`);
      } else {
        // Inline resolver - inject type annotation into function parameters
        // and add type annotations to body where they were stripped by tsx/ts-node
        // This enables proper type-checking within the function body
        const bodyTypedSource = addAnyTypesToBody(endpoint.mockResolverSource);
        const typedSource = injectResolverTypeAnnotation(
          bodyTypedSource,
          `${endpoint.pascalName}ResolverContext`
        );
        code.line(`${endpoint.name}: ${typedSource},`);
      }
      code.line();
    }
  }, '};');

  return code.toString();
}
