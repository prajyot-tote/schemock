/**
 * Unified generators for production-ready code
 *
 * These generators produce code that works identically with
 * both mock (MSW) and production backends.
 *
 * @module cli/generators/unified
 * @category CLI
 */

export { generateUnifiedClient, type UnifiedClientConfig } from './client';
export {
  generateEntityService,
  generateServices,
  generateServicesIndex,
  generateEndpointService,
  type ServiceGeneratorConfig,
} from './service';
export {
  generateWithMiddleware,
  type WithMiddlewareConfig,
  type MiddlewareOperation,
} from './with-middleware';
export {
  generateUnifiedHandlers,
  generateNextjsRouteFile,
  generateNextjsDynamicRouteFile,
  type HandlerGeneratorConfig,
  type HandlerTarget,
} from './handler';
