/**
 * Security Types - Interfaces for security features
 *
 * @module security/types
 * @category Security
 */

import type { z } from 'zod';

/**
 * Security adapter interface for validation and authorization.
 */
export interface SecurityAdapter {
  /**
   * Validate data against a Zod schema.
   *
   * @param schema - The Zod schema to validate against
   * @param data - The data to validate
   * @returns Validated and typed data
   * @throws ZodError if validation fails
   */
  validate<T>(schema: z.ZodSchema<T>, data: unknown): T;

  /**
   * Sanitize string input to prevent XSS.
   *
   * @param input - Raw string input
   * @returns Sanitized string
   */
  sanitize(input: string): string;

  /**
   * Check if user can perform action on resource.
   *
   * @param action - The action being performed
   * @param resource - The resource being accessed
   * @returns True if allowed
   */
  can(action: Action, resource: Resource): boolean;

  /**
   * Check rate limit for a key.
   *
   * @param key - Rate limit key (e.g., user ID, IP)
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult>;
}

/**
 * Audit adapter interface for logging security events.
 */
export interface AuditAdapter {
  /**
   * Log an audit event.
   *
   * @param event - The audit event to log
   */
  log(event: AuditEvent): Promise<void>;

  /**
   * Query audit events.
   *
   * @param filter - Filter criteria
   * @returns Matching audit events
   */
  query(filter: AuditFilter): Promise<AuditEvent[]>;
}

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional: key prefix for namespacing */
  keyPrefix?: string;
  /** Optional: skip rate limiting for certain conditions */
  skip?: (key: string) => boolean;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Seconds until rate limit resets (if blocked) */
  retryAfter?: number;
  /** Total limit */
  limit: number;
  /** Time when the window resets */
  resetTime: number;
}

/**
 * Action types for authorization.
 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'list' | string;

/**
 * Resource descriptor for authorization.
 */
export interface Resource {
  /** Resource type (entity name) */
  type: string;
  /** Resource ID (optional, for specific item access) */
  id?: string;
  /** Additional attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Audit event structure.
 */
export interface AuditEvent {
  /** Event ID */
  id: string;
  /** Event timestamp */
  timestamp: Date;
  /** User who triggered the event */
  userId?: string;
  /** Action performed */
  action: Action;
  /** Resource affected */
  resource: Resource;
  /** Event outcome */
  outcome: 'success' | 'failure' | 'denied';
  /** IP address */
  ip?: string;
  /** User agent */
  userAgent?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Changes made (for update operations) */
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

/**
 * Filter for querying audit events.
 */
export interface AuditFilter {
  /** Filter by user ID */
  userId?: string;
  /** Filter by action */
  action?: Action | Action[];
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by outcome */
  outcome?: 'success' | 'failure' | 'denied';
  /** Filter by date range */
  dateRange?: {
    from: Date;
    to: Date;
  };
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Ordering */
  orderBy?: 'timestamp' | 'action';
  orderDir?: 'asc' | 'desc';
}

/**
 * Row-level security policy.
 */
export interface RLSPolicy<T = unknown> {
  /** Policy name */
  name: string;
  /** Entity this policy applies to */
  entity: string;
  /** Action this policy applies to */
  action: Action | Action[] | 'all';
  /** Filter function that returns allowed rows */
  filter: (row: T, user: User | null) => boolean;
  /** Optional: whether to apply on read */
  applyOnRead?: boolean;
  /** Optional: whether to apply on write */
  applyOnWrite?: boolean;
}

/**
 * User context for authorization.
 */
export interface User {
  /** User ID */
  id: string;
  /** User roles */
  roles?: string[];
  /** User permissions */
  permissions?: string[];
  /** Additional attributes */
  attributes?: Record<string, unknown>;
}

/**
 * RBAC role definition.
 */
export interface Role {
  /** Role name */
  name: string;
  /** Permissions granted by this role */
  permissions: Permission[];
  /** Optional: parent role (for hierarchy) */
  inherits?: string[];
}

/**
 * Permission definition.
 */
export interface Permission {
  /** Resource type */
  resource: string;
  /** Allowed actions */
  actions: Action[];
  /** Optional: conditions for this permission */
  conditions?: Record<string, unknown>;
}
