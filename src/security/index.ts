/**
 * Schemock Security - Security features for data layer
 *
 * @module security
 * @category Security
 */

// Re-export types
export type {
  SecurityAdapter,
  AuditAdapter,
  RateLimitConfig,
  RateLimitResult,
  Action,
  Resource,
  AuditEvent,
  AuditFilter,
  RLSPolicy,
  User,
  Role,
  Permission,
} from './types';

// Re-export RLS
export {
  applyRLS,
  createOwnerPolicy,
  createRolePolicy,
  createPublicPolicy,
  createStatusPolicy,
  createRLSMiddleware,
} from './rls';

// Re-export Rate Limiter
export { RateLimiter, createRateLimitMiddleware } from './rate-limit';

// Re-export Audit
export {
  createAuditLogger,
  createAuditEvent,
  createAuditMiddleware,
  MemoryAuditStore,
} from './audit';
export type { AuditStore, AuditLoggerOptions } from './audit';
