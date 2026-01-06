/**
 * Seed Function - Populate database with fake data
 *
 * Seeds the MockAdapter database with generated fake data
 * based on entity schemas and specified counts.
 *
 * @module runtime/seed
 * @category Runtime
 */

import { getAdapter } from './setup';
import type { MockAdapter } from '../adapters/mock/adapter';

/**
 * Seed the database with fake data.
 *
 * Uses the configured MockAdapter to generate and persist
 * fake entities based on the provided counts.
 *
 * @param counts - Map of entity names to number of items to create
 *
 * @example
 * ```typescript
 * import { seed } from 'schemock/runtime';
 *
 * // Seed with specific counts
 * seed({
 *   user: 10,
 *   post: 50,
 *   comment: 100,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Seed in a setup function
 * async function initMockData() {
 *   await setup({ adapter, schemas });
 *   seed({ user: 5, project: 10 });
 * }
 * ```
 */
export function seed(counts: Record<string, number>): void {
  const adapter = getAdapter();

  if (!adapter) {
    throw new Error(
      'No adapter configured. Call setup() first or use adapter.seed() directly.'
    );
  }

  // Check if adapter is a MockAdapter with seed method
  if (adapter.name !== 'mock') {
    throw new Error(
      `seed() only works with MockAdapter. Current adapter: ${adapter.name}`
    );
  }

  // Call the MockAdapter's seed method
  (adapter as MockAdapter).seed(counts);
}

/**
 * Reset the database to empty state.
 *
 * Clears all data from the MockAdapter database.
 *
 * @example
 * ```typescript
 * import { reset } from 'schemock/runtime';
 *
 * // Clear all mock data
 * reset();
 * ```
 */
export function reset(): void {
  const adapter = getAdapter();

  if (!adapter) {
    throw new Error('No adapter configured. Call setup() first.');
  }

  if (adapter.name !== 'mock') {
    throw new Error(
      `reset() only works with MockAdapter. Current adapter: ${adapter.name}`
    );
  }

  (adapter as MockAdapter).reset();
}

/**
 * Seed with related data (maintains referential integrity).
 *
 * Seeds entities in dependency order, ensuring foreign keys
 * reference valid parent entities.
 *
 * @param counts - Map of entity names to counts
 * @param relations - Map of entity to foreign key relationships
 *
 * @example
 * ```typescript
 * import { seedWithRelations } from 'schemock/runtime';
 *
 * seedWithRelations(
 *   { user: 5, post: 20 },
 *   { post: { authorId: 'user' } }
 * );
 * ```
 */
export function seedWithRelations(
  counts: Record<string, number>,
  relations: Record<string, Record<string, string>>
): void {
  const adapter = getAdapter() as MockAdapter;

  if (!adapter || adapter.name !== 'mock') {
    throw new Error('seedWithRelations() requires MockAdapter');
  }

  // Build dependency graph
  const deps = new Map<string, Set<string>>();
  for (const entity of Object.keys(counts)) {
    deps.set(entity, new Set());
  }
  for (const [entity, fks] of Object.entries(relations)) {
    for (const targetEntity of Object.values(fks)) {
      deps.get(entity)?.add(targetEntity);
    }
  }

  // Topological sort
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(entity: string): void {
    if (visited.has(entity)) return;
    if (visiting.has(entity)) {
      throw new Error(`Circular dependency detected: ${entity}`);
    }
    visiting.add(entity);
    for (const dep of deps.get(entity) || []) {
      visit(dep);
    }
    visiting.delete(entity);
    visited.add(entity);
    sorted.push(entity);
  }

  for (const entity of Object.keys(counts)) {
    visit(entity);
  }

  // Seed in dependency order
  const entityIds: Record<string, string[]> = {};

  for (const entity of sorted) {
    const count = counts[entity];
    if (count === undefined) continue;

    // Get parent IDs for foreign keys
    const fks = relations[entity] || {};
    const parentIds: Record<string, string[]> = {};
    for (const [fkField, parentEntity] of Object.entries(fks)) {
      parentIds[fkField] = entityIds[parentEntity] || [];
    }

    // Generate entities with foreign keys
    entityIds[entity] = [];
    for (let i = 0; i < count; i++) {
      const data: Record<string, unknown> = {};

      // Assign random parent IDs
      for (const [fkField, ids] of Object.entries(parentIds)) {
        if (ids.length > 0) {
          data[fkField] = ids[Math.floor(Math.random() * ids.length)];
        }
      }

      // Create via adapter
      const result = adapter.create<{ id: string }>({
        entity,
        data,
      });

      // This is sync in MockAdapter despite the Promise return
      result.then((res) => {
        if (res.data?.id) {
          entityIds[entity].push(res.data.id);
        }
      });
    }
  }
}
