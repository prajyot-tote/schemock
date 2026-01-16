/**
 * Shared RLS code generation helpers
 *
 * @module cli/generators/shared/rls
 * @category CLI
 */

import type { AnalyzedSchema, AnalyzedRLS } from '../../types';
import type { RLSBypass } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

/**
 * Get the import statement needed for RLS context functionality
 *
 * @returns Empty string - no imports needed for browser-compatible RLS context
 */
export function getRLSImports(): string {
  // No longer importing async_hooks - using browser-compatible context storage
  return '';
}

/**
 * Generate RLS context types and interceptor infrastructure
 *
 * Uses a production-ready interceptor pattern like axios/fetch wrappers.
 * User configures auth once via onRequest interceptor, errors via onError.
 */
export function generateRLSContextType(code: CodeBuilder): void {
  code.comment('=============================================================================');
  code.comment('RLS Context & Client Configuration');
  code.comment('');
  code.comment('Production-ready interceptor pattern for centralized auth and error handling.');
  code.comment('Configure once at app startup, auth headers are added to every request.');
  code.comment('=============================================================================');
  code.line();

  code.comment('RLS Context - internal type for mock RLS simulation (not exported)');
  code.block('interface RLSContext {', () => {
    code.line('[key: string]: unknown;');
  }, '}');
  code.line();

  code.comment('Request context passed to onRequest interceptor');
  code.block('export interface RequestContext {', () => {
    code.line('headers: Record<string, string>;');
    code.line('operation: string;  // e.g., "post.list", "user.create"');
  }, '}');
  code.line();

  code.comment('API Error with HTTP-like status codes');
  code.block('export class ApiError extends Error {', () => {
    code.line('readonly status: number;');
    code.line('readonly code: string;');
    code.line('readonly operation: string;');
    code.line();
    code.block('constructor(message: string, status: number, code: string, operation: string) {', () => {
      code.line('super(message);');
      code.line('this.name = "ApiError";');
      code.line('this.status = status;');
      code.line('this.code = code;');
      code.line('this.operation = operation;');
    });
  }, '}');
  code.line();

  code.multiDocComment([
    'Client configuration for interceptors.',
    '',
    '@example',
    '```typescript',
    'const api = createClient({',
    '  onRequest: (ctx) => {',
    '    const token = localStorage.getItem("token");',
    '    if (token) {',
    '      ctx.headers.Authorization = `Bearer ${token}`;',
    '    }',
    '    return ctx;',
    '  },',
    '  onError: (error) => {',
    '    if (error.status === 401) {',
    '      window.location.href = "/login";',
    '    }',
    '  }',
    '});',
    '```',
  ]);
  code.block('export interface ClientConfig {', () => {
    code.multiDocComment([
      'Called before each API operation.',
      'Use this to add auth headers, logging, etc.',
    ]);
    code.line('onRequest?: (ctx: RequestContext) => RequestContext | Promise<RequestContext>;');
    code.line();
    code.multiDocComment([
      'Called when an error occurs.',
      'Use this for centralized error handling (401 redirect, toast notifications, etc.)',
    ]);
    code.line('onError?: (error: ApiError) => void | Promise<void>;');
  }, '}');
  code.line();

  code.comment('Decode JWT payload without validation (mock mode trusts the token)');
  code.block('function decodeJwtPayload(token: string): RLSContext | null {', () => {
    code.block('try {', () => {
      code.line('const parts = token.split(".");');
      code.line('if (parts.length !== 3) return null;');
      code.line();
      code.line('const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");');
      code.line('const decoded = typeof atob === "function"');
      code.line('  ? atob(payload)');
      code.line('  : Buffer.from(payload, "base64").toString("utf-8");');
      code.line();
      code.line('return JSON.parse(decoded);');
    }, '} catch {');
    code.indent();
    code.line('return null;');
    code.dedent();
    code.line('}');
  });
  code.line();

  code.comment('Extract RLS context from request headers');
  code.block('function extractContextFromHeaders(headers: Record<string, string>): RLSContext | null {', () => {
    code.line('const authHeader = headers["Authorization"] || headers["authorization"];');
    code.line('if (!authHeader) return null;');
    code.line();
    code.line('const token = authHeader.startsWith("Bearer ")');
    code.line('  ? authHeader.slice(7)');
    code.line('  : authHeader;');
    code.line();
    code.line('return token ? decodeJwtPayload(token) : null;');
  });
  code.line();
}

