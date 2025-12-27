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
 * @returns Import statement for AsyncLocalStorage
 */
export function getRLSImports(): string {
  return "import { AsyncLocalStorage } from 'async_hooks';";
}

/**
 * Generate generic RLS context type definition
 *
 * Uses AsyncLocalStorage for thread-safe request-scoped context.
 * This prevents context leakage between concurrent async operations.
 *
 * NOTE: Caller must add the import from getRLSImports() at the top of the file.
 */
export function generateRLSContextType(code: CodeBuilder): void {
  code.comment('Row-Level Security Context (generic key-value)');
  code.block('export interface RLSContext {', () => {
    code.line('[key: string]: unknown;');
  }, '}');
  code.line();

  code.comment('=============================================================================');
  code.comment('Thread-Safe RLS Context using AsyncLocalStorage');
  code.comment('');
  code.comment('AsyncLocalStorage provides request-scoped context that is safe for concurrent');
  code.comment('async operations. Each async execution context gets its own isolated context,');
  code.comment('preventing context leakage between requests.');
  code.comment('=============================================================================');
  code.line();

  code.comment('Create storage for RLS context - each async context gets isolated storage');
  code.line('const rlsContextStorage = new AsyncLocalStorage<RLSContext | null>();');
  code.line();

  code.comment('Legacy global fallback for environments without AsyncLocalStorage support');
  code.line('let legacyContext: RLSContext | null = null;');
  code.line();

  code.multiDocComment([
    'Set RLS context for the current async execution context.',
    '',
    '@param ctx - The RLS context to set, or null to clear',
    '',
    '@example',
    '```typescript',
    '// Set context for a request',
    "setContext({ userId: 'user-123', role: 'admin' });",
    '',
    '// Clear context',
    'setContext(null);',
    '```',
  ]);
  code.block('export function setContext(ctx: RLSContext | null): void {', () => {
    code.comment('Store in legacy global for backward compatibility');
    code.line('legacyContext = ctx;');
  });
  code.line();

  code.multiDocComment([
    'Get RLS context for the current async execution context.',
    '',
    '@returns The current RLS context, or null if not set',
  ]);
  code.block('export function getContext(): RLSContext | null {', () => {
    code.comment('Try AsyncLocalStorage first (thread-safe)');
    code.line('const asyncCtx = rlsContextStorage.getStore();');
    code.line('if (asyncCtx !== undefined) return asyncCtx;');
    code.line();
    code.comment('Fall back to legacy global context');
    code.line('return legacyContext;');
  });
  code.line();

  code.multiDocComment([
    'Run a function with RLS context bound to the async execution context.',
    'This is the recommended way to set context for request handlers.',
    '',
    '@param ctx - The RLS context to use',
    '@param fn - The function to run with the context',
    '@returns The result of the function',
    '',
    '@example',
    '```typescript',
    '// Express middleware',
    'app.use((req, res, next) => {',
    "  const ctx = { userId: req.user.id, role: req.user.role };",
    '  runWithContext(ctx, () => {',
    '    next();',
    '  });',
    '});',
    '',
    '// Async function',
    "const result = await runWithContext({ userId: '123' }, async () => {",
    '  return await api.posts.list();',
    '});',
    '```',
  ]);
  code.block('export function runWithContext<T>(ctx: RLSContext | null, fn: () => T): T {', () => {
    code.line('return rlsContextStorage.run(ctx, fn);');
  });
  code.line();

  code.multiDocComment([
    'Async version of runWithContext for async functions.',
    '',
    '@param ctx - The RLS context to use',
    '@param fn - The async function to run with the context',
    '@returns Promise resolving to the result of the function',
  ]);
  code.block('export async function runWithContextAsync<T>(ctx: RLSContext | null, fn: () => Promise<T>): Promise<T> {', () => {
    code.line('return rlsContextStorage.run(ctx, fn);');
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
 * Generate RLS error class
 */
export function generateRLSError(code: CodeBuilder): void {
  code.comment('RLS Error for unauthorized access');
  code.block('export class RLSError extends Error {', () => {
    code.line('readonly code = "RLS_DENIED";');
    code.block('constructor(operation: string, entity: string) {', () => {
      code.line('super(`Access denied: ${operation} on ${entity}`);');
      code.line('this.name = "RLSError";');
    });
  }, '}');
  code.line();
}
