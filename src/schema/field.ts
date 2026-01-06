/**
 * Field builder functions for the Schemock Schema DSL.
 * Provides a fluent API for defining entity fields with type-specific defaults
 * and chainable modifiers.
 *
 * @module schema/field
 * @category Schema
 *
 * @example
 * ```typescript
 * import { field } from 'schemock/schema';
 *
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   name: field.string({ hint: 'person.fullName' }),
 *   email: field.email().unique(),
 *   age: field.number({ min: 0, max: 150 }).nullable(),
 *   role: field.enum(['admin', 'user']).default('user'),
 *   createdAt: field.date().readOnly(),
 * });
 * ```
 */

import type {
  FieldDefinition,
  FieldBuilder,
  StringFieldBuilder,
  NumberFieldBuilder,
  DateFieldBuilder,
  EnumFieldBuilder,
  RefFieldBuilder,
  ArrayFieldBuilder,
  ObjectFieldBuilder,
  ComputedFieldDefinition,
  FieldConstraints,
} from './types';

// ============================================================================
// Internal Builder Factory
// ============================================================================

/**
 * Internal state for field builder
 * @internal
 */
interface BuilderState<T> {
  type: string;
  hint?: string;
  isNullable?: boolean;
  isUnique?: boolean;
  isReadOnly?: boolean;
  defaultValue?: T;
  constraints?: FieldConstraints;
  items?: FieldDefinition;
  shape?: Record<string, FieldDefinition>;
  target?: string;
  values?: readonly T[];
}

/**
 * Creates a base field builder with chainable methods
 * @internal
 */
function createBaseBuilder<T>(state: BuilderState<T>): FieldBuilder<T> {
  const builder: FieldBuilder<T> = {
    type: state.type,
    hint: state.hint,
    isNullable: state.isNullable,
    isUnique: state.isUnique,
    isReadOnly: state.isReadOnly,
    defaultValue: state.defaultValue,
    constraints: state.constraints,
    items: state.items,
    shape: state.shape,
    target: state.target,
    values: state.values,

    nullable(): FieldBuilder<T | null> {
      return createBaseBuilder<T | null>({ ...state, isNullable: true });
    },

    unique(message?: string): FieldBuilder<T> {
      return createBaseBuilder<T>({
        ...state,
        isUnique: true,
        constraints: { ...state.constraints, message: message || state.constraints?.message },
      });
    },

    readOnly(): FieldBuilder<T> {
      return createBaseBuilder<T>({ ...state, isReadOnly: true });
    },

    default(value: T): FieldBuilder<T> {
      return createBaseBuilder<T>({ ...state, defaultValue: value });
    },

    min(value: number, message?: string): FieldBuilder<T> {
      return createBaseBuilder<T>({
        ...state,
        constraints: { ...state.constraints, min: value, message: message || state.constraints?.message },
      });
    },

    max(value: number, message?: string): FieldBuilder<T> {
      return createBaseBuilder<T>({
        ...state,
        constraints: { ...state.constraints, max: value, message: message || state.constraints?.message },
      });
    },

    pattern(regex: RegExp, message?: string): FieldBuilder<T> {
      return createBaseBuilder<T>({
        ...state,
        constraints: { ...state.constraints, pattern: regex, message: message || state.constraints?.message },
      });
    },
  };

  return builder;
}

/**
 * Creates a string field builder with string-specific methods
 * @internal
 */
function createStringBuilder(state: BuilderState<string>): StringFieldBuilder {
  const base = createBaseBuilder<string>(state);
  return {
    ...base,
    min(length: number, message?: string): StringFieldBuilder {
      return createStringBuilder({
        ...state,
        constraints: { ...state.constraints, min: length, message: message || state.constraints?.message },
      });
    },
    max(length: number, message?: string): StringFieldBuilder {
      return createStringBuilder({
        ...state,
        constraints: { ...state.constraints, max: length, message: message || state.constraints?.message },
      });
    },
    pattern(regex: RegExp, message?: string): StringFieldBuilder {
      return createStringBuilder({
        ...state,
        constraints: { ...state.constraints, pattern: regex, message: message || state.constraints?.message },
      });
    },
  } as StringFieldBuilder;
}

/**
 * Creates a number field builder with numeric-specific methods
 * @internal
 */
