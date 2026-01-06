/**
 * DataGenerator - Intelligent fake data generation using Faker.js
 *
 * Generates realistic mock data based on field hints and types.
 * Maps Schemock field definitions to appropriate Faker.js methods.
 *
 * @module adapters/mock/generator
 * @category MockAdapter
 */

import { faker } from '@faker-js/faker';
import type { FieldDefinition, EntitySchema } from '../../schema/types';

/**
 * Maps field hints to Faker.js generator functions.
 * Supports common data patterns like names, emails, UUIDs, etc.
 */
type FakerGenerator = () => unknown;

/**
 * DataGenerator class for generating realistic fake data.
 *
 * Uses Faker.js internally to produce data that matches field hints
 * and types defined in entity schemas.
 *
 * @example
 * ```typescript
 * const generator = new DataGenerator();
 *
 * // Generate a single value based on field definition
 * const email = generator.generateValue({ type: 'email', hint: 'internet.email' });
 *
 * // Generate a complete entity
 * const user = generator.generateEntity(userSchema);
 *
 * // Generate multiple entities
 * const users = generator.generateMany(userSchema, 10);
 * ```
 */
export class DataGenerator {
  /**
   * Mapping of field hints to Faker.js generator functions.
   * Supports common patterns used in Schemock schemas.
   */
  private hintToFaker: Record<string, FakerGenerator> = {
    // Person
    fullName: () => faker.person.fullName(),
    firstName: () => faker.person.firstName(),
    lastName: () => faker.person.lastName(),
    'person.fullName': () => faker.person.fullName(),
    'person.firstName': () => faker.person.firstName(),
    'person.lastName': () => faker.person.lastName(),

    // Internet
    email: () => faker.internet.email(),
    'internet.email': () => faker.internet.email(),
    username: () => faker.internet.username(),
    'internet.username': () => faker.internet.username(),
    url: () => faker.internet.url(),
    'internet.url': () => faker.internet.url(),
    avatar: () => faker.image.avatar(),
    'image.avatar': () => faker.image.avatar(),

    // Identifiers
    uuid: () => faker.string.uuid(),
    'string.uuid': () => faker.string.uuid(),

    // Phone
    phone: () => faker.phone.number(),
    'phone.number': () => faker.phone.number(),

    // Location
    address: () => faker.location.streetAddress(),
    'location.streetAddress': () => faker.location.streetAddress(),
    city: () => faker.location.city(),
    'location.city': () => faker.location.city(),
    country: () => faker.location.country(),
    'location.country': () => faker.location.country(),
    zipCode: () => faker.location.zipCode(),
    'location.zipCode': () => faker.location.zipCode(),

    // Commerce
    price: () => parseFloat(faker.commerce.price()),
    'commerce.price': () => parseFloat(faker.commerce.price()),
    productName: () => faker.commerce.productName(),
    'commerce.productName': () => faker.commerce.productName(),
    company: () => faker.company.name(),
    'company.name': () => faker.company.name(),

    // Lorem
    sentence: () => faker.lorem.sentence(),
    'lorem.sentence': () => faker.lorem.sentence(),
    paragraph: () => faker.lorem.paragraph(),
    'lorem.paragraph': () => faker.lorem.paragraph(),
    text: () => faker.lorem.text(),
    'lorem.text': () => faker.lorem.text(),
    word: () => faker.lorem.word(),
    'lorem.word': () => faker.lorem.word(),
    title: () => faker.lorem.sentence({ min: 2, max: 5 }),

    // Date
    past: () => faker.date.past(),
    'date.past': () => faker.date.past(),
    future: () => faker.date.future(),
    'date.future': () => faker.date.future(),
    recent: () => faker.date.recent(),
    'date.recent': () => faker.date.recent(),
    birthdate: () => faker.date.birthdate(),
    'date.birthdate': () => faker.date.birthdate(),

    // Numbers
    int: () => faker.number.int({ min: 1, max: 1000 }),
    'number.int': () => faker.number.int({ min: 1, max: 1000 }),
    float: () => faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }),
    'number.float': () => faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }),

    // Boolean
    boolean: () => faker.datatype.boolean(),
    'datatype.boolean': () => faker.datatype.boolean(),

    // Image
    imageUrl: () => faker.image.url(),
    'image.url': () => faker.image.url(),

    // Color
    color: () => faker.color.human(),
    'color.human': () => faker.color.human(),
    hexColor: () => faker.color.rgb(),
    'color.rgb': () => faker.color.rgb(),
  };

  /**
   * Generate a value for a single field definition.
   *
   * @param field - The field definition to generate a value for
   * @returns A generated value appropriate for the field type
   *
   * @example
   * ```typescript
   * const generator = new DataGenerator();
   *
   * // Using hint
   * generator.generateValue({ type: 'string', hint: 'email' });
   * // => "john.doe@example.com"
   *
   * // Using type only
   * generator.generateValue({ type: 'number' });
   * // => 42
   * ```
   */
  generateValue(field: FieldDefinition): unknown {
    // Handle nullable fields
    if (field.nullable && Math.random() < 0.1) {
      return null;
    }

    // If there's a default value, use it sometimes
    if (field.default !== undefined && Math.random() < 0.3) {
      return field.default;
    }

    // If there's a hint, use the mapped faker function
    if (field.hint && this.hintToFaker[field.hint]) {
      return this.hintToFaker[field.hint]();
    }

    // For enum fields, pick a random value
    if (field.values && field.values.length > 0) {
      return faker.helpers.arrayElement(field.values as unknown[]);
    }

    // Fall back to type-based generation
    return this.generateByType(field);
  }

  /**
   * Generate a complete entity based on its schema definition.
   *
   * @param schema - The entity schema to generate data for
   * @returns A generated entity object with all fields populated
   *
   * @example
   * ```typescript
   * const userSchema = defineData('user', {
   *   id: field.uuid(),
   *   name: field.string().hint('person.fullName'),
   *   email: field.email(),
   * });
   *
   * const user = generator.generateEntity(userSchema);
   * // => { id: "abc-123", name: "John Doe", email: "john@example.com" }
   * ```
   */
  generateEntity<T extends Record<string, unknown>>(schema: EntitySchema): T {
    const entity: Record<string, unknown> = {};

    // Generate all field values
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      // Skip read-only fields that aren't 'id' (they'll be computed)
      if (fieldDef.readOnly && fieldName !== 'id') {
        continue;
      }

      entity[fieldName] = this.generateValue(fieldDef);
    }

    // Add timestamps if enabled
    if (schema.timestamps) {
      const now = new Date();
      entity.createdAt = faker.date.recent({ days: 30 });
      entity.updatedAt = now;
    }

    return entity as T;
  }

  /**
   * Generate multiple entities based on a schema.
   *
   * @param schema - The entity schema to generate data for
   * @param count - The number of entities to generate
   * @returns An array of generated entities
   *
   * @example
   * ```typescript
   * const users = generator.generateMany(userSchema, 10);
   * // => [{ id: "...", name: "..." }, ...]
   * ```
   */
  generateMany<T extends Record<string, unknown>>(schema: EntitySchema, count: number): T[] {
    const entities: T[] = [];

    for (let i = 0; i < count; i++) {
      entities.push(this.generateEntity<T>(schema));
    }

    return entities;
  }

  /**
   * Register a custom hint-to-faker mapping.
   *
   * @param hint - The hint name to register
   * @param generator - The faker generator function
   *
   * @example
   * ```typescript
   * generator.registerHint('customId', () => `CUSTOM-${faker.string.alphanumeric(8)}`);
   * ```
   */
  registerHint(hint: string, generator: FakerGenerator): void {
    this.hintToFaker[hint] = generator;
  }

  /**
   * Generate a value based on field type when no hint is provided.
   *
   * @param field - The field definition
   * @returns A generated value appropriate for the type
   */
  private generateByType(field: FieldDefinition): unknown {
    switch (field.type) {
      case 'string':
        return faker.lorem.word();

      case 'uuid':
        return faker.string.uuid();

      case 'email':
        return faker.internet.email();

      case 'url':
        return faker.internet.url();

      case 'number':
      case 'int':
        return this.generateNumber(field);

      case 'float':
        return this.generateFloat(field);

      case 'boolean':
        return faker.datatype.boolean();

      case 'date':
        return faker.date.recent();

      case 'array':
        return this.generateArray(field);

      case 'object':
        return this.generateObject(field);

      case 'ref':
        // References are handled by the adapter, generate a placeholder UUID
        return faker.string.uuid();

      default:
        return faker.lorem.word();
    }
  }

  /**
   * Generate a number value respecting constraints.
   */
  private generateNumber(field: FieldDefinition): number {
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 1000;
    return faker.number.int({ min, max });
  }

  /**
   * Generate a float value respecting constraints.
   */
  private generateFloat(field: FieldDefinition): number {
    const min = field.constraints?.min ?? 0;
    const max = field.constraints?.max ?? 1000;
    return faker.number.float({ min, max, fractionDigits: 2 });
  }

  /**
   * Generate an array value based on items definition.
   */
  private generateArray(field: FieldDefinition): unknown[] {
    const minLength = field.constraints?.min ?? 1;
    const maxLength = field.constraints?.max ?? 5;
    const length = faker.number.int({ min: minLength, max: maxLength });

    if (!field.items) {
      return Array.from({ length }, () => faker.lorem.word());
    }

    return Array.from({ length }, () => this.generateValue(field.items!));
  }

  /**
   * Generate an object value based on shape definition.
   */
  private generateObject(field: FieldDefinition): Record<string, unknown> {
    if (!field.shape) {
      return { key: faker.lorem.word() };
    }

    const obj: Record<string, unknown> = {};
    for (const [key, shapeDef] of Object.entries(field.shape)) {
      obj[key] = this.generateValue(shapeDef);
    }
    return obj;
  }
}

/**
 * Default DataGenerator instance for convenience.
 */
export const dataGenerator = new DataGenerator();
