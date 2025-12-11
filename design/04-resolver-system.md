# Resolver System

## Overview

The resolver system is responsible for:
1. Fetching entities from the in-memory database
2. Resolving relationships (hasOne, hasMany, belongsTo)
3. Computing derived fields
4. Assembling views and aggregations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RESOLVER ENGINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                            │
│  │  Registry   │◄── Schema definitions                      │
│  │  (metadata) │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  Relation   │     │  Computed   │     │    View     │   │
│  │  Resolver   │     │  Resolver   │     │  Resolver   │   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘   │
│         │                   │                   │          │
│         └───────────────────┴───────────────────┘          │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────┐                          │
│                    │ @mswjs/data │                          │
│                    │  Database   │                          │
│                    └─────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Schema Registry

The registry stores metadata about all defined schemas.

```typescript
// src/runtime/resolver/registry.ts

export interface FieldDefinition {
  type: string;
  faker?: () => any;
  nullable?: boolean;
  unique?: boolean;
  readOnly?: boolean;
  default?: any;
}

export interface RelationDefinition {
  type: 'hasOne' | 'hasMany' | 'belongsTo';
  target: string;
  foreignKey: string;
  eager: boolean;
  through?: string;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export interface ComputedDefinition {
  mock: () => any;
  resolve: (entity: any, db: Database, context: ResolverContext) => any;
  dependsOn?: string[];
}

export interface EntitySchema {
  name: string;
  primaryKey: string;
  fields: Record<string, FieldDefinition>;
  relations: Record<string, RelationDefinition>;
  computed: Record<string, ComputedDefinition>;
  api?: ApiConfig;
}

export interface ViewSchema {
  name: string;
  baseEntity?: string;
  fields: Record<string, FieldDefinition | EmbedDefinition>;
  computed: Record<string, ComputedDefinition>;
  endpoint: string;
  params: string[];
  mockResolver?: (db: Database, params: any, context: ResolverContext) => any;
}

class SchemaRegistry {
  private entities = new Map<string, EntitySchema>();
  private views = new Map<string, ViewSchema>();

  registerEntity(schema: EntitySchema): void {
    this.entities.set(schema.name, schema);
  }

  registerView(schema: ViewSchema): void {
    this.views.set(schema.name, schema);
  }

  getEntity(name: string): EntitySchema | undefined {
    return this.entities.get(name);
  }

  getView(name: string): ViewSchema | undefined {
    return this.views.get(name);
  }

  getAllEntities(): EntitySchema[] {
    return Array.from(this.entities.values());
  }

  getAllViews(): ViewSchema[] {
    return Array.from(this.views.values());
  }
}

export const registry = new SchemaRegistry();
```

### 2. Relation Resolver

Handles resolution of entity relationships.

