/**
 * MswStorageDriver - Storage implementation using @mswjs/data
 *
 * Wraps the @mswjs/data library to provide a StorageDriver-compliant
 * interface. This is the most feature-rich driver, supporting complex
 * queries and relations.
 *
 * @module storage/drivers/msw
 * @category Storage
 */

import { factory, primaryKey, nullable } from '@mswjs/data';
import { faker } from '@faker-js/faker';
import type { EntitySchema, FieldDefinition, RelationDefinition } from '../../schema/types';
import type { StorageDriver, QueryOptions, QueryMeta, StorageDriverConfig } from '../types';

/**
 * Type for the @mswjs/data database instance
 */
type MswDatabase = {
  [entityName: string]: {
    create: (data: Record<string, unknown>) => unknown;
    findFirst: (query: { where: Record<string, unknown> }) => unknown | null;
    findMany: (query: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      skip?: number;
    }) => unknown[];
    update: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => unknown;
    delete: (query: { where: Record<string, unknown> }) => unknown;
    deleteMany: (query: { where: Record<string, unknown> }) => { count: number };
    count: (query?: { where?: Record<string, unknown> }) => number;
    getAll: () => unknown[];
  };
};

/**
 * Storage driver using @mswjs/data for in-memory persistence.
 *
 * Features:
 * - Full CRUD operations via @mswjs/data
 * - Filtering, sorting, pagination
 * - Realistic fake data generation via Faker.js
 * - Compatible with MSW for request interception
 *
 * @example
 * ```typescript
 * const driver = new MswStorageDriver({ fakerSeed: 123 });
 * await driver.initialize(schemas);
 *
 * const user = await driver.create('user', { name: 'John' });
 * const users = await driver.findMany('user', { where: { role: 'admin' } });
 * ```
 */
export class MswStorageDriver implements StorageDriver {
  readonly name = 'msw';

  /** The @mswjs/data database instance */
  private db: MswDatabase | null = null;

  /** Entity schemas for reference */
  private schemas: Map<string, EntitySchema> = new Map();

  /** Configuration options */
  private config: StorageDriverConfig;

  constructor(config?: StorageDriverConfig) {
    this.config = config || {};
    if (this.config.fakerSeed) {
      faker.seed(this.config.fakerSeed);
    }
  }

  async initialize(schemas: EntitySchema[]): Promise<void> {
    this.schemas = new Map(schemas.map((s) => [s.name, s]));

    // Generate @mswjs/data factories from schemas
    const factories = this.generateFactories(schemas);

    // Create the database
    this.db = factory(factories as Parameters<typeof factory>[0]) as unknown as MswDatabase;

    if (this.config.debug) {
      console.log(`[MswStorageDriver] Initialized with ${schemas.length} entities`);
    }
  }

  async create<T>(entity: string, data: Record<string, unknown>): Promise<T> {
    const entityDb = this.getEntityDb(entity);
    const schema = this.schemas.get(entity);

    // Generate ID if not provided
    const id = (data.id as string) || faker.string.uuid();

    // Add timestamps if schema has them
    const now = new Date();
    const record: Record<string, unknown> = {
      ...data,
      id,
      ...(schema?.timestamps ? { createdAt: data.createdAt ?? now, updatedAt: now } : {}),
    };

    const result = entityDb.create(record);

    if (this.config.debug) {
      console.log(`[MswStorageDriver] Created ${entity}:`, id);
    }

    return result as T;
  }

  async findOne<T>(entity: string, where: Record<string, unknown>): Promise<T | null> {
    const entityDb = this.getEntityDb(entity);
    const result = entityDb.findFirst({ where });
    return (result as T) || null;
  }

  async findMany<T>(entity: string, options?: QueryOptions): Promise<{ data: T[]; meta: QueryMeta }> {
    const entityDb = this.getEntityDb(entity);

    const query: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      skip?: number;
    } = {};

    if (options?.where) {
      query.where = options.where;
    }

    if (options?.orderBy) {
      query.orderBy = options.orderBy;
    }

    if (options?.limit) {
      query.take = options.limit;
    }

    if (options?.offset) {
      query.skip = options.offset;
    }

    const results = entityDb.findMany(query);
    const total = entityDb.count(query.where ? { where: query.where } : undefined);
    const hasMore = options?.limit ? results.length === options.limit : false;