function createNumberBuilder(state: BuilderState<number>): NumberFieldBuilder {
  const base = createBaseBuilder<number>(state);
  return {
    ...base,
    min(value: number, message?: string): NumberFieldBuilder {
      return createNumberBuilder({
        ...state,
        constraints: { ...state.constraints, min: value, message: message || state.constraints?.message },
      });
    },
    max(value: number, message?: string): NumberFieldBuilder {
      return createNumberBuilder({
        ...state,
        constraints: { ...state.constraints, max: value, message: message || state.constraints?.message },
      });
    },
    int(): NumberFieldBuilder {
      return createNumberBuilder({ ...state, hint: 'number.int' });
    },
  } as NumberFieldBuilder;
}

/**
 * Creates a date field builder with date-specific methods
 * @internal
 */
function createDateBuilder(state: BuilderState<Date>): DateFieldBuilder {
  const base = createBaseBuilder<Date>(state);
  return {
    ...base,
    past(): DateFieldBuilder {
      return createDateBuilder({ ...state, hint: 'date.past' });
    },
    future(): DateFieldBuilder {
      return createDateBuilder({ ...state, hint: 'date.future' });
    },
    recent(): DateFieldBuilder {
      return createDateBuilder({ ...state, hint: 'date.recent' });
    },
    between(options: { from: string | Date; to: string | Date }): DateFieldBuilder {
      return createDateBuilder({
        ...state,
        hint: 'date.between',
        constraints: {
          ...state.constraints,
          // Store date range in constraints for MockAdapter to use
          min: new Date(options.from).getTime(),
          max: new Date(options.to).getTime(),
        },
      });
    },
  } as DateFieldBuilder;
}

/**
 * Creates an enum field builder with type-safe values
 * @internal
 */
function createEnumBuilder<T extends string>(values: readonly T[], defaultVal?: T): EnumFieldBuilder<T> {
  const state: BuilderState<T> = {
    type: 'enum',
    values,
    hint: 'helpers.arrayElement',
    defaultValue: defaultVal,
  };
  const base = createBaseBuilder<T>(state);
  return {
    ...base,
    default(value: T): EnumFieldBuilder<T> {
      return createEnumBuilder(values, value);
    },
  } as EnumFieldBuilder<T>;
}

/**
 * Creates a reference field builder
 * @internal
 */
function createRefBuilder(target: string): RefFieldBuilder {
  const state: BuilderState<string> = {
    type: 'ref',
    target,
    hint: 'string.uuid',
  };
  return {
    ...createBaseBuilder<string>(state),
    target,
  } as RefFieldBuilder;
}

/**
 * Creates an array field builder
 * @internal
 */
function createArrayBuilder<T>(itemType: FieldDefinition<T>, constraints?: FieldConstraints): ArrayFieldBuilder<T> {
  const state: BuilderState<T[]> = {
    type: 'array',
    items: itemType,
    hint: 'array',
    constraints,
  };
  const base = createBaseBuilder<T[]>(state);
  return {
    ...base,
    min(length: number): ArrayFieldBuilder<T> {
      return createArrayBuilder(itemType, { ...constraints, min: length });
    },
    max(length: number): ArrayFieldBuilder<T> {
      return createArrayBuilder(itemType, { ...constraints, max: length });
    },
    length(count: number): ArrayFieldBuilder<T> {
      return createArrayBuilder(itemType, { ...constraints, min: count, max: count });
    },
  } as ArrayFieldBuilder<T>;
}

/**
 * Creates an object field builder with nested shape
 * @internal
 */
function createObjectBuilder<T extends Record<string, unknown>>(shape: Record<string, FieldDefinition>): ObjectFieldBuilder<T> {
  const state: BuilderState<T> = {
    type: 'object',
    shape,
    hint: 'object',
  };
  return {
    ...createBaseBuilder<T>(state),
    shape,
  } as ObjectFieldBuilder<T>;
}

// ============================================================================
// Computed Field Factory
// ============================================================================

/**
 * Creates a computed field definition
 *
 * @param config - Computed field configuration
 * @returns ComputedFieldDefinition
 *
 * @example
 * ```typescript
 * const fullName = field.computed({
 *   resolve: (entity) => `${entity.firstName} ${entity.lastName}`,
 *   dependsOn: ['firstName', 'lastName'],
 * });
 * ```
 */
