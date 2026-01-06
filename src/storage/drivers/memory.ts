/**
 * MemoryStorageDriver - Simple in-memory storage implementation
 *
 * Uses plain JavaScript Maps for storage. Lightweight, no external
 * dependencies. Ideal for unit tests and simple applications.
 *
 * @module storage/drivers/memory
 * @category Storage
 */

import { faker } from '@faker-js/faker';
import type { EntitySchema, RelationDefinition } from '../../schema/types';
import type { StorageDriver, QueryOptions, QueryMeta, StorageDriverConfig } from '../types';

/**
 * In-memory storage driver using JavaScript Maps.
 *
 * Features:
 * - Full CRUD operations
 * - Filtering, sorting, pagination
 * - Relation hydration
 * - Seeding with fake data
 * - Zero external dependencies
 *
 * @example
 * ```typescript
 * const driver = new MemoryStorageDriver({ fakerSeed: 123 });
 * await driver.initialize(schemas);
 *
 * const user = await driver.create('user', { name: 'John' });
 * const users = await driver.findMany('user', { where: { role: 'admin' } });
 * ```
 */
export class MemoryStorageDriver implements StorageDriver {
  readonly name = 'memory';

  /** Storage for all entities: Map<entityName, Map<id, record>> */
  private storage: Map<string, Map<string, Record<string, unknown>>> = new Map();

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

    // Initialize storage for each entity
    for (const schema of schemas) {
      this.storage.set(schema.name, new Map());
    }