/**
 * Collect all unique bypass conditions from schemas
 */
export function collectBypassConditions(schemas: AnalyzedSchema[]): RLSBypass[] {
  const bypassMap = new Map<string, Set<string>>();

  for (const schema of schemas) {
    for (const bypass of schema.rls.bypass) {
      if (!bypassMap.has(bypass.contextKey)) {
        bypassMap.set(bypass.contextKey, new Set());
      }
      for (const val of bypass.values) {
        bypassMap.get(bypass.contextKey)!.add(val);
      }
    }
  }

  return Array.from(bypassMap.entries()).map(([contextKey, values]) => ({
    contextKey,
    values: Array.from(values),
  }));
}

/**
 * Generate bypass check helper for generic context
 */
export function generateBypassCheck(code: CodeBuilder, bypassConditions: RLSBypass[]): void {
  if (bypassConditions.length === 0) {
    code.block('function checkBypass(_ctx: RLSContext | null): boolean {', () => {
      code.line('return false;');
    });
    return;
  }

  code.block('function checkBypass(ctx: RLSContext | null): boolean {', () => {
    code.line('if (!ctx) return false;');

    for (const bypass of bypassConditions) {
      const valuesStr = bypass.values.map((v: string) => `'${v}'`).join(', ');
      code.line(`if ([${valuesStr}].includes(ctx.${bypass.contextKey} as string)) return true;`);
    }

    code.line('return false;');
  });
}

/**
 * Generate RLS filter function for an entity (generic context-based)
 *
 * @returns The function name for the generated filter
 */
export function generateEntityRLSFilter(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  operation: 'select' | 'insert' | 'update' | 'delete'
): string {
  const { pascalName, rls } = schema;
  const funcName = `rls${pascalName}${operation.charAt(0).toUpperCase() + operation.slice(1)}`;

  if (!rls.enabled) {
    // Generate a passthrough function
    code.block(`function ${funcName}(_row: Record<string, unknown>, _ctx: RLSContext | null): boolean {`, () => {
      code.line('return true;');
    });
    return funcName;
  }

  code.block(`function ${funcName}(row: Record<string, unknown>, ctx: RLSContext | null): boolean {`, () => {
    // Check bypass conditions first
    if (rls.bypass.length > 0) {
      code.line('if (checkBypass(ctx)) return true;');
      code.line();
    }

    // Apply scope mappings (row.field === ctx.contextKey)
    if (rls.scope.length > 0) {
      for (const mapping of rls.scope) {
        code.line(`// Scope: ${mapping.field} must match context.${mapping.contextKey}`);
        code.line(`if (!ctx || row.${mapping.field} !== ctx.${mapping.contextKey}) return false;`);
      }
      code.line('return true;');
    } else if (rls.original?.[operation]) {
      // Has custom function - placeholder for users to customize
      code.comment(`Custom ${operation} policy defined - implement in generated code`);
      code.line('return true;');
    } else {
      // No policy defined for this operation
      code.line('return true;');
    }
  });

  return funcName;
}

/**
 * Check if any schema has RLS enabled
 */
export function hasAnyRLS(schemas: AnalyzedSchema[]): boolean {
  return schemas.some((s) => s.rls.enabled);
}

/**
 * Generate RLS error helper (uses ApiError)
 */
export function generateRLSError(code: CodeBuilder): void {
  code.comment('Helper to create RLS denial error');
  code.block('function createRLSError(operation: string, entity: string): ApiError {', () => {
    code.line('return new ApiError(');
    code.line('  `Access denied: ${operation} on ${entity}`,');
    code.line('  403,');
    code.line('  "RLS_DENIED",');
    code.line('  `${entity}.${operation}`');
    code.line(');');
  });
  code.line();
}

/**
 * Generate not found error helper (uses ApiError)
 * Always needed regardless of RLS status
 */
export function generateNotFoundError(code: CodeBuilder): void {
  code.comment('Helper to create not found error');
  code.block('function createNotFoundError(entity: string, id: string): ApiError {', () => {
    code.line('return new ApiError(');
    code.line('  `${entity} not found: ${id}`,');
    code.line('  404,');
    code.line('  "NOT_FOUND",');
    code.line('  `${entity}.get`');
    code.line(');');
  });
  code.line();
}
