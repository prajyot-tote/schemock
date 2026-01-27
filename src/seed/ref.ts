/**
 * Seed reference helpers for cross-entity references in production seeding
 *
 * These helpers allow users to reference records created during seeding
 * without hardcoding IDs. They produce marker objects that are resolved
 * at runtime by the generated `runProductionSeed()` function.
 *
 * @module seed/ref
 * @category Seed
 */

/**
 * Brand symbol used to identify seed reference markers at runtime.
 */
export const SEED_REF_BRAND = '__schemock_seed_ref__' as const;

/**
 * A reference to the N-th record created for an entity during seeding.
 *
 * @example
 * ```typescript
 * // Reference the first user's id
 * ref('users', 0)
 *
 * // Reference the second user's email
 * ref('users', 1, 'email')
 * ```
 */
export interface SeedRef {
  readonly [SEED_REF_BRAND]: true;
  readonly type: 'ref';
  readonly entity: string;
  readonly index: number;
  readonly field: string;
}

/**
 * A lookup reference that finds a record matching conditions during seeding.
 *
 * @example
 * ```typescript
 * // Find the user with role 'admin' and get their id
 * lookup('users', { role: 'admin' })
 *
 * // Find a permission by key and get its id
 * lookup('permissions', { key: 'projects:read:all' })
 * ```
 */
export interface SeedLookup {
  readonly [SEED_REF_BRAND]: true;
  readonly type: 'lookup';
  readonly entity: string;
  readonly where: Record<string, unknown>;
  readonly field: string;
}

/**
 * Union type for all seed reference markers.
 */
export type SeedReference = SeedRef | SeedLookup;

/**
 * Create a reference to the N-th record created for an entity.
 *
 * During `runProductionSeed()`, this marker is resolved to the actual
 * field value of the created record. The entity must be seeded before
 * any entity that references it (ordering is determined by `entityOrder`).
 *
 * @param entity - The entity key in `seedConfig.data` (e.g., `'users'`)
 * @param index - Zero-based index of the created record
 * @param field - Field to extract (default: `'id'`)
 * @returns A marker object resolved at seed time
 *
 * @example
 * ```typescript
 * import { ref } from 'schemock/seed';
 *
 * export const seedConfig = {
 *   secret: 'my-secret',
 *   data: {
 *     users: [
 *       { email: 'admin@example.com', name: 'Admin' },
 *     ],
 *     posts: [
 *       { title: 'Welcome', authorId: ref('users', 0) },
 *     ],
 *   },
 * };
 * ```
 */
export function ref(entity: string, index: number, field: string = 'id'): SeedRef {
  return {
    [SEED_REF_BRAND]: true,
    type: 'ref',
    entity,
    index,
    field,
  } as const;
}

/**
 * Create a lookup reference that finds a record by field conditions.
 *
 * During `runProductionSeed()`, this marker is resolved by scanning
 * previously created records for the specified entity and finding the
 * first record where all `where` conditions match.
 *
 * @param entity - The entity key in `seedConfig.data` (e.g., `'permissions'`)
 * @param where - Conditions to match against (all must match)
 * @param field - Field to extract from the matched record (default: `'id'`)
 * @returns A marker object resolved at seed time
 *
 * @example
 * ```typescript
 * import { lookup } from 'schemock/seed';
 *
 * export const seedConfig = {
 *   secret: 'my-secret',
 *   data: {
 *     permissions: [
 *       { key: 'projects:read:all', label: 'Read All Projects' },
 *     ],
 *     rolePermissions: [
 *       { permissionId: lookup('permissions', { key: 'projects:read:all' }) },
 *     ],
 *   },
 * };
 * ```
 */
export function lookup(entity: string, where: Record<string, unknown>, field: string = 'id'): SeedLookup {
  return {
    [SEED_REF_BRAND]: true,
    type: 'lookup',
    entity,
    where,
    field,
  } as const;
}

/**
 * Check whether a value is a seed reference marker (`ref()` or `lookup()`).
 *
 * Used internally by generated code to detect markers that need resolution.
 *
 * @param value - The value to check
 * @returns `true` if the value is a `SeedRef` or `SeedLookup`
 */
export function isSeedReference(value: unknown): value is SeedReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    SEED_REF_BRAND in value &&
    (value as Record<string, unknown>)[SEED_REF_BRAND] === true
  );
}
