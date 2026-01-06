/**
 * Schema Registry - Manages schema registration and lookup
 *
 * @module runtime/resolver/registry
 * @category Runtime
 */

import type { EntitySchema, ViewSchema, RelationDefinition } from '../../schema/types';

/**
 * Schema Registry manages all registered entity and view schemas.
 * Provides fast lookup and traversal of schema metadata.
 *
 * @example
 * ```typescript
 * import { SchemaRegistry } from 'schemock/runtime';
 *
 * const registry = new SchemaRegistry();
 * registry.register(UserSchema);
 * registry.register(PostSchema);
 *
 * const user = registry.get('user');
 * ```
 */
export class SchemaRegistry {
  private entities = new Map<string, EntitySchema>();
  private views = new Map<string, ViewSchema>();

  /**
   * Register an entity schema
   * @param schema - The entity schema to register
   */
  register(schema: EntitySchema): void {
    if (this.entities.has(schema.name)) {
      console.warn(`Schema '${schema.name}' is already registered. Overwriting.`);
    }
    this.entities.set(schema.name, schema);
  }

  /**
   * Register a view schema
   * @param view - The view schema to register
   */
  registerView(view: ViewSchema): void {
    if (this.views.has(view.name)) {
      console.warn(`View '${view.name}' is already registered. Overwriting.`);
    }
    this.views.set(view.name, view);
  }

  /**
   * Get an entity schema by name
   * @param entityName - The entity name
   * @returns EntitySchema or undefined if not found
   */
  get(entityName: string): EntitySchema | undefined {
    return this.entities.get(entityName);
  }

  /**
   * Get an entity schema by name, throws if not found
   * @param entityName - The entity name
   * @returns EntitySchema
   * @throws Error if entity not found
   */
  getOrThrow(entityName: string): EntitySchema {
    const schema = this.entities.get(entityName);
    if (!schema) {
      throw new Error(`Entity schema '${entityName}' not found. Did you forget to register it?`);
    }
    return schema;
  }

  /**
   * Get a view schema by name
   * @param viewName - The view name
   * @returns ViewSchema or undefined if not found
   */
  getView(viewName: string): ViewSchema | undefined {
    return this.views.get(viewName);
  }

  /**
   * Get a view schema by name, throws if not found
   * @param viewName - The view name
   * @returns ViewSchema
   * @throws Error if view not found
   */
  getViewOrThrow(viewName: string): ViewSchema {
    const view = this.views.get(viewName);
    if (!view) {
      throw new Error(`View schema '${viewName}' not found. Did you forget to register it?`);
    }
    return view;
  }

  /**
   * Get all registered entity schemas
   * @returns Array of all entity schemas
   */
  getAll(): EntitySchema[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get all registered view schemas
   * @returns Array of all view schemas
   */
  getAllViews(): ViewSchema[] {
    return Array.from(this.views.values());
  }

  /**
   * Check if an entity schema is registered
   * @param entityName - The entity name
   * @returns true if registered
   */
  has(entityName: string): boolean {
    return this.entities.has(entityName);
  }

  /**
   * Check if a view schema is registered
   * @param viewName - The view name
   * @returns true if registered
   */
  hasView(viewName: string): boolean {
    return this.views.has(viewName);
  }

  /**
   * Get all relations for an entity
   * @param entityName - The entity name
   * @returns Array of relation definitions with their names
   */
  getRelationsFor(entityName: string): Array<{ name: string; relation: RelationDefinition }> {
    const schema = this.entities.get(entityName);
    if (!schema || !schema.relations) {
      return [];
    }

    return Object.entries(schema.relations).map(([name, relation]) => ({
      name,
      relation,
    }));
  }

  /**
   * Get all entities that have a relation to a target entity
   * @param targetEntityName - The target entity name
   * @returns Array of entity names that reference the target
   */
  getEntitiesReferencingEntity(targetEntityName: string): string[] {
    const result: string[] = [];

    for (const [entityName, schema] of this.entities) {
      if (schema.relations) {
        for (const relation of Object.values(schema.relations)) {
          if (relation.target === targetEntityName) {
            result.push(entityName);
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Get entity names in dependency order (topological sort)
   * Entities with no dependencies come first
   * @returns Array of entity names in order
   */
  getEntityOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (entityName: string) => {
      if (visited.has(entityName)) return;
      visited.add(entityName);

      const schema = this.entities.get(entityName);
      if (schema?.relations) {
        for (const relation of Object.values(schema.relations)) {
          if (this.entities.has(relation.target)) {
            visit(relation.target);
          }
        }
      }

      result.push(entityName);
    };

    for (const entityName of this.entities.keys()) {
      visit(entityName);
    }

    return result;
  }

  /**
   * Clear all registered schemas
   */
  clear(): void {
    this.entities.clear();
    this.views.clear();
  }

  /**
   * Get entity count
   */
  get entityCount(): number {
    return this.entities.size;
  }

  /**
   * Get view count
   */
  get viewCount(): number {
    return this.views.size;
  }
}

/**
 * Global schema registry instance
 */
export const registry = new SchemaRegistry();
