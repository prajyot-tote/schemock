/**
 * Storage Drivers - Export all available storage driver implementations
 *
 * @module storage/drivers
 * @category Storage
 *
 * Available drivers:
 *   - MemoryStorageDriver: In-memory only (JS Maps, fast, non-persistent)
 *   - MswStorageDriver: In-memory only (@mswjs/data, realistic mocks)
 *   - LocalStorageDriver: Persistent (browser localStorage, survives reloads)
 *   - PGlite: Persistent (browser IndexedDB/OPFS, PostgreSQL compatible)
 *
 * Schemock is NOT limited to in-memory mocks. Persistent storage is fully supported.
 */

export { MemoryStorageDriver } from './memory';
export { MswStorageDriver } from './msw';
export { LocalStorageDriver } from './localStorage';
export type { LocalStorageDriverConfig } from './localStorage';
