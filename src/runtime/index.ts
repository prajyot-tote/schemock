/**
 * Schemock Runtime - Resolver system and setup utilities
 *
 * @module runtime
 * @category Runtime
 */

// Re-export resolver system
export * from './resolver';

// Re-export setup and seed functions
export { setup, teardown, isInitialized, getAdapter, setAdapter } from './setup';
export type { SetupOptions } from './setup';

export { seed, reset, seedWithRelations } from './seed';

export { createHandlers } from './handlers';
export type { HandlerOptions } from './handlers';