```typescript
// src/runtime/resolver/relation.ts

import { db } from '../db';
import { registry, RelationDefinition } from './registry';

export interface ResolveOptions {
  include?: string[];
  depth?: number;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export function resolveRelation(
  entity: any,
  relationName: string,
  relation: RelationDefinition,
  options: ResolveOptions = {},
  currentDepth: number = 0
): any {
  const maxDepth = options.depth ?? 3;

  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return relation.type === 'hasMany' ? [] : null;
  }

  switch (relation.type) {
    case 'hasOne':
      return resolveHasOne(entity, relation, options, currentDepth);
    case 'hasMany':
      return resolveHasMany(entity, relation, options, currentDepth);
    case 'belongsTo':
      return resolveBelongsTo(entity, relation, options, currentDepth);
    default:
      throw new Error(`Unknown relation type: ${relation.type}`);
  }
}

function resolveHasOne(
  entity: any,
  relation: RelationDefinition,
  options: ResolveOptions,
  currentDepth: number
): any {
  const targetDb = db[relation.target];

  const related = targetDb.findFirst({
    where: {
      [relation.foreignKey]: { equals: entity.id }
    }
  });

  if (!related) return null;

  // Recursively resolve nested relations
  const targetSchema = registry.getEntity(relation.target);
  if (targetSchema) {
    resolveNestedRelations(related, targetSchema, options, currentDepth);
  }

  return related;
}

function resolveHasMany(
  entity: any,
  relation: RelationDefinition,
  options: ResolveOptions,
  currentDepth: number
): any[] {
  const targetDb = db[relation.target];

  const queryOptions: any = {
    where: {
      [relation.foreignKey]: { equals: entity.id }
    }
  };

  // Apply limit
  const limit = options.limit ?? relation.limit;
  if (limit) queryOptions.take = limit;

  // Apply ordering
  const orderBy = options.orderBy ?? relation.orderBy;
  if (orderBy) queryOptions.orderBy = orderBy;

  const results = targetDb.findMany(queryOptions);

  // Recursively resolve nested relations
  const targetSchema = registry.getEntity(relation.target);
  if (targetSchema) {
    results.forEach(item => {
      resolveNestedRelations(item, targetSchema, options, currentDepth);
    });
  }

  return results;
}

function resolveBelongsTo(
  entity: any,
  relation: RelationDefinition,
  options: ResolveOptions,
  currentDepth: number
): any {
  const foreignKeyValue = entity[relation.foreignKey];
  if (!foreignKeyValue) return null;

  const targetDb = db[relation.target];

  return targetDb.findFirst({
    where: { id: { equals: foreignKeyValue } }
  });
}

function resolveNestedRelations(
  entity: any,
  schema: EntitySchema,
  options: ResolveOptions,
  currentDepth: number
): void {
  const include = options.include ?? [];

  for (const [relationName, relation] of Object.entries(schema.relations)) {
    const nestedIncludes = include
      .filter(inc => inc.startsWith(`${relationName}.`))
      .map(inc => inc.replace(`${relationName}.`, ''));

    if (relation.eager || include.includes(relationName) || nestedIncludes.length > 0) {
      entity[relationName] = resolveRelation(
        entity,
        relationName,
        relation,
        { ...options, include: nestedIncludes },
        currentDepth + 1
      );
    }
  }
}

export function resolveEntityRelations(
  entity: any,
  schema: EntitySchema,
  options: ResolveOptions = {},
  currentDepth: number = 0
): void {
  resolveNestedRelations(entity, schema, options, currentDepth);
}
```

### 3. Computed Field Resolver

Handles resolution of computed/derived fields.

```typescript
// src/runtime/resolver/computed.ts

import { db } from '../db';
import { registry, ComputedDefinition, EntitySchema } from './registry';

export interface ResolverContext {
  currentUserId?: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  mode: 'seed' | 'resolve';
}

// Cache for computed values within a request
const computeCache = new Map<string, any>();

export function resolveComputedField(
  entity: any,
  fieldName: string,
  computed: ComputedDefinition,
  context: ResolverContext
): any {
  const cacheKey = `${entity.id}:${fieldName}`;

  if (computeCache.has(cacheKey)) {
    return computeCache.get(cacheKey);
  }

  let value: any;

  if (context.mode === 'seed') {
    // During seeding, use mock function
    value = computed.mock();
  } else {
    // During resolution, use resolve function
    value = computed.resolve(entity, db, context);
  }

  computeCache.set(cacheKey, value);
  return value;
}

export function resolveAllComputed(
  entity: any,
  schema: EntitySchema,
  context: ResolverContext,
  fields?: string[]
): void {
  const computedFields = fields
    ? Object.entries(schema.computed).filter(([name]) => fields.includes(name))
    : Object.entries(schema.computed);

  // Sort by dependencies
  const sorted = topologicalSort(computedFields, schema.computed);

  for (const [fieldName, computed] of sorted) {
    entity[fieldName] = resolveComputedField(entity, fieldName, computed, context);
  }
}

function topologicalSort(
  fields: [string, ComputedDefinition][],
  allComputed: Record<string, ComputedDefinition>
): [string, ComputedDefinition][] {
  const result: [string, ComputedDefinition][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency in computed fields: ${name}`);
    }

    visiting.add(name);

    const computed = allComputed[name];
    if (computed?.dependsOn) {
      for (const dep of computed.dependsOn) {
        if (allComputed[dep]) {
          visit(dep);
        }
      }
    }

    visiting.delete(name);
    visited.add(name);

    const field = fields.find(([n]) => n === name);
    if (field) result.push(field);
  }

  for (const [name] of fields) {
    visit(name);
  }

  return result;
}