function createComputedField<T>(config: {
  mock?: () => T;
  resolve: (entity: Record<string, unknown>, db: unknown, ctx: unknown) => T | Promise<T>;
  dependsOn?: string[];
}): ComputedFieldDefinition<T> {
  return {
    ...config,
    _computed: true as const,
  };
}

// ============================================================================
// Field Builder API
// ============================================================================

/**
 * Fluent builder API for defining entity fields with type-specific defaults
 * and chainable modifiers.
 *
 * @example
 * ```typescript
 * // Basic types
 * field.uuid()                          // UUID v4 string
 * field.string()                        // Random string
 * field.number()                        // Random number
 * field.boolean()                       // Random boolean
 * field.date()                          // Random date
 *
 * // With constraints
 * field.string().min(1).max(100)        // Constrained string
 * field.number({ min: 0, max: 100 })    // Bounded number
 *
 * // With modifiers
 * field.string().nullable()             // Can be null
 * field.email().unique()                // Must be unique
 * field.date().readOnly()               // Excluded from create/update
 *
 * // Complex types
 * field.enum(['a', 'b', 'c'])          // One of values
 * field.ref('user')                     // Reference to entity
 * field.array(field.string())           // Array of strings
 * field.object({ name: field.string() }) // Nested object
 *
 * // Computed fields
 * field.computed({
 *   resolve: (entity) => entity.firstName + entity.lastName,
 *   dependsOn: ['firstName', 'lastName'],
 * })
 * ```
 */
