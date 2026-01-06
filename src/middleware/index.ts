/**
 * Schemock Middleware - Request/response interceptors and utilities
 *
 * @module middleware
 * @category Middleware
 */

// Re-export types
export type {
  Middleware,
  MiddlewareFunction,
  MiddlewareContext,
  MiddlewareResult,
} from './types';

// Re-export MiddlewareChain
export { MiddlewareChain, createMiddlewareChain } from './chain';

// Re-export middleware factories
export { createAuthMiddleware } from './auth';
export type { AuthMiddlewareConfig } from './auth';

export { createRetryMiddleware } from './retry';
export type { RetryMiddlewareConfig } from './retry';

export {
  createCacheMiddleware,
  createCacheInvalidator,
  MemoryCacheStorage,
} from './cache';
export type {
  CacheMiddlewareConfig,
  CacheStorage,
  CacheEntry,
} from './cache';

export {
  createLoggerMiddleware,
  createSilentLogger,
  createVerboseLogger,
} from './logger';
export type { LoggerMiddlewareConfig, LogLevel } from './logger';

// Context middleware
export { createContextMiddleware, createMockJwt } from './context';
export type { ContextMiddlewareConfig } from './context';

// RLS middleware
export {
  createRLSMiddleware,
  createBypassCheck,
  RLSError,
} from './rls-middleware';
export type {
  RLSMiddlewareConfig,
  RLSFilters,
  RLSFilter,
} from './rls-middleware';

// Middleware defaults and ordering
export {
  DEFAULT_MIDDLEWARE_ORDER,
  orderMiddleware,
  filterMiddleware,
  MOCK_MIDDLEWARE_PRESET,
  PRODUCTION_MIDDLEWARE_PRESET,
  TEST_MIDDLEWARE_PRESET,
} from './defaults';