export function clearComputeCache(): void {
  computeCache.clear();
}
```

### 4. View Resolver

Handles resolution of views (aggregations).

```typescript
// src/runtime/resolver/view.ts

import { db } from '../db';
import { registry, ViewSchema, EntitySchema } from './registry';
import { resolveEntityRelations } from './relation';
import { resolveAllComputed, ResolverContext } from './computed';

export interface ViewResolveOptions {
  params: Record<string, any>;
  context: ResolverContext;
}

export function resolveView(
  viewName: string,
  options: ViewResolveOptions
): any {
  const view = registry.getView(viewName);
  if (!view) {
    throw new Error(`View not found: ${viewName}`);
  }

  // Use custom resolver if provided
  if (view.mockResolver) {
    return view.mockResolver(db, options.params, options.context);
  }

  return buildViewFromSchema(view, options);
}

function buildViewFromSchema(
  view: ViewSchema,
  options: ViewResolveOptions
): any {
  const result: any = {};

  // If based on entity, start there
  if (view.baseEntity) {
    const entitySchema = registry.getEntity(view.baseEntity);
    if (!entitySchema) {
      throw new Error(`Base entity not found: ${view.baseEntity}`);
    }

    const baseEntity = db[view.baseEntity].findFirst({
      where: { id: { equals: options.params.id } }
    });

    if (!baseEntity) return null;

    Object.assign(result, baseEntity);
  }

  // Resolve each field
  for (const [fieldName, fieldDef] of Object.entries(view.fields)) {
    if (isEmbedDefinition(fieldDef)) {
      result[fieldName] = resolveEmbed(fieldDef, result, options);
    } else if (isComputedDefinition(fieldDef)) {
      result[fieldName] = fieldDef.resolve(result, db, options.context);
    }
  }

  // Resolve view-level computed
  if (view.computed) {
    for (const [fieldName, computed] of Object.entries(view.computed)) {
      result[fieldName] = computed.resolve(result, db, options.context);
    }
  }

  return result;
}

interface EmbedDefinition {
  type: 'embed';
  target: string;
  relation?: string;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  where?: Record<string, any>;
}

function isEmbedDefinition(def: any): def is EmbedDefinition {
  return def && def.type === 'embed';
}

function isComputedDefinition(def: any): boolean {
  return def && typeof def.resolve === 'function';
}

function resolveEmbed(
  embed: EmbedDefinition,
  parentEntity: any,
  options: ViewResolveOptions
): any {
  const targetDb = db[embed.target];

  const query: any = { where: {} };

  if (embed.relation) {
    query.where[`${embed.relation}Id`] = { equals: parentEntity.id };
  }

  if (embed.where) {
    Object.assign(query.where, embed.where);
  }

  if (embed.limit) query.take = embed.limit;
  if (embed.orderBy) query.orderBy = embed.orderBy;

  const isArray = !embed.limit || embed.limit > 1;

  if (isArray) {
    return targetDb.findMany(query);
  } else {
    return targetDb.findFirst(query);
  }
}
```

### 5. Main Resolver Engine

Orchestrates all resolvers.

```typescript
// src/runtime/resolver/index.ts

import { db } from '../db';
import { registry, EntitySchema } from './registry';
import { resolveEntityRelations, ResolveOptions } from './relation';
import { resolveAllComputed, clearComputeCache, ResolverContext } from './computed';
import { resolveView } from './view';

export interface EntityQueryOptions extends ResolveOptions {
  where?: Record<string, any>;
  computed?: string[];
}

export interface ListQueryOptions extends EntityQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export class Resolver {
  private context: ResolverContext;

  constructor(context: Partial<ResolverContext> = {}) {
    this.context = { mode: 'resolve', ...context };
  }

