/**
 * Relation Resolver - Handles lazy and eager loading of entity relations
 *
 * @module runtime/resolver/relation
 * @category Runtime
 */

import type { EntitySchema, RelationDefinition } from '../../schema/types';
import type { Database } from './computed';
import { SchemaRegistry } from './registry';

/**
 * Options for resolving relations
 */
export interface ResolveRelationOptions {
  /** Specific relations to include (by name or nested path like 'posts.comments') */
  include?: string[];
  /** Maximum depth for nested relation resolution */
  depth?: number;
  /** Default limit for hasMany relations */
  limit?: number;
  /** Default ordering for hasMany relations */
  orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * Default maximum depth for relation resolution
 */
const DEFAULT_MAX_DEPTH = 3;

/**
 * Resolves a single relation for an entity.
 *
 * @param entity - The source entity
 * @param relationName - Name of the relation field
 * @param relation - The relation definition
 * @param db - Database interface
 * @param registry - Schema registry
 * @param options - Resolution options
 * @param currentDepth - Current recursion depth
 * @returns The related entity/entities or null/empty array
 *
 * @example
 * ```typescript
 * const posts = await resolveRelation(
 *   user,
 *   'posts',
 *   { type: 'hasMany', target: 'post', foreignKey: 'authorId' },
 *   db,
 *   registry,
 *   { limit: 10 }
 * );
 * ```
 */
export async function resolveRelation<T>(
  entity: Record<string, unknown>,
  relationName: string,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions = {},
  currentDepth = 0
): Promise<T | T[] | null> {
  const maxDepth = options.depth ?? DEFAULT_MAX_DEPTH;

  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return relation.type === 'hasMany' ? [] : null;
  }

  switch (relation.type) {
    case 'hasOne':
      return resolveHasOne<T>(entity, relation, db, registry, options, currentDepth);
    case 'hasMany':
      return resolveHasMany<T>(entity, relation, db, registry, options, currentDepth);
    case 'belongsTo':
      return resolveBelongsTo<T>(entity, relation, db, registry, options, currentDepth);
    default:
      throw new Error(`Unknown relation type: ${(relation as RelationDefinition).type}`);
  }
}

/**
 * Resolves a hasOne relation (one-to-one, FK on related entity)
 */
async function resolveHasOne<T>(
  entity: Record<string, unknown>,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions,
  currentDepth: number
): Promise<T | null> {
  const targetDb = db[relation.target];
  if (!targetDb) {
    throw new Error(`Target entity '${relation.target}' not found in database`);
  }

  const foreignKey = relation.foreignKey || `${entity.constructor.name.toLowerCase()}Id`;
  const entityId = entity.id;

  const related = targetDb.findFirst({
    where: {
      [foreignKey]: { equals: entityId },
    },
  }) as T | null;

  if (!related) return null;

  // Recursively resolve nested relations if needed
  const targetSchema = registry.get(relation.target);
  if (targetSchema) {
    await resolveNestedRelations(
      related as Record<string, unknown>,
      targetSchema,
      db,
      registry,
      options,
      currentDepth + 1
    );
  }

  return related;
}

/**
 * Resolves a hasMany relation (one-to-many, FK on related entities)
 */
async function resolveHasMany<T>(
  entity: Record<string, unknown>,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions,
  currentDepth: number
): Promise<T[]> {
  const targetDb = db[relation.target];
  if (!targetDb) {
    throw new Error(`Target entity '${relation.target}' not found in database`);
  }

  const foreignKey = relation.foreignKey || `${entity.constructor.name.toLowerCase()}Id`;
  const entityId = entity.id;

  // Build query
  const query: Record<string, unknown> = {
    where: {
      [foreignKey]: { equals: entityId },
    },
  };

  // Apply limit
  const limit = options.limit ?? relation.limit;
  if (limit) {
    (query as Record<string, unknown>).take = limit;
  }

  // Apply ordering
  const orderBy = options.orderBy ?? relation.orderBy;
  if (orderBy) {
    (query as Record<string, unknown>).orderBy = orderBy;
  }

  const results = targetDb.findMany(query) as T[];

  // Recursively resolve nested relations
  const targetSchema = registry.get(relation.target);
  if (targetSchema) {
    for (const item of results) {
      await resolveNestedRelations(
        item as Record<string, unknown>,
        targetSchema,
        db,
        registry,
        options,
        currentDepth + 1
      );
    }
  }

  return results;
}

