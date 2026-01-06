/**
 * Audit Logger - Security event logging with sensitive data redaction
 *
 * @module security/audit
 * @category Security
 */

import type { AuditAdapter, AuditEvent, AuditFilter, Action, Resource } from './types';

/**
 * Audit store interface for persisting audit events.
 */
export interface AuditStore {
  /** Save an audit event */
  save(event: AuditEvent): Promise<void>;
  /** Query audit events */
  find(filter: AuditFilter): Promise<AuditEvent[]>;
  /** Count audit events */
  count(filter: AuditFilter): Promise<number>;
}

/**
 * In-memory audit store implementation.
 */
export class MemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  async save(event: AuditEvent): Promise<void> {
    this.events.push(event);

    // Trim old events if over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  async find(filter: AuditFilter): Promise<AuditEvent[]> {
    let results = [...this.events];

    // Apply filters
    if (filter.userId) {
      results = results.filter((e) => e.userId === filter.userId);
    }
    if (filter.action) {
      const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
      results = results.filter((e) => actions.includes(e.action));
    }
    if (filter.resourceType) {
      results = results.filter((e) => e.resource.type === filter.resourceType);
    }
    if (filter.resourceId) {
      results = results.filter((e) => e.resource.id === filter.resourceId);
    }
    if (filter.outcome) {
      results = results.filter((e) => e.outcome === filter.outcome);
    }
    if (filter.dateRange) {
      results = results.filter(
        (e) => e.timestamp >= filter.dateRange!.from && e.timestamp <= filter.dateRange!.to
      );
    }

    // Sort
    const orderBy = filter.orderBy ?? 'timestamp';
    const orderDir = filter.orderDir ?? 'desc';
    results.sort((a, b) => {
      const aVal = a[orderBy as keyof AuditEvent];
      const bVal = b[orderBy as keyof AuditEvent];
      // Handle undefined values - sort them to the end
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return orderDir === 'asc' ? cmp : -cmp;
    });

    // Paginate
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async count(filter: AuditFilter): Promise<number> {
    const results = await this.find({ ...filter, limit: undefined, offset: undefined });
    return results.length;
  }

  /**
   * Clear all events.
   */
  clear(): void {
    this.events = [];
  }
}

/**
 * Default fields to redact from audit logs.
 */
const DEFAULT_REDACT_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'creditCard',
  'ssn',
  'socialSecurity',
];

/**
 * Audit logger options.
 */
export interface AuditLoggerOptions {
  /** Store for persisting events */
  store: AuditStore;
  /** Fields to redact from logs */
  redactFields?: string[];
  /** Custom redaction function */
  redact?: (value: unknown, key: string) => unknown;
  /** Whether to include request metadata */
  includeMetadata?: boolean;
}

/**
 * Create an audit logger.
 *
 * @param options - Audit logger options
 * @returns AuditAdapter instance
 *
 * @example
 * ```typescript
 * const store = new MemoryAuditStore();
 * const auditLogger = createAuditLogger({ store });
 *
 * await auditLogger.log({
 *   id: 'evt-123',
 *   timestamp: new Date(),
 *   userId: 'user-456',
 *   action: 'delete',
 *   resource: { type: 'post', id: 'post-789' },
 *   outcome: 'success',
 * });
 * ```
 */
export function createAuditLogger(options: AuditLoggerOptions): AuditAdapter {
  const {
    store,
    redactFields = DEFAULT_REDACT_FIELDS,
    redact: customRedact,
    includeMetadata = true,
  } = options;

  /**
   * Redact sensitive data from an object.
   */
  function redactSensitiveData(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(redactSensitiveData);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Check if field should be redacted
      const shouldRedact = redactFields.some((field) =>
        key.toLowerCase().includes(field.toLowerCase())
      );

      if (shouldRedact) {
        result[key] = customRedact ? customRedact(value, key) : '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = redactSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return {
    async log(event: AuditEvent): Promise<void> {
      // Redact sensitive data from changes
      const sanitizedEvent: AuditEvent = {
        ...event,
        changes: event.changes
          ? {
              before: redactSensitiveData(event.changes.before) as Record<string, unknown>,
              after: redactSensitiveData(event.changes.after) as Record<string, unknown>,
            }
          : undefined,
        metadata: includeMetadata
          ? (redactSensitiveData(event.metadata) as Record<string, unknown>)
          : undefined,
      };

      await store.save(sanitizedEvent);
    },

    async query(filter: AuditFilter): Promise<AuditEvent[]> {
      return store.find(filter);
    },
  };
}

/**
 * Create an audit event.
 *
 * @param params - Event parameters
 * @returns Complete audit event
 */
export function createAuditEvent(params: {
  userId?: string;
  action: Action;
  resource: Resource;
  outcome: 'success' | 'failure' | 'denied';
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
}): AuditEvent {
  return {
    id: generateEventId(),
    timestamp: new Date(),
    ...params,
  };
}

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create an audit middleware.
 *
 * @param logger - Audit logger instance
 * @param getUser - Function to get current user ID
 * @returns Middleware
 *
 * @example
 * ```typescript
 * const auditMiddleware = createAuditMiddleware(auditLogger, () => currentUserId);
 * ```
 */
export function createAuditMiddleware(
  logger: AuditAdapter,
  getUser: () => string | undefined,
  getRequestInfo?: () => { ip?: string; userAgent?: string }
) {
  return {
    name: 'audit',
    after: async <T>(
      ctx: { entity: string; operation: string; data?: unknown },
      response: { data: T; error?: Error }
    ) => {
      const requestInfo = getRequestInfo?.() ?? {};

      await logger.log({
        id: generateEventId(),
        timestamp: new Date(),
        userId: getUser(),
        action: ctx.operation as Action,
        resource: {
          type: ctx.entity,
        },
        outcome: response.error ? 'failure' : 'success',
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
        metadata: {
          hasData: !!ctx.data,
        },
      });

      return response;
    },
  };
}
