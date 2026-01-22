/**
 * Frontend Middleware Generator
 *
 * Generates middleware configuration for frontend adapters (mock, supabase, pglite).
 * Reads from unified config.middleware and generates code that configures
 * the runtime middleware from schemock/middleware.
 *
 * @module cli/generators/frontend-middleware
 * @category CLI
 */

import type {
  SchemockConfig,
  MiddlewareConfig,
  AnalyzedMiddleware,
  AnalyzedSchema,
} from '../../types';
import { CodeBuilder } from '../../utils/code-builder';
import { hasAnyRLS } from '../shared/rls';

export { generateFrontendMiddlewareChain } from './middleware-chain';
export { generateFrontendInterceptor } from './interceptor';

/**
 * Result of frontend middleware generation
 */
export interface FrontendMiddlewareGenerationResult {
  /** Generated middleware chain file content */
  middlewareChain: string;
  /** Generated interceptor setup file content */
  interceptor: string;
}

/**
 * Generate all frontend middleware files
 */
export function generateFrontendMiddleware(
  schemas: AnalyzedSchema[],
  config: SchemockConfig,
  customMiddleware: AnalyzedMiddleware[] = []
): FrontendMiddlewareGenerationResult {
  const { generateFrontendMiddlewareChain } = require('./middleware-chain');
  const { generateFrontendInterceptor } = require('./interceptor');

  return {
    middlewareChain: generateFrontendMiddlewareChain(schemas, config, customMiddleware),
    interceptor: generateFrontendInterceptor(schemas, config, customMiddleware),
  };
}
