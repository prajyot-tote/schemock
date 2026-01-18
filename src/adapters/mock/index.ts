/**
 * MockAdapter Public API
 *
 * Unified mock adapter with pluggable storage backends and middleware support.
 *
 * @module adapters/mock
 * @category MockAdapter
 */

// Main adapter
export { MockAdapter, createMockAdapter } from './adapter';
export type { MockAdapterConfig } from './adapter';

// Data generation utilities
export { DataGenerator, dataGenerator } from './generator';
export { generateFactory, generateFactories } from './factory';

// Re-export storage drivers for convenience (in-memory and persistent)
export { MswStorageDriver, MemoryStorageDriver, LocalStorageDriver } from '../../storage';
export type { StorageDriver, StorageDriverConfig, QueryOptions, QueryMeta, LocalStorageDriverConfig } from '../../storage';
