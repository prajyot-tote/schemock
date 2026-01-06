/**
 * Logger Middleware - Request/response logging
 *
 * Logs request and response information for debugging
 * and monitoring purposes.
 *
 * @module middleware/logger
 * @category Middleware
 */

import type { AdapterResponse } from '../adapters/types';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Log level type.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuration options for logger middleware.
 */
export interface LoggerMiddlewareConfig {
  /** Custom log function (default: console.log) */
  log?: (message: string, data?: unknown) => void;
  /** Whether to log requests (default: true) */
  logRequest?: boolean;
  /** Whether to log responses (default: true) */
  logResponse?: boolean;
  /** Whether to log errors (default: true) */
  logErrors?: boolean;
  /** Whether to log timing information (default: true) */
  logTiming?: boolean;
  /** Minimum log level (default: 'debug') */
  level?: LogLevel;
  /** Custom formatter for log messages */
  formatter?: (type: 'request' | 'response' | 'error', ctx: MiddlewareContext, data?: unknown) => string;
  /** Whether to include request data in logs (be careful with sensitive data) */
  includeData?: boolean;
  /** Fields to redact from logs */
  redactFields?: string[];
}

/**
 * Default fields to redact from logs.
 */
const DEFAULT_REDACT_FIELDS = ['password', 'token', 'secret', 'apiKey', 'authorization'];

/**
 * Log level priorities.
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Create a logger middleware.
 *
 * @param config - Logger middleware configuration
 * @returns A configured Middleware instance
 *
 * @example
 * ```typescript
 * const loggerMiddleware = createLoggerMiddleware({
 *   log: console.log,
 *   logRequest: true,
 *   logResponse: true,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom logger
 * const loggerMiddleware = createLoggerMiddleware({
 *   log: (msg, data) => winston.info(msg, data),
 *   formatter: (type, ctx) => `[${type.toUpperCase()}] ${ctx.entity}.${ctx.operation}`,
 * });
 * ```
 */
export function createLoggerMiddleware(config?: LoggerMiddlewareConfig): Middleware {
  const {
    log = console.log.bind(console),
    logRequest = true,
    logResponse = true,
    logErrors = true,
    logTiming = true,
    level = 'debug',
    formatter,
    includeData = false,
    redactFields = DEFAULT_REDACT_FIELDS,
  } = config ?? {};

  /**
   * Check if a log level should be logged.
   */
  function shouldLog(msgLevel: LogLevel): boolean {
    return LOG_LEVELS[msgLevel] >= LOG_LEVELS[level];
  }

  /**
   * Redact sensitive fields from an object.
   */
  function redact(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(redact);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (redactFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Format a log message.
   */
  function format(
    type: 'request' | 'response' | 'error',
    ctx: MiddlewareContext,
    data?: unknown
  ): string {
    if (formatter) {
      return formatter(type, ctx, data);
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [schemock]`;

    switch (type) {
      case 'request':
        return `${prefix} → ${ctx.operation.toUpperCase()} ${ctx.entity}`;
      case 'response': {
        const duration = ctx.startTime ? Date.now() - ctx.startTime : 0;
        const timing = logTiming ? ` (${duration}ms)` : '';
        return `${prefix} ← ${ctx.operation.toUpperCase()} ${ctx.entity}${timing}`;
      }
      case 'error':
        return `${prefix} ✗ ${ctx.operation.toUpperCase()} ${ctx.entity} ERROR`;
    }
  }

  return {
    name: 'logger',

    async before(ctx: MiddlewareContext) {
      if (!logRequest || !shouldLog('debug')) {
        return;
      }

      const message = format('request', ctx);
      const data: Record<string, unknown> = {
        entity: ctx.entity,
        operation: ctx.operation,
      };

      if (ctx.params) {
        data.params = redact(ctx.params);
      }

      if (ctx.filter) {
        data.filter = redact(ctx.filter);
      }

      if (includeData && ctx.data) {
        data.data = redact(ctx.data);
      }

      log(message, data);
    },

    async after<T>(ctx: MiddlewareContext, response: AdapterResponse<T>) {
      if (!logResponse || !shouldLog('info')) {
        return response;
      }

      const message = format('response', ctx);
      const data: Record<string, unknown> = {
        entity: ctx.entity,
        operation: ctx.operation,
        success: !response.error,
      };

      if (logTiming && ctx.startTime) {
        data.duration = Date.now() - ctx.startTime;
      }

      if (response.meta) {
        data.meta = response.meta;
      }

      // Include cached status if available
      if (ctx.metadata.cacheHit !== undefined) {
        data.cached = ctx.metadata.cacheHit;
      }

      // Include retry count if any
      if (ctx.retryCount && ctx.retryCount > 0) {
        data.retryCount = ctx.retryCount;
      }

      log(message, data);

      return response;
    },

    async onError(ctx: MiddlewareContext, error: Error) {
      if (!logErrors || !shouldLog('error')) {
        return { continue: true };
      }

      const message = format('error', ctx);
      const data: Record<string, unknown> = {
        entity: ctx.entity,
        operation: ctx.operation,
        error: error.message,
      };

      if (logTiming && ctx.startTime) {
        data.duration = Date.now() - ctx.startTime;
      }

      log(message, data);

      // Continue error propagation
      return { continue: true };
    },
  };
}

/**
 * Create a silent logger (logs nothing).
 * Useful for testing.
 */
export function createSilentLogger(): Middleware {
  return createLoggerMiddleware({
    log: () => {},
    logRequest: false,
    logResponse: false,
    logErrors: false,
  });
}

/**
 * Create a verbose logger (logs everything).
 * Useful for debugging.
 */
export function createVerboseLogger(): Middleware {
  return createLoggerMiddleware({
    logRequest: true,
    logResponse: true,
    logErrors: true,
    logTiming: true,
    includeData: true,
    level: 'debug',
  });
}