export const field = {
  // -------------------------------------------------------------------------
  // Primitive Types
  // -------------------------------------------------------------------------

  /**
   * UUID v4 string field
   * @returns FieldBuilder<string>
   */
  uuid(): FieldBuilder<string> {
    return createBaseBuilder<string>({ type: 'uuid', hint: 'string.uuid' });
  },

  /**
   * String field with optional hint for mock data generation
   * @param opts - Options including faker hint
   */
  string(opts?: { hint?: string }): StringFieldBuilder {
    return createStringBuilder({ type: 'string', hint: opts?.hint || 'lorem.word' });
  },

  /**
   * Number field with optional constraints
   * @param opts - Min, max, and integer constraints
   */
  number(opts?: { min?: number; max?: number; int?: boolean }): NumberFieldBuilder {
    const constraints: FieldConstraints = {};
    if (opts?.min !== undefined) constraints.min = opts.min;
    if (opts?.max !== undefined) constraints.max = opts.max;

    return createNumberBuilder({
      type: 'number',
      hint: opts?.int ? 'number.int' : 'number.float',
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    });
  },

  /**
   * Boolean field
   */
  boolean(): FieldBuilder<boolean> {
    return createBaseBuilder<boolean>({ type: 'boolean', hint: 'datatype.boolean' });
  },

  /**
   * Date field with optional constraints
   * @param opts - Past/future constraints
   */
  date(opts?: { past?: boolean; future?: boolean }): DateFieldBuilder {
    let hint = 'date.anytime';
    if (opts?.past) hint = 'date.past';
    if (opts?.future) hint = 'date.future';

    return createDateBuilder({ type: 'date', hint });
  },

  // -------------------------------------------------------------------------
  // Semantic Types (Faker-based)
  // -------------------------------------------------------------------------

  /**
   * Email string field
   */
  email(): StringFieldBuilder {
    return createStringBuilder({ type: 'string', hint: 'internet.email' });
  },

  /**
   * URL string field
   */
  url(): StringFieldBuilder {
    return createStringBuilder({ type: 'string', hint: 'internet.url' });
  },

  // -------------------------------------------------------------------------
  // Faker Namespace Proxies
  // -------------------------------------------------------------------------

  /**
   * Person-related fields (names, titles, etc.)
   */
  person: {
    fullName(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'person.fullName' });
    },
    firstName(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'person.firstName' });
    },
    lastName(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'person.lastName' });
    },
    bio(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'person.bio' });
    },
    jobTitle(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'person.jobTitle' });
    },
  },

  /**
   * Internet-related fields (emails, URLs, usernames, etc.)
   */
  internet: {
    email(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'internet.email' });
    },
    url(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'internet.url' });
    },
    avatar(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'internet.avatar' });
    },
    userName(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'internet.userName' });
    },
    password(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'internet.password' });
    },
  },

  /**
   * Lorem ipsum text generation
   */
  lorem: {
    word(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'lorem.word' });
    },
    sentence(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'lorem.sentence' });
    },
    paragraph(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'lorem.paragraph' });
    },
    paragraphs(count: number = 3): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: `lorem.paragraphs:${count}` });
    },
  },

  /**
   * Location-related fields (addresses, cities, etc.)
   */
  location: {
    city(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'location.city' });
    },
    country(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'location.country' });
    },
    streetAddress(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'location.streetAddress' });
    },
    zipCode(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'location.zipCode' });
    },
    latitude(): NumberFieldBuilder {
      return createNumberBuilder({ type: 'number', hint: 'location.latitude' });
    },
    longitude(): NumberFieldBuilder {
      return createNumberBuilder({ type: 'number', hint: 'location.longitude' });
    },
  },

  /**
   * Phone-related fields
   */
  phone: {
    number(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'phone.number' });
    },
  },

  /**
   * Image-related fields
   */
  image: {
    avatar(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'image.avatar' });
    },
    url(options?: { width?: number; height?: number }): StringFieldBuilder {
      const hint = options ? `image.url:${options.width || 640}x${options.height || 480}` : 'image.url';
      return createStringBuilder({ type: 'string', hint });
    },
  },

  /**
   * Company-related fields
   */
  company: {
    name(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'company.name' });
    },
    catchPhrase(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'company.catchPhrase' });
    },
  },

  /**
   * Commerce-related fields
   */
  commerce: {
    productName(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'commerce.productName' });
    },
    price(): NumberFieldBuilder {
      return createNumberBuilder({ type: 'number', hint: 'commerce.price' });
    },
    department(): StringFieldBuilder {
      return createStringBuilder({ type: 'string', hint: 'commerce.department' });
    },
  },

  // -------------------------------------------------------------------------
  // Complex Types
  // -------------------------------------------------------------------------

  /**
   * Enum field with type-safe values
   * @param values - Allowed enum values
   *
   * @example
   * ```typescript
   * field.enum(['admin', 'user', 'guest']).default('user')
   * ```
   */
  enum<T extends string>(values: readonly T[]): EnumFieldBuilder<T> {
    return createEnumBuilder(values);
  },

  /**
   * Reference to another entity
   * @param target - Target entity name
   *
   * @example
   * ```typescript
   * field.ref('user')  // References the 'user' entity
   * ```
   */
  ref(target: string): RefFieldBuilder {
    return createRefBuilder(target);
  },

  /**
   * Array of items
   * @param itemType - The field definition for array items
   *
   * @example
   * ```typescript
   * field.array(field.string())          // Array of strings
   * field.array(field.uuid()).length(5)  // Fixed-length array
   * ```
   */
  array<T>(itemType: FieldBuilder<T>): ArrayFieldBuilder<T> {
    return createArrayBuilder(itemType as unknown as FieldDefinition<T>);
  },

  /**
   * Nested object with defined shape
   * @param shape - Object shape definition
   *
   * @example
   * ```typescript
   * field.object({
   *   street: field.location.streetAddress(),
   *   city: field.location.city(),
   *   zip: field.location.zipCode(),
   * })
   * ```
   */
  object<T extends Record<string, FieldBuilder<unknown>>>(
    shape: T
  ): ObjectFieldBuilder<{ [K in keyof T]: T[K] extends FieldBuilder<infer U> ? U : never }> {
    type InferredType = { [K in keyof T]: T[K] extends FieldBuilder<infer U> ? U : never };
    return createObjectBuilder<InferredType>(shape as unknown as Record<string, FieldDefinition>);
  },

  /**
   * Computed field that derives its value from other fields or data
   * @param config - Computed field configuration
   *
   * @example
   * ```typescript
   * field.computed({
   *   mock: () => faker.person.fullName(),
   *   resolve: (entity) => `${entity.firstName} ${entity.lastName}`,
   *   dependsOn: ['firstName', 'lastName'],
   * })
   * ```
   */
  computed<T>(config: {
    mock?: () => T;
    resolve: (entity: Record<string, unknown>, db: unknown, ctx: unknown) => T | Promise<T>;
    dependsOn?: string[];
  }): ComputedFieldDefinition<T> {
    return createComputedField(config);
  },
};

export type { FieldBuilder, StringFieldBuilder, NumberFieldBuilder, DateFieldBuilder, EnumFieldBuilder };
