/**
 * API for defining computed views over entity schemas.
 * Views provide custom projections of data with embedded relations and computed fields.
 *
 * @module schema/define-view
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineView, embed, pick } from 'schemock/schema';
 *
 * const UserFullView = defineView('user-full', {
 *   ...pick(User, ['id', 'name', 'email']),
 *   profile: embed(UserProfile),
 *   recentPosts: embed(Post, { limit: 5, orderBy: { createdAt: 'desc' } }),
 *   stats: {
 *     postCount: field.computed({...}),
 *     totalViews: field.computed({...}),
 *   },
 * }, {
 *   endpoint: '/api/users/:id/full',
 *   params: ['id'],
 * });
 * ```
 */

import type {
  ViewSchema,
  ViewFields,
  ViewOptions,
  EntitySchema,
  FieldDefinition,
  EmbedConfig,
  ComputedFieldDefinition,
} from './types';

/**
 * Embed marker for including related entity data in a view
 */
export interface EmbedMarker<T = unknown> {
  /** Marker to identify embedded fields */
  _embed: true;
  /** The source entity schema */
  entity: EntitySchema<T>;
  /** Embed configuration */
  config?: EmbedConfig;
}

/**
 * Creates an embed marker for including related entity data in a view.
 * Embedded data is fetched and included as part of the view response.
 *
 * @param entity - The entity schema to embed
 * @param config - Optional embed configuration (limit, orderBy, select)
 * @returns EmbedMarker
 *
 * @example Basic embed
 * ```typescript
 * const UserView = defineView('user-view', {
 *   id: field.uuid(),
 *   profile: embed(UserProfile),
 * }, { endpoint: '/api/users/:id', params: ['id'] });
 * ```
 *
 * @example Embed with options
 * ```typescript
 * const UserView = defineView('user-view', {
 *   id: field.uuid(),
 *   recentPosts: embed(Post, {
 *     limit: 5,
 *     orderBy: { createdAt: 'desc' },
 *     select: ['id', 'title', 'createdAt'],
 *   }),
 * }, { endpoint: '/api/users/:id', params: ['id'] });
 * ```
 */
export function embed<T>(entity: EntitySchema<T>, config?: EmbedConfig): EmbedMarker<T> {
  return {
    _embed: true,
    entity,
    config,
  };
}

/**
 * Type guard to check if a value is an embed marker
 */
export function isEmbedMarker(value: unknown): value is EmbedMarker {
  return typeof value === 'object' && value !== null && '_embed' in value && (value as EmbedMarker)._embed === true;
}

/**
 * Picks specific fields from an entity schema to include in a view.
 * This allows selecting a subset of fields without manually copying definitions.
 *
 * @param entity - The source entity schema
 * @param fields - Array of field names to include
 * @returns Record of picked field definitions
 *
 * @example
 * ```typescript
 * const UserView = defineView('user-view', {
 *   ...pick(User, ['id', 'name', 'email']),
 *   // Additional view-specific fields...
 * }, { endpoint: '/api/users/:id', params: ['id'] });
 * ```
 */
export function pick<T extends EntitySchema, K extends keyof T['fields']>(
  entity: T,
  fields: K[]
): Record<K, T['fields'][K]> {
  const result = {} as Record<K, T['fields'][K]>;
  for (const fieldName of fields) {
    if (fieldName in entity.fields) {
      result[fieldName] = entity.fields[fieldName as string] as T['fields'][K];
    }
  }
  return result;
}

/**
 * Omits specific fields from an entity schema.
 * This is the inverse of pick - includes all fields except the specified ones.
 *
 * @param entity - The source entity schema
 * @param fields - Array of field names to exclude
 * @returns Record of remaining field definitions
 *
 * @example
 * ```typescript
 * const UserView = defineView('user-view', {
 *   ...omit(User, ['password', 'internalNotes']),
 * }, { endpoint: '/api/users/:id', params: ['id'] });
 * ```
 */
export function omit<T extends EntitySchema, K extends keyof T['fields']>(
  entity: T,
  fields: K[]
): Omit<T['fields'], K> {
  const result = { ...entity.fields };
  for (const fieldName of fields) {
    delete result[fieldName as string];
  }
  return result as Omit<T['fields'], K>;
}

/**
 * Input type for view field definitions
 */
export type ViewFieldDefinitions = Record<
  string,
  FieldDefinition | ComputedFieldDefinition | EmbedMarker | Record<string, FieldDefinition | ComputedFieldDefinition>
>;

/**
 * Defines a computed view over entity schemas.
 * Views provide custom API endpoints that project, combine, and compute data
 * from one or more entities.
 *
 * @param name - Unique name for this view
 * @param fields - View field definitions (fields, embeds, computed, nested objects)
 * @param options - View configuration (endpoint, params)
 * @returns ViewSchema
 *
 * @example Basic view
 * ```typescript
 * const UserProfile = defineView('user-profile', {
 *   id: field.uuid(),
 *   name: field.string(),
 *   avatar: field.string(),
 * }, {
 *   endpoint: '/api/users/:id/profile',
 *   params: ['id'],
 * });
 * ```
 *
 * @example View with embeds and computed fields
 * ```typescript
 * const UserFullView = defineView('user-full', {
 *   // Pick fields from User entity
 *   ...pick(User, ['id', 'name', 'email', 'role']),
 *
 *   // Embed related profile
 *   profile: embed(UserProfile),
 *
 *   // Embed recent posts with config
 *   recentPosts: embed(Post, {
 *     limit: 5,
 *     orderBy: { createdAt: 'desc' },
 *   }),
 *
 *   // Nested computed stats
 *   stats: {
 *     postCount: field.computed({
 *       mock: () => Math.floor(Math.random() * 50),
 *       resolve: (_, db, ctx) => db.post.count({
 *         where: { authorId: ctx.params.id }
 *       }),
 *     }),
 *     totalViews: field.computed({
 *       mock: () => Math.floor(Math.random() * 50000),
 *       resolve: (data) => data.recentPosts?.reduce(
 *         (sum, p) => sum + p.viewCount, 0
 *       ) ?? 0,
 *     }),
 *   },
 * }, {
 *   endpoint: '/api/users/:id/full',
 *   params: ['id'],
 * });
 * ```
 */
export function defineView(name: string, fields: ViewFieldDefinitions, options: ViewOptions): ViewSchema {
  // Process fields to convert embed markers to proper ViewFields format
  const processedFields: ViewFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (isEmbedMarker(value)) {
      processedFields[key] = {
        _embed: true,
        entity: value.entity,
        config: value.config,
      };
    } else if (typeof value === 'object' && value !== null && !('type' in value) && !('_computed' in value)) {
      // It's a nested object of fields (like stats: { postCount: ... })
      processedFields[key] = value as Record<string, FieldDefinition | ComputedFieldDefinition>;
    } else {
      // It's a regular field or computed field
      processedFields[key] = value as FieldDefinition | ComputedFieldDefinition;
    }
  }

  return {
    name,
    fields: processedFields,
    endpoint: options.endpoint,
    params: options.params,
  };
}