    return {
      data: results as T[],
      meta: { total, hasMore },
    };
  }

  async update<T>(
    entity: string,
    where: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<T | null> {
    const entityDb = this.getEntityDb(entity);
    const schema = this.schemas.get(entity);

    // Add updated timestamp if schema has timestamps
    const updateData = {
      ...data,
      ...(schema?.timestamps ? { updatedAt: new Date() } : {}),
    };

    try {
      const result = entityDb.update({ where, data: updateData });

      if (this.config.debug) {
        console.log(`[MswStorageDriver] Updated ${entity}:`, where);
      }

      return result as T;
    } catch {
      // Record not found
      return null;
    }
  }

  async delete(entity: string, where: Record<string, unknown>): Promise<boolean> {
    const entityDb = this.getEntityDb(entity);

    try {
      entityDb.delete({ where });

      if (this.config.debug) {
        console.log(`[MswStorageDriver] Deleted ${entity}:`, where);
      }

      return true;
    } catch {
      // Record not found
      return false;
    }
  }

  async count(entity: string, where?: Record<string, unknown>): Promise<number> {
    const entityDb = this.getEntityDb(entity);
    return entityDb.count(where ? { where } : undefined);
  }

  async includeRelations<T>(
    entity: string,
    data: T[],
    relations: string[],
    schemas: Map<string, EntitySchema>
  ): Promise<T[]> {
    const schema = schemas.get(entity);
    if (!schema?.relations) {
      return data;
    }

    const result: T[] = [];

    for (const record of data) {
      const hydrated = { ...(record as Record<string, unknown>) };

      for (const relationName of relations) {
        const relation = schema.relations[relationName];
        if (!relation) continue;

        const relatedData = await this.loadRelation(
          record as Record<string, unknown>,
          relation,
          schemas
        );
        hydrated[relationName] = relatedData;
      }

      result.push(hydrated as T);
    }

    return result;
  }

  async seed(counts: Record<string, number>, schemas: Map<string, EntitySchema>): Promise<void> {
    // First pass: create all entities without relations
    const createdRecords: Map<string, Record<string, unknown>[]> = new Map();

    for (const [entityName, count] of Object.entries(counts)) {
      const schema = schemas.get(entityName);
      if (!schema) {
        console.warn(`[MswStorageDriver] Cannot seed unknown entity: ${entityName}`);
        continue;
      }

      const records: Record<string, unknown>[] = [];
      for (let i = 0; i < count; i++) {
        const data = this.generateFakeData(schema);
        const created = await this.create(entityName, data);
        records.push(created as Record<string, unknown>);
      }
      createdRecords.set(entityName, records);
    }

    // Second pass: link relations (belongsTo)
    for (const [entityName, records] of createdRecords) {
      const schema = schemas.get(entityName);
      if (!schema?.relations) continue;

      for (const [_relationName, relation] of Object.entries(schema.relations)) {
        if (relation.type === 'belongsTo') {
          const targetRecords = createdRecords.get(relation.target);
          if (!targetRecords?.length) continue;

          const foreignKey = relation.foreignKey || `${relation.target}Id`;

          for (const record of records) {
            // Assign random target
            const targetRecord = targetRecords[Math.floor(Math.random() * targetRecords.length)];
            await this.update(entityName, { id: record.id }, {
              [foreignKey]: targetRecord.id,
            });
          }
        }
      }
    }

    if (this.config.debug) {
      console.log(`[MswStorageDriver] Seeded:`, counts);
    }
  }

  async reset(): Promise<void> {
    if (!this.db) return;

    for (const entityName of this.schemas.keys()) {
      const entityDb = this.db[entityName];
      if (entityDb) {
        entityDb.deleteMany({ where: {} });
      }
    }

    if (this.config.debug) {
      console.log(`[MswStorageDriver] Reset all data`);
    }
  }

  async getAll<T>(entity: string): Promise<T[]> {
    const entityDb = this.getEntityDb(entity);
    return entityDb.getAll() as T[];
  }

  /**
   * Get the raw @mswjs/data database instance.
   * Useful for advanced operations or MSW handler setup.
   */
  getDatabase(): MswDatabase {
    if (!this.db) {
      throw new Error('MswStorageDriver not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Get the entity-specific database interface
   */
  private getEntityDb(entity: string) {
    if (!this.db) {
      throw new Error('MswStorageDriver not initialized. Call initialize() first.');
    }

    const entityDb = this.db[entity];
    if (!entityDb) {
      throw new Error(`Entity '${entity}' not found`);
    }

    return entityDb;
  }

  /**
   * Generate @mswjs/data factories from schemas
   */
  private generateFactories(schemas: EntitySchema[]): Record<string, Record<string, unknown>> {
    const factories: Record<string, Record<string, unknown>> = {};

    for (const schema of schemas) {
      factories[schema.name] = this.generateFactory(schema);
    }

    return factories;
  }

  /**
   * Generate a factory for a single schema
   */
  private generateFactory(schema: EntitySchema): Record<string, unknown> {
    const factoryDef: Record<string, unknown> = {};

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      factoryDef[fieldName] = this.createFieldGenerator(fieldName, fieldDef);
    }

    // Add timestamp fields if enabled
    if (schema.timestamps) {
      factoryDef.createdAt = () => faker.date.recent({ days: 30 });
      factoryDef.updatedAt = () => new Date();
    }

    return factoryDef;
  }

  /**
   * Create a generator for a single field
   */
  private createFieldGenerator(fieldName: string, fieldDef: FieldDefinition): unknown {
    // Handle primary key (id field)
    if (fieldName === 'id') {
      return primaryKey(faker.string.uuid);
    }

    // Handle nullable fields
    if (fieldDef.nullable) {
      return nullable(() => this.generateFieldValue(fieldDef) as string);
    }

    // Handle enum fields
    if (fieldDef.values && fieldDef.values.length > 0) {
      const values = fieldDef.values as string[];
      return () => faker.helpers.arrayElement(values);
    }

    // Default: return generator function
    return () => this.generateFieldValue(fieldDef);
  }

  /**
   * Generate a value for a field based on its definition
   */
  private generateFieldValue(fieldDef: FieldDefinition): unknown {
    // Use hint if available
    if (fieldDef.hint) {
      return this.generateFromHint(fieldDef.hint);
    }

    // Generate based on type
    switch (fieldDef.type) {
      case 'string':
        return faker.lorem.words(3);
      case 'uuid':
        return faker.string.uuid();
      case 'email':
        return faker.internet.email();
      case 'url':
        return faker.internet.url();
      case 'number':
      case 'int':
        return faker.number.int({ min: 0, max: 1000 });
      case 'float':
        return faker.number.float({ min: 0, max: 1000, fractionDigits: 2 });
      case 'boolean':
        return faker.datatype.boolean();
      case 'date':
        return faker.date.recent();
      case 'ref':
        return faker.string.uuid();
      default:
        return faker.lorem.word();
    }
  }

  /**
   * Generate data from a faker hint
   */
  private generateFromHint(hint: string): unknown {
    const parts = hint.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = faker;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return faker.lorem.words(2);
      }
    }

    if (typeof current === 'function') {
      return current();
    }

    return current;
  }

  /**
   * Generate fake data for an entity based on its schema
   */
  private generateFakeData(schema: EntitySchema): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    for (const [fieldName, field] of Object.entries(schema.fields)) {
      // Skip id field (will be generated)
      if (fieldName === 'id') continue;

      // Skip read-only fields
      if (field.readOnly) continue;

      data[fieldName] = this.generateFieldValue(field);

      // Apply nullable
      if (field.nullable && Math.random() < 0.1) {
        data[fieldName] = null;
      }

      // Apply default
      if (data[fieldName] === undefined && field.default !== undefined) {
        data[fieldName] = field.default;
      }
    }

    return data;
  }

  /**
   * Load related data for a relation
   */
  private async loadRelation(
    record: Record<string, unknown>,
    relation: RelationDefinition,
    schemas: Map<string, EntitySchema>
  ): Promise<unknown> {
    if (!this.db) return relation.type === 'hasMany' ? [] : null;

    const targetDb = this.db[relation.target];
    if (!targetDb) return relation.type === 'hasMany' ? [] : null;

    switch (relation.type) {
      case 'belongsTo': {
        const foreignKey = relation.foreignKey || `${relation.target}Id`;
        const foreignKeyValue = record[foreignKey];
        if (!foreignKeyValue) return null;
        return targetDb.findFirst({ where: { id: foreignKeyValue } });
      }

      case 'hasOne': {
        const foreignKey = relation.foreignKey || `${schemas.get(relation.target)?.name}Id`;
        return targetDb.findFirst({ where: { [foreignKey]: record.id } });
      }

      case 'hasMany': {
        // Determine the foreign key on the target entity
        const sourceEntityName = this.findEntityByRecord(record);
        const foreignKey = relation.foreignKey || `${sourceEntityName}Id`;

        const query: {
          where: Record<string, unknown>;
          orderBy?: Record<string, 'asc' | 'desc'>;
          take?: number;
        } = {
          where: { [foreignKey]: record.id },
        };

        if (relation.orderBy) {
          query.orderBy = relation.orderBy;
        }

        if (relation.limit) {
          query.take = relation.limit;
        }

        return targetDb.findMany(query);
      }

      default:
        return null;
    }
  }

  /**
   * Find the entity name for a record (used for hasMany foreign key inference)
   */
  private findEntityByRecord(_record: Record<string, unknown>): string {
    // This is a fallback - in practice, the relation should have foreignKey specified
    return 'entity';
  }
}
