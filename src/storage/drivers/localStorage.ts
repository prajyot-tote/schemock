/**
 * LocalStorageDriver - Persistent browser storage implementation
 *
 * Uses localStorage for persistence with in-memory cache for performance.
 * Data survives page refreshes and browser restarts.
 *
 * @module storage/drivers/localStorage
 * @category Storage
 */

import { faker } from '@faker-js/faker';
import type { EntitySchema, RelationDefinition } from '../../schema/types';
import type { StorageDriver, QueryOptions, QueryMeta, StorageDriverConfig } from '../types';

/**
 * Configuration for LocalStorageDriver
 */
export interface LocalStorageDriverConfig extends StorageDriverConfig {
  /** Storage key prefix (default: 'schemock') */
  storageKey?: string;
  /** Whether to sync on every write (default: true) */
  autoSync?: boolean;
  /** Debounce time for syncing in ms (default: 100) */
  syncDebounce?: number;
}

/**
 * LocalStorage driver with automatic persistence.
 *
 * Features:
 * - Full CRUD operations with localStorage persistence
 * - In-memory cache for fast reads
 * - Automatic sync on writes (configurable)
 * - Debounced writes to reduce localStorage calls
 * - Fallback to memory-only if localStorage unavailable
 *
 * @example
 * ```typescript
 * const driver = new LocalStorageDriver({ storageKey: 'myapp' });
 * await driver.initialize(schemas);
 *
 * // Data persists across page refreshes
 * const user = await driver.create('user', { name: 'John' });
 * // Refresh page...
 * const users = await driver.findMany('user'); // John still there!
 * ```
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'localStorage';

  /** In-memory cache: Map<entityName, Map<id, record>> */
  private storage: Map<string, Map<string, Record<string, unknown>>> = new Map();

  /** Entity schemas for reference */
  private schemas: Map<string, EntitySchema> = new Map();

  /** Configuration options */
  private config: LocalStorageDriverConfig;

  /** Debounce timer for sync */
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  /** Whether localStorage is available */
  private hasLocalStorage: boolean;

  constructor(config?: LocalStorageDriverConfig) {
    this.config = {
      storageKey: 'schemock',
      autoSync: true,
      syncDebounce: 100,
      ...config,
    };

    if (this.config.fakerSeed) {
      faker.seed(this.config.fakerSeed);
    }

    // Check if localStorage is available
    this.hasLocalStorage = this.checkLocalStorageAvailable();

    if (!this.hasLocalStorage && this.config.debug) {
      console.warn('[LocalStorageDriver] localStorage not available, falling back to memory-only');
    }
  }

  /**
   * Check if localStorage is available (handles SSR, private browsing, etc.)
   */
  private checkLocalStorageAvailable(): boolean {
    try {
      const testKey = '__schemock_test__';
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full storage key for an entity
   */
  private getStorageKey(entity: string): string {
    return `${this.config.storageKey}:${entity}`;
  }

  /**
   * Load data from localStorage into memory cache
   */
  private loadFromStorage(entity: string): void {
    if (!this.hasLocalStorage) return;

    try {
      const key = this.getStorageKey(entity);
      const data = window.localStorage.getItem(key);

      if (data) {
        const records = JSON.parse(data) as Record<string, unknown>[];
        const entityStorage = this.storage.get(entity)!;

        for (const record of records) {
          // Restore Date objects
          const restored = this.restoreDates(record);
          entityStorage.set(restored.id as string, restored);
        }

        if (this.config.debug) {
          console.log(`[LocalStorageDriver] Loaded ${records.length} records for ${entity}`);
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.error(`[LocalStorageDriver] Error loading ${entity}:`, error);
      }
    }
  }

  /**
   * Save entity data to localStorage
   */
  private saveToStorage(entity: string): void {
    if (!this.hasLocalStorage) return;

    try {
      const entityStorage = this.storage.get(entity);
      if (!entityStorage) return;

      const key = this.getStorageKey(entity);
      const records = Array.from(entityStorage.values());
      window.localStorage.setItem(key, JSON.stringify(records));

      if (this.config.debug) {
        console.log(`[LocalStorageDriver] Saved ${records.length} records for ${entity}`);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error(`[LocalStorageDriver] Error saving ${entity}:`, error);
      }
    }
  }

  /**
   * Schedule a debounced sync to localStorage
   */
  private scheduleSync(entity: string): void {
    if (!this.config.autoSync) return;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.saveToStorage(entity);
      this.syncTimer = null;
    }, this.config.syncDebounce);
  }

  /**
   * Restore Date objects from JSON (stored as ISO strings)
   */
  private restoreDates(record: Record<string, unknown>): Record<string, unknown> {
    const result = { ...record };

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string') {
        // Check if it looks like an ISO date string
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            result[key] = date;
          }
        }
      }
    }

    return result;
  }

  async initialize(schemas: EntitySchema[]): Promise<void> {
    this.schemas = new Map(schemas.map((s) => [s.name, s]));

    // Initialize storage for each entity and load from localStorage
    for (const schema of schemas) {
      this.storage.set(schema.name, new Map());
      this.loadFromStorage(schema.name);
    }

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Initialized with ${schemas.length} entities`);
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
    this.scheduleSync(entity);

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Created ${entity}:`, id);
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
    this.scheduleSync(entity);

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Updated ${entity}:`, recordId);
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

    if (deleted) {
      this.scheduleSync(entity);
    }

    if (this.config.debug && deleted) {
      console.log(`[LocalStorageDriver] Deleted ${entity}:`, recordId);
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
        console.warn(`[LocalStorageDriver] Cannot seed unknown entity: ${entityName}`);
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

      for (const [, relation] of Object.entries(schema.relations)) {
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

    // Force immediate sync after seeding
    for (const entityName of Object.keys(counts)) {
      this.saveToStorage(entityName);
    }

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Seeded:`, counts);
    }
  }

  async reset(): Promise<void> {
    for (const [entityName, entityStorage] of this.storage.entries()) {
      entityStorage.clear();

      // Also clear from localStorage
      if (this.hasLocalStorage) {
        const key = this.getStorageKey(entityName);
        window.localStorage.removeItem(key);
      }
    }

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Reset all data`);
    }
  }

  /**
   * Force sync all data to localStorage immediately
   */
  async sync(): Promise<void> {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    for (const entityName of this.storage.keys()) {
      this.saveToStorage(entityName);
    }

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Forced sync complete`);
    }
  }

  /**
   * Clear all schemock data from localStorage
   */
  clearStorage(): void {
    if (!this.hasLocalStorage) return;

    const prefix = `${this.config.storageKey}:`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }

    if (this.config.debug) {
      console.log(`[LocalStorageDriver] Cleared ${keysToRemove.length} keys from localStorage`);
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
