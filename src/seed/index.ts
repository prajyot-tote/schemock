/**
 * Seed utilities for cross-entity references in production seeding
 *
 * @module seed
 * @category Seed
 *
 * @example
 * ```typescript
 * import { ref, lookup } from 'schemock/seed';
 *
 * export const seedConfig = {
 *   secret: 'my-secret',
 *   data: {
 *     users: [
 *       { email: 'admin@example.com', name: 'Admin', role: 'admin' },
 *     ],
 *     posts: [
 *       { title: 'Welcome', authorId: ref('users', 0) },
 *     ],
 *     rolePermissions: [
 *       { permissionId: lookup('permissions', { key: 'projects:read:all' }) },
 *     ],
 *   },
 * };
 * ```
 */

export {
  ref,
  lookup,
  isSeedReference,
  SEED_REF_BRAND,
  type SeedRef,
  type SeedLookup,
  type SeedReference,
} from './ref';