/**
 * Resolves a belongsTo relation (many-to-one, FK on this entity)
 */
async function resolveBelongsTo<T>(
  entity: Record<string, unknown>,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions,
  currentDepth: number
): Promise<T | null> {
  const foreignKey = relation.foreignKey || `${relation.target}Id`;
  const foreignKeyValue = entity[foreignKey];

  if (!foreignKeyValue) return null;

  const targetDb = db[relation.target];
  if (!targetDb) {
    throw new Error(`Target entity '${relation.target}' not found in database`);
  }

  const related = targetDb.findFirst({
    where: { id: { equals: foreignKeyValue } },
  }) as T | null;

  if (!related) return null;

  // Recursively resolve nested relations
  const targetSchema = registry.get(relation.target);
  if (targetSchema) {
    await resolveNestedRelations(
      related as Record<string, unknown>,
      targetSchema,
      db,
      registry,
      options,
      currentDepth + 1
    );
  }

  return related;
}

/**
 * Resolves nested relations on an entity based on include paths
 */
async function resolveNestedRelations(
  entity: Record<string, unknown>,
  schema: EntitySchema,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions,
  currentDepth: number
): Promise<void> {
  if (!schema.relations) return;

  const include = options.include ?? [];

  for (const [relationName, relation] of Object.entries(schema.relations)) {
    // Check if this relation should be loaded
    const shouldLoad =
      relation.eager ||
      include.includes(relationName) ||
      include.some((inc) => inc.startsWith(`${relationName}.`));

    if (shouldLoad) {
      // Get nested includes for this relation
      const nestedIncludes = include
        .filter((inc) => inc.startsWith(`${relationName}.`))
        .map((inc) => inc.replace(`${relationName}.`, ''));

      entity[relationName] = await resolveRelation(
        entity,
        relationName,
        relation,
        db,
        registry,
        { ...options, include: nestedIncludes },
        currentDepth
      );
    }
  }
}

/**
 * Resolves all relations for an entity.
 *
 * @param entity - The entity to resolve relations for
 * @param schema - The entity schema
 * @param db - Database interface
 * @param registry - Schema registry
 * @param options - Resolution options
 * @returns The entity with relations resolved (mutates and returns same object)
 *
 * @example
 * ```typescript
 * const user = await resolveRelations(rawUser, UserSchema, db, registry, {
 *   include: ['profile', 'posts', 'posts.comments'],
 * });
 * ```
 */
export async function resolveRelations<T extends Record<string, unknown>>(
  entity: T,
  schema: EntitySchema,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions = {}
): Promise<T> {
  await resolveNestedRelations(entity, schema, db, registry, options, 0);
  return entity;
}

/**
 * Eagerly loads relations for multiple entities (batch loading).
 * More efficient than loading relations one-by-one.
 *
 * @param entities - Array of entities to load relations for
 * @param schema - The entity schema
 * @param db - Database interface
 * @param registry - Schema registry
 * @param options - Resolution options
 * @returns The entities with relations resolved
 *
 * @example
 * ```typescript
 * const users = await eagerLoadRelations(rawUsers, UserSchema, db, registry, {
 *   include: ['profile'],
 * });
 * ```
 */
