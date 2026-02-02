/**
 * Shared analysis utilities for Schemock CLI
 *
 * Contains helper functions for resolving middleware references
 * and other common analysis tasks.
 *
 * @module cli/analyze-utils
 * @category CLI
 */

import { isMiddlewareSchema, isMiddlewareWithConfig, type MiddlewareReference } from '../schema/types';
import type { AnalyzedMiddlewareRef, AnalyzedMiddleware } from './types';
import { toPascalCase } from './utils/pluralize';

/**
 * Resolve a middleware reference to its analyzed form.
 *
 * Handles both direct middleware schema references and
 * configured references created via `.with()`.
 *
 * @param ref - The middleware reference to resolve
 * @param middlewareMap - Optional map of middleware names to analyzed middleware
 * @returns The resolved AnalyzedMiddlewareRef
 *
 * @example
 * ```typescript
 * // Direct reference
 * const ref1 = resolveMiddlewareRef(authMiddleware, middlewareMap);
 * // { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false }
 *
 * // Configured reference with .with()
 * const ref2 = resolveMiddlewareRef(rateLimitMiddleware.with({ max: 10 }), middlewareMap);
 * // { name: 'rate-limit', pascalName: 'RateLimit', hasConfigOverrides: true, configOverrides: { max: 10 } }
 * ```
 */
export function resolveMiddlewareRef(
  ref: MiddlewareReference<any>,
  middlewareMap?: Map<string, AnalyzedMiddleware>
): AnalyzedMiddlewareRef {
  if (isMiddlewareWithConfig(ref)) {
    // It's a .with() configured reference
    const middleware = ref.middleware;
    return {
      name: middleware.name,
      pascalName: toPascalCase(middleware.name),
      hasConfigOverrides: true,
      configOverrides: ref.configOverrides as Record<string, unknown>,
      middleware: middlewareMap?.get(middleware.name),
    };
  } else if (isMiddlewareSchema(ref)) {
    // Direct middleware reference
    return {
      name: ref.name,
      pascalName: toPascalCase(ref.name),
      hasConfigOverrides: false,
      middleware: middlewareMap?.get(ref.name),
    };
  }

  // This shouldn't happen if types are correct, but provide a fallback
  throw new Error(`Invalid middleware reference: ${JSON.stringify(ref)}`);
}

/**
 * Resolve an array of middleware references to analyzed form.
 *
 * @param refs - Array of middleware references to resolve
 * @param middlewareMap - Optional map of middleware names to analyzed middleware
 * @returns Array of resolved AnalyzedMiddlewareRef, or undefined if refs is empty/undefined
 *
 * @example
 * ```typescript
 * const refs = resolveMiddlewareRefs([authMiddleware, rateLimitMiddleware.with({ max: 10 })], middlewareMap);
 * // [
 * //   { name: 'auth', pascalName: 'Auth', hasConfigOverrides: false },
 * //   { name: 'rate-limit', pascalName: 'RateLimit', hasConfigOverrides: true, configOverrides: { max: 10 } }
 * // ]
 * ```
 */
export function resolveMiddlewareRefs(
  refs: MiddlewareReference<any>[] | undefined,
  middlewareMap?: Map<string, AnalyzedMiddleware>
): AnalyzedMiddlewareRef[] | undefined {
  if (!refs || refs.length === 0) return undefined;
  return refs.map(ref => resolveMiddlewareRef(ref, middlewareMap));
}