    if (this.config.debug) {
      console.log(`[MemoryStorageDriver] Initialized with ${schemas.length} entities`);
    }
  }

  async create<T>(entity: string, data: Record<string, unknown>): Promise<T> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

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

    entityStorage.set(id, record);

    if (this.config.debug) {
      console.log(`[MemoryStorageDriver] Created ${entity}:`, id);
    }

    return record as T;
  }

  async findOne<T>(entity: string, where: Record<string, unknown>): Promise<T | null> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    // If searching by ID, direct lookup
    if (where.id && Object.keys(where).length === 1) {
      const record = entityStorage.get(where.id as string);
      return (record as T) || null;
    }

    // Otherwise, scan for first match
    for (const record of entityStorage.values()) {
      if (this.matchesWhere(record, where)) {
        return record as T;
      }
    }

    return null;
  }

  async findMany<T>(entity: string, options?: QueryOptions): Promise<{ data: T[]; meta: QueryMeta }> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    let results = Array.from(entityStorage.values());

    // Apply filtering
    if (options?.where) {
      results = results.filter((record) => this.matchesWhere(record, options.where!));
    }

    const total = results.length;

    // Apply sorting
    if (options?.orderBy) {
      results = this.sortRecords(results, options.orderBy);
    }

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit;

    if (offset > 0) {
      results = results.slice(offset);
    }

    if (limit !== undefined) {
      results = results.slice(0, limit);
    }

    const hasMore = limit !== undefined ? offset + results.length < total : false;

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
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    const schema = this.schemas.get(entity);

    // Find the record to update
    let recordId: string | null = null;
    let existingRecord: Record<string, unknown> | null = null;

    if (where.id && Object.keys(where).length === 1) {
      recordId = where.id as string;
      existingRecord = entityStorage.get(recordId) || null;
    } else {
      for (const [id, record] of entityStorage.entries()) {
        if (this.matchesWhere(record, where)) {
          recordId = id;
          existingRecord = record;
          break;
        }
      }
    }

    if (!existingRecord || !recordId) {
      return null;
    }

    // Update the record
    const updated: Record<string, unknown> = {
      ...existingRecord,
      ...data,
      id: recordId, // Preserve ID
      ...(schema?.timestamps ? { updatedAt: new Date() } : {}),
    };

    entityStorage.set(recordId, updated);

    if (this.config.debug) {
      console.log(`[MemoryStorageDriver] Updated ${entity}:`, recordId);
    }

    return updated as T;
  }

  async delete(entity: string, where: Record<string, unknown>): Promise<boolean> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    // Find the record to delete
    let recordId: string | null = null;

    if (where.id && Object.keys(where).length === 1) {
      recordId = where.id as string;
    } else {
      for (const [id, record] of entityStorage.entries()) {
        if (this.matchesWhere(record, where)) {
          recordId = id;
          break;
        }
      }
    }

    if (!recordId) {
      return false;
    }

    const deleted = entityStorage.delete(recordId);

    if (this.config.debug && deleted) {
      console.log(`[MemoryStorageDriver] Deleted ${entity}:`, recordId);
    }

    return deleted;
  }

  async count(entity: string, where?: Record<string, unknown>): Promise<number> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    if (!where) {
      return entityStorage.size;
    }

    let count = 0;
    for (const record of entityStorage.values()) {
      if (this.matchesWhere(record, where)) {
        count++;
      }
    }

    return count;
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
        console.warn(`[MemoryStorageDriver] Cannot seed unknown entity: ${entityName}`);
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

      for (const [relationName, relation] of Object.entries(schema.relations)) {
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
      console.log(`[MemoryStorageDriver] Seeded:`, counts);
    }
  }

  async reset(): Promise<void> {
    for (const entityStorage of this.storage.values()) {
      entityStorage.clear();
    }

    if (this.config.debug) {
      console.log(`[MemoryStorageDriver] Reset all data`);
    }
  }

  async getAll<T>(entity: string): Promise<T[]> {
    const entityStorage = this.storage.get(entity);
    if (!entityStorage) {
      throw new Error(`Entity '${entity}' not found`);
    }

    return Array.from(entityStorage.values()) as T[];
  }

  /**
   * Check if a record matches the where clause
   */
  private matchesWhere(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(where)) {
      const recordValue = record[key];

      // Handle null comparisons
      if (value === null) {
        if (recordValue !== null) return false;
        continue;
      }

      // Handle object comparisons (operators like { gte: 5 })
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (!this.matchesOperators(recordValue, value as Record<string, unknown>)) {
          return false;
        }
        continue;
      }

      // Direct equality
      if (recordValue !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a value matches operator conditions
   */
  private matchesOperators(value: unknown, operators: Record<string, unknown>): boolean {
    for (const [op, target] of Object.entries(operators)) {
      switch (op) {
        case 'equals':
          if (value !== target) return false;
          break;
        case 'not':
          if (value === target) return false;
          break;
        case 'in':
          if (!Array.isArray(target) || !target.includes(value)) return false;
          break;
        case 'notIn':
          if (Array.isArray(target) && target.includes(value)) return false;
          break;
        case 'lt':
          if (typeof value !== 'number' || typeof target !== 'number' || value >= target) return false;
          break;
        case 'lte':
          if (typeof value !== 'number' || typeof target !== 'number' || value > target) return false;
          break;
        case 'gt':
          if (typeof value !== 'number' || typeof target !== 'number' || value <= target) return false;
          break;
        case 'gte':
          if (typeof value !== 'number' || typeof target !== 'number' || value < target) return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || !value.includes(target as string)) return false;
          break;
        case 'startsWith':
          if (typeof value !== 'string' || !value.startsWith(target as string)) return false;
          break;
        case 'endsWith':
          if (typeof value !== 'string' || !value.endsWith(target as string)) return false;
          break;
        default:
          // Unknown operator, treat as nested equality
          if (value !== target) return false;
      }
    }
    return true;
  }

  /**
   * Sort records by orderBy configuration
   */
  private sortRecords(
    records: Record<string, unknown>[],
    orderBy: Record<string, 'asc' | 'desc'>
  ): Record<string, unknown>[] {
    return [...records].sort((a, b) => {
      for (const [field, direction] of Object.entries(orderBy)) {
        const aVal = a[field];
        const bVal = b[field];

        // Handle null/undefined
        if (aVal == null && bVal == null) continue;
        if (aVal == null) return direction === 'asc' ? 1 : -1;
        if (bVal == null) return direction === 'asc' ? -1 : 1;

        // Compare values
        let comparison = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (aVal instanceof Date && bVal instanceof Date) {
          comparison = aVal.getTime() - bVal.getTime();
        } else {
          comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        }

        if (comparison !== 0) {
          return direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Load related data for a relation
   */
  private async loadRelation(
    record: Record<string, unknown>,
    relation: RelationDefinition,
    schemas: Map<string, EntitySchema>
  ): Promise<unknown> {
    const targetStorage = this.storage.get(relation.target);
    if (!targetStorage) return relation.type === 'hasMany' ? [] : null;

    switch (relation.type) {
      case 'belongsTo': {
        // Record has a foreign key pointing to target
        const foreignKey = relation.foreignKey || `${relation.target}Id`;
        const foreignKeyValue = record[foreignKey];
        if (!foreignKeyValue) return null;
        return targetStorage.get(foreignKeyValue as string) || null;
      }

      case 'hasOne': {
        // Target has a foreign key pointing to this record
        const foreignKey = relation.foreignKey || `${schemas.get(relation.target)?.name}Id`;
        for (const targetRecord of targetStorage.values()) {
          if (targetRecord[foreignKey] === record.id) {
            return targetRecord;
          }
        }
        return null;
      }

      case 'hasMany': {
        // Target has a foreign key pointing to this record
        const foreignKey = relation.foreignKey || `${this.getEntityNameFromRecord(record)}Id`;
        const results: Record<string, unknown>[] = [];

        for (const targetRecord of targetStorage.values()) {
          if (targetRecord[foreignKey] === record.id) {
            results.push(targetRecord);
          }
        }

        // Apply ordering if specified
        if (relation.orderBy) {
          return this.sortRecords(results, relation.orderBy);
        }

        // Apply limit if specified
        if (relation.limit) {
          return results.slice(0, relation.limit);
        }

        return results;
      }

      default:
        return null;
    }
  }

  /**
   * Try to determine entity name from record (fallback)
   */
  private getEntityNameFromRecord(_record: Record<string, unknown>): string {
    // This is a fallback - in practice, the foreign key should be specified
    return 'entity';
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

      // Use faker hint if available
      if (field.hint) {
        data[fieldName] = this.generateFromHint(field.hint);
        continue;
      }

      // Generate based on type
      switch (field.type) {
        case 'string':
          data[fieldName] = faker.lorem.words(3);
          break;
        case 'uuid':
          data[fieldName] = faker.string.uuid();
          break;
        case 'email':
          data[fieldName] = faker.internet.email();
          break;
        case 'url':
          data[fieldName] = faker.internet.url();
          break;
        case 'number':
        case 'int':
          data[fieldName] = faker.number.int({ min: 0, max: 1000 });
          break;
        case 'float':
          data[fieldName] = faker.number.float({ min: 0, max: 1000, fractionDigits: 2 });
          break;
        case 'boolean':
          data[fieldName] = faker.datatype.boolean();
          break;
        case 'date':
          data[fieldName] = faker.date.recent();
          break;
        case 'enum':
          if (field.values?.length) {
            data[fieldName] = field.values[Math.floor(Math.random() * field.values.length)];
          }
          break;
        default:
          // Skip unknown types or relations
          break;
      }

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
   * Generate data from a faker hint (e.g., 'person.fullName')
   */
  private generateFromHint(hint: string): unknown {
    const parts = hint.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = faker;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return faker.lorem.words(2); // Fallback
      }
    }

    if (typeof current === 'function') {
      return current();
    }

    return current;
  }
}