  findOne<T = any>(
    entityName: string,
    id: string,
    options: EntityQueryOptions = {}
  ): T | null {
    clearComputeCache();

    const schema = registry.getEntity(entityName);
    if (!schema) throw new Error(`Entity not found: ${entityName}`);

    const entity = db[entityName].findFirst({
      where: { id: { equals: id } }
    });

    if (!entity) return null;

    resolveEntityRelations(entity, schema, options);
    resolveAllComputed(entity, schema, this.context, options.computed);

    return entity as T;
  }

  findMany<T = any>(
    entityName: string,
    options: ListQueryOptions = {}
  ): T[] {
    clearComputeCache();

    const schema = registry.getEntity(entityName);
    if (!schema) throw new Error(`Entity not found: ${entityName}`);

    const query: any = {};

    if (options.where) {
      query.where = this.buildWhereClause(options.where);
    }
    if (options.limit) query.take = options.limit;
    if (options.offset) query.skip = options.offset;
    if (options.orderBy) query.orderBy = options.orderBy;

    const entities = db[entityName].findMany(query);

    for (const entity of entities) {
      resolveEntityRelations(entity, schema, options);
      resolveAllComputed(entity, schema, this.context, options.computed);
    }

    return entities as T[];
  }

  create<T = any>(
    entityName: string,
    data: Partial<T>,
    options: EntityQueryOptions = {}
  ): T {
    const schema = registry.getEntity(entityName);
    if (!schema) throw new Error(`Entity not found: ${entityName}`);

    const entity = db[entityName].create(data);

    resolveEntityRelations(entity, schema, options);
    resolveAllComputed(entity, schema, this.context, options.computed);

    return entity as T;
  }

  update<T = any>(
    entityName: string,
    id: string,
    data: Partial<T>,
    options: EntityQueryOptions = {}
  ): T | null {
    const schema = registry.getEntity(entityName);
    if (!schema) throw new Error(`Entity not found: ${entityName}`);

    const entity = db[entityName].update({
      where: { id: { equals: id } },
      data,
    });

    if (!entity) return null;

    resolveEntityRelations(entity, schema, options);
    resolveAllComputed(entity, schema, this.context, options.computed);

    return entity as T;
  }

  delete(entityName: string, id: string): boolean {
    const deleted = db[entityName].delete({
      where: { id: { equals: id } }
    });

    return deleted !== null;
  }

  view<T = any>(viewName: string, params: Record<string, any>): T | null {
    clearComputeCache();

    return resolveView(viewName, {
      params,
      context: this.context,
    }) as T;
  }

  count(entityName: string, where?: Record<string, any>): number {
    const query = where ? { where: this.buildWhereClause(where) } : {};
    return db[entityName].count(query);
  }

  private buildWhereClause(where: Record<string, any>): any {
    const clause: any = {};

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        clause[key] = value;
      } else {
        clause[key] = { equals: value };
      }
    }

    return clause;
  }
}

export function createResolver(context?: Partial<ResolverContext>): Resolver {
  return new Resolver(context);
}

export const resolver = new Resolver();
```

## Query Examples

### Basic Queries

```typescript
// Find one
const user = resolver.findOne('user', '123');

// Find many with pagination
const users = resolver.findMany('user', {
  limit: 20,
  offset: 0,
  orderBy: { createdAt: 'desc' },
});

// Find with filter
const admins = resolver.findMany('user', {
  where: { role: 'admin' },
});
```

### With Relations

```typescript
// Include specific relations
const user = resolver.findOne('user', '123', {
  include: ['profile', 'posts'],
});

// Nested includes
const user = resolver.findOne('user', '123', {
  include: ['profile', 'posts', 'posts.comments'],
});

// Limit relation depth
const user = resolver.findOne('user', '123', {
  include: ['posts'],
  depth: 2,  // Max nesting depth
});
```

### With Computed Fields

```typescript
// Include specific computed fields
const user = resolver.findOne('user', '123', {
  computed: ['postCount', 'totalViews'],
});

// All computed fields (default)
const user = resolver.findOne('user', '123');
```

### Views

```typescript
// Resolve view
const userFull = resolver.view('user-full', { id: '123' });
```