export async function eagerLoadRelations<T extends Record<string, unknown>>(
  entities: T[],
  schema: EntitySchema,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions = {}
): Promise<T[]> {
  if (!schema.relations || entities.length === 0) {
    return entities;
  }

  const include = options.include ?? [];

  for (const [relationName, relation] of Object.entries(schema.relations)) {
    const shouldLoad =
      relation.eager ||
      include.includes(relationName) ||
      include.some((inc) => inc.startsWith(`${relationName}.`));

    if (!shouldLoad) continue;

    // Batch load based on relation type
    if (relation.type === 'belongsTo') {
      await batchLoadBelongsTo(entities, relationName, relation, db, registry, options);
    } else if (relation.type === 'hasOne') {
      await batchLoadHasOne(entities, relationName, relation, db, registry, options);
    } else if (relation.type === 'hasMany') {
      // hasMany is harder to batch efficiently, fall back to individual loads
      for (const entity of entities) {
        (entity as Record<string, unknown>)[relationName] = await resolveRelation(entity, relationName, relation, db, registry, options);
      }
    }
  }

  return entities;
}

/**
 * Batch loads belongsTo relations
 */
async function batchLoadBelongsTo<T extends Record<string, unknown>>(
  entities: T[],
  relationName: string,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions
): Promise<void> {
  const foreignKey = relation.foreignKey || `${relation.target}Id`;
  const targetDb = db[relation.target];

  // Collect all foreign key values
  const foreignKeyValues = [...new Set(entities.map((e) => (e as Record<string, unknown>)[foreignKey]).filter(Boolean))];

  if (foreignKeyValues.length === 0) {
    entities.forEach((e) => ((e as Record<string, unknown>)[relationName] = null));
    return;
  }

  // Batch fetch all related entities
  const relatedEntities = targetDb.findMany({
    where: {
      id: { in: foreignKeyValues },
    },
  }) as Record<string, unknown>[];

  // Create lookup map
  const lookup = new Map(relatedEntities.map((r) => [r.id, r]));

  // Assign to each entity
  for (const entity of entities) {
    const fkValue = (entity as Record<string, unknown>)[foreignKey];
    (entity as Record<string, unknown>)[relationName] = fkValue ? lookup.get(fkValue) ?? null : null;
  }

  // Recursively load nested relations
  const targetSchema = registry.get(relation.target);
  if (targetSchema) {
    const nestedIncludes = (options.include ?? [])
      .filter((inc) => inc.startsWith(`${relationName}.`))
      .map((inc) => inc.replace(`${relationName}.`, ''));

    if (nestedIncludes.length > 0) {
      await eagerLoadRelations(relatedEntities, targetSchema, db, registry, {
        ...options,
        include: nestedIncludes,
      });
    }
  }
}

/**
 * Batch loads hasOne relations
 */
async function batchLoadHasOne<T extends Record<string, unknown>>(
  entities: T[],
  relationName: string,
  relation: RelationDefinition,
  db: Database,
  registry: SchemaRegistry,
  options: ResolveRelationOptions
): Promise<void> {
  const foreignKey = relation.foreignKey || 'id';
  const targetDb = db[relation.target];

  // Collect all entity IDs
  const entityIds = entities.map((e) => (e as Record<string, unknown>).id).filter(Boolean);

  if (entityIds.length === 0) {
    entities.forEach((e) => ((e as Record<string, unknown>)[relationName] = null));
    return;
  }

  // Batch fetch all related entities
  const relatedEntities = targetDb.findMany({
    where: {
      [foreignKey]: { in: entityIds },
    },
  }) as Record<string, unknown>[];

  // Create lookup map by foreign key
  const lookup = new Map(relatedEntities.map((r) => [r[foreignKey], r]));

  // Assign to each entity
  for (const entity of entities) {
    (entity as Record<string, unknown>)[relationName] = lookup.get((entity as Record<string, unknown>).id) ?? null;
  }

  // Recursively load nested relations
  const targetSchema = registry.get(relation.target);
  if (targetSchema) {
    const nestedIncludes = (options.include ?? [])
      .filter((inc) => inc.startsWith(`${relationName}.`))
      .map((inc) => inc.replace(`${relationName}.`, ''));

    if (nestedIncludes.length > 0) {
      await eagerLoadRelations(relatedEntities, targetSchema, db, registry, {
        ...options,
        include: nestedIncludes,
      });
    }
  }
}
