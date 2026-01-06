/**
 * Factory Generator - Creates @mswjs/data factories from Schemock schemas
 *
 * Maps entity schemas to @mswjs/data factory definitions with
 * appropriate faker-based generators for each field.
 *
 * @module adapters/mock/factory
 * @category MockAdapter
 */

import { faker } from '@faker-js/faker';
import { primaryKey, nullable, oneOf } from '@mswjs/data';
import type { EntitySchema, FieldDefinition } from '../../schema/types';
import type { MswjsDataFactory } from '../types';
import { DataGenerator } from './generator';

/**
 * Generate an @mswjs/data factory from a Schemock entity schema.
 *
 * Maps field hints and types to faker.js calls, creating a factory
 * that @mswjs/data can use for its in-memory database.
 *
 * @param schema - The entity schema to generate a factory for
 * @returns An @mswjs/data compatible factory definition
 *
 * @example
 * ```typescript
 * const userSchema = defineData('user', {
 *   id: field.uuid(),
 *   name: field.string().hint('person.fullName'),
 *   email: field.email(),
 * });
 *
 * const factory = generateFactory(userSchema);
 * // => { id: primaryKey(faker.string.uuid), name: () => faker.person.fullName(), ... }
 * ```
 */
export function generateFactory(schema: EntitySchema): MswjsDataFactory {
  const generator = new DataGenerator();
  const factory: MswjsDataFactory = {};

  // Process each field in the schema
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    factory[fieldName] = createFieldGenerator(fieldName, fieldDef, generator);
  }

  // Add timestamp fields if enabled
  if (schema.timestamps) {
    factory.createdAt = () => faker.date.recent({ days: 30 });
    factory.updatedAt = () => new Date();
  }

  return factory;
}

/**
 * Create a generator for a single field.
 *
 * @param fieldName - The name of the field
 * @param fieldDef - The field definition
 * @param generator - The DataGenerator instance
 * @returns A generator for @mswjs/data (may be function, primaryKey, nullable, etc.)
 */
function createFieldGenerator(
  fieldName: string,
  fieldDef: FieldDefinition,
  generator: DataGenerator
): unknown {
  // Handle primary key (id field)
  if (fieldName === 'id') {
    return primaryKey(faker.string.uuid);
  }

  // Handle nullable fields
  if (fieldDef.nullable) {
    // Cast to satisfy @mswjs/data's strict types
    return nullable(() => generator.generateValue(fieldDef) as string);
  }

  // Handle reference fields (foreign keys)
  if (fieldDef.type === 'ref' && fieldDef.target) {
    // @mswjs/data requires special handling for references
    // Return a UUID generator - actual relations are handled separately
    return () => faker.string.uuid();
  }

  // Handle enum fields - use simple random picker instead of @mswjs/data oneOf
  // due to type compatibility issues with oneOf() spread arguments
  if (fieldDef.values && fieldDef.values.length > 0) {
    const values = fieldDef.values as string[];
    return () => faker.helpers.arrayElement(values);
  }

  // Default: use DataGenerator for the field
  return () => generator.generateValue(fieldDef);
}

/**
 * Generate factories for multiple schemas.
 *
 * @param schemas - Array of entity schemas
 * @returns A map of entity names to factories
 *
 * @example
 * ```typescript
 * const schemas = [userSchema, postSchema, commentSchema];
 * const factories = generateFactories(schemas);
 * // => { user: {...}, post: {...}, comment: {...} }
 * ```
 */
export function generateFactories(
  schemas: EntitySchema[]
): Record<string, MswjsDataFactory> {
  const factories: Record<string, MswjsDataFactory> = {};

  for (const schema of schemas) {
    factories[schema.name] = generateFactory(schema);
  }

  return factories;
}
