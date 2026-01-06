/**
 * Primary API for defining entity schemas with full type inference.
 *
 * @module schema/define-data
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineData, field, hasMany, belongsTo } from 'schemock/schema';
 *
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   name: field.person.fullName(),
 *   email: field.internet.email().unique(),
 *   role: field.enum(['admin', 'user']).default('user'),
 *   createdAt: field.date().readOnly(),
 *
 *   // Relations
 *   posts: hasMany('post', { foreignKey: 'authorId' }),
 *
 *   // Computed
 *   postCount: field.computed({
 *     mock: () => Math.floor(Math.random() * 100),
 *     resolve: (user, db) => db.post.count({ where: { authorId: user.id } }),
 *   }),
 * }, {
 *   api: { basePath: '/api/users' },
 *   timestamps: true,
 * });
 * ```
 */

import type {
  EntitySchema,
  EntityOptions,
  FieldDefinition,
  RelationDefinition,
  ComputedFieldDefinition,
  FieldBuilder,
  RLSConfig,
} from './types';
import { isComputedField, isRelation } from './types';

/**
 * Convert a FieldBuilder or FieldDefinition to a normalized FieldDefinition
 * This handles the property name differences between the two types
 */
function convertToFieldDefinition(field: FieldBuilder<unknown> | FieldDefinition): FieldDefinition {
  // Check if it's already a FieldDefinition (has 'nullable' property pattern)
  // or if it's a FieldBuilder (has 'isNullable' property pattern)
  const isBuilder = 'isNullable' in field || 'isUnique' in field || 'isReadOnly' in field || 'defaultValue' in field;

  if (!isBuilder) {
    // Already a FieldDefinition, just return it
    return field as FieldDefinition;
  }

  // Convert FieldBuilder to FieldDefinition
  const builder = field as FieldBuilder<unknown>;
  const definition: FieldDefinition = {
    type: builder.type,
    hint: builder.hint,
    nullable: builder.isNullable,
    unique: builder.isUnique,
    readOnly: builder.isReadOnly,
    default: builder.defaultValue,
    constraints: builder.constraints,
    target: builder.target,
    values: builder.values,
  };

  // Handle nested items (for arrays) - items are already FieldDefinition
  if (builder.items) {
    definition.items = builder.items;
  }

  // Handle nested shape (for objects) - shape values are already FieldDefinition
  if (builder.shape) {
    definition.shape = builder.shape;
  }

  return definition;
}

/**
 * Field definitions input type - accepts field builders, relations, or computed fields
 */
export type FieldDefinitions = Record<
  string,
  FieldBuilder<unknown> | FieldDefinition | RelationDefinition | ComputedFieldDefinition
>;

/**
 * Defines an entity schema with fields, relations, and computed properties.
 * This is the primary API for creating data models in Schemock.
 *
 * @param name - Unique name for this entity (used for table/collection naming)
 * @param definitions - Field, relation, and computed field definitions
 * @param options - Optional entity configuration (API, timestamps, etc.)
 * @returns EntitySchema with full type inference
 *
 * @example Basic entity
 * ```typescript
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   name: field.string(),
 *   email: field.email().unique(),
 * });
 * ```
 *
 * @example With relations
 * ```typescript
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   title: field.string(),
 *   authorId: field.uuid(),
 *   author: belongsTo('user', { foreignKey: 'authorId' }),
 * });
 * ```
 *
 * @example With API configuration
 * ```typescript
 * const Product = defineData('product', {
 *   id: field.uuid(),
 *   name: field.commerce.productName(),
 *   price: field.commerce.price(),
 * }, {
 *   api: {
 *     basePath: '/api/products',
 *     operations: { list: true, get: true, create: true },
 *     pagination: { style: 'offset', defaultLimit: 20 },
 *   },
 *   timestamps: true,
 * });
 * ```
 *
 * @example With Row-Level Security (generic context-based)
 * ```typescript
 * // Simple scope-based (works without users - e.g., API keys, services)
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   title: field.string(),
 *   tenantId: field.uuid(),
 * }, {
 *   rls: {
 *     // Rows filtered by tenantId from context
 *     scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
 *   },
 * });
 *
 * // User-based with owner field and bypass
 * const Comment = defineData('comment', {
 *   id: field.uuid(),
 *   content: field.string(),
 *   authorId: field.uuid(),
 * }, {
 *   rls: {
 *     scope: [{ field: 'authorId', contextKey: 'userId' }],
 *     bypass: [{ contextKey: 'role', values: ['admin'] }],
 *   },
 * });
 *
 * // Custom policy functions (full flexibility)
 * const Document = defineData('document', {
 *   id: field.uuid(),
 *   title: field.string(),
 *   ownerId: field.uuid(),
 *   isPublic: field.boolean(),
 * }, {
 *   rls: {
 *     select: (row, ctx) => row.isPublic || row.ownerId === ctx?.userId,
 *     insert: (row, ctx) => row.ownerId === ctx?.userId,
 *   },
 * });
 * ```
 */
export function defineData<T extends FieldDefinitions>(
  name: string,
  definitions: T,
  options?: EntityOptions
): EntitySchema<T> {
  // Separate fields, relations, and computed fields
  const fields: Record<string, FieldDefinition> = {};
  const relations: Record<string, RelationDefinition> = {};
  const computed: Record<string, ComputedFieldDefinition> = {};

  for (const [key, value] of Object.entries(definitions)) {
    if (isComputedField(value)) {
      computed[key] = value;
    } else if (isRelation(value)) {
      relations[key] = value;
    } else {
      // It's a field definition or field builder - convert to FieldDefinition
      const fieldValue = value as FieldBuilder<unknown> | FieldDefinition;
      fields[key] = convertToFieldDefinition(fieldValue);
    }
  }

  // Add automatic id field if not present
  if (!fields.id) {
    fields.id = {
      type: 'uuid',
      hint: 'string.uuid',
      readOnly: true,
    };
  }

  // Add timestamp fields if enabled (default: true)
  const timestamps = options?.timestamps ?? true;
  if (timestamps) {
    if (!fields.createdAt) {
      fields.createdAt = {
        type: 'date',
        hint: 'date.past',
        readOnly: true,
      };
    }
    if (!fields.updatedAt) {
      fields.updatedAt = {
        type: 'date',
        hint: 'date.recent',
        readOnly: true,
      };
    }
  }

  const schema: EntitySchema<T> = {
    name,
    fields,
    timestamps,
    api: options?.api,
    rls: options?.rls,
  };

  // Only add relations/computed if non-empty
  if (Object.keys(relations).length > 0) {
    schema.relations = relations;
  }
  if (Object.keys(computed).length > 0) {
    schema.computed = computed;
  }

  return schema;
}
