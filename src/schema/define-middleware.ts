/**
 * Backwards-compatible re-export of defineServerMiddleware as defineMiddleware.
 *
 * @module schema/define-middleware
 * @category Schema
 * @deprecated Use `defineServerMiddleware` for server-side middleware or
 *             `defineClientMiddleware` for client-side middleware instead.
 *
 * @example
 * ```typescript
 * // Old way (still works)
 * import { defineMiddleware } from 'schemock/schema';
 *
 * // New way (recommended)
 * import { defineServerMiddleware, defineClientMiddleware } from 'schemock/schema';
 * ```
 */

// Re-export defineServerMiddleware as defineMiddleware for backwards compatibility
export { defineServerMiddleware as defineMiddleware } from './define-server-middleware';
