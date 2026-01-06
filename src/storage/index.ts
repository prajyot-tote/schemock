/**
 * Storage Module - Abstract storage interface and implementations
 *
 * Provides a unified StorageDriver interface that allows the MockAdapter
 * to work with different storage backends (MSW, Memory, PGlite, etc.)
 *
 * @module storage
 * @category Storage
 *
 * @example
 * ```typescript
 * import { MemoryStorageDriver, MswStorageDriver } from 'schemock/storage';
 *
 * // Use memory driver for simple tests
 * const memoryDriver = new MemoryStorageDriver();
 * await memoryDriver.initialize(schemas);
 *
 * // Use MSW driver for realistic mocking
 * const mswDriver = new MswStorageDriver();
 * await mswDriver.initialize(schemas);
 * ```
 */

// Types
export type {
  StorageDriver,
  StorageDriverConfig,
  QueryOptions,
  QueryMeta,
} from './types';

// Drivers
export { MemoryStorageDriver, MswStorageDriver } from './drivers';
