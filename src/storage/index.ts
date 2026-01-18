/**
 * Storage Module - Abstract storage interface and implementations
 *
 * Provides a unified StorageDriver interface that allows the MockAdapter
 * to work with different storage backends:
 *   - In-memory: MswStorageDriver (mswjs/data), MemoryStorageDriver (JS Maps)
 *   - Persistent: LocalStorageDriver (localStorage), PGlite (IndexedDB/OPFS), and more
 *
 * Schemock is NOT limited to in-memory mocks. Persistent storage is fully supported.
 *
 * @module storage
 * @category Storage
 *
 * @example
 * ```typescript
 * import { MemoryStorageDriver, MswStorageDriver, LocalStorageDriver } from 'schemock/storage';
 *
 * // Use memory driver for simple tests (in-memory only)
 * const memoryDriver = new MemoryStorageDriver();
 * await memoryDriver.initialize(schemas);
 *
 * // Use MSW driver for realistic in-memory mocking
 * const mswDriver = new MswStorageDriver();
 * await mswDriver.initialize(schemas);
 *
 * // Use LocalStorage driver for persistent browser storage
 * const localStorageDriver = new LocalStorageDriver();
 * await localStorageDriver.initialize(schemas);
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
export { MemoryStorageDriver, MswStorageDriver, LocalStorageDriver } from './drivers';
export type { LocalStorageDriverConfig } from './drivers';
