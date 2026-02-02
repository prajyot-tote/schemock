/**
 * Schemock Schema DSL - Define once, mock instantly
 *
 * This module provides the complete API for defining data schemas,
 * including entity definitions, field types, relations, and views.
 *
 * @module schema
 * @category Schema
 *
 * @example
 * ```typescript
 * import {
 *   defineData,
 *   defineView,
 *   field,
 *   hasOne,
 *   hasMany,
 *   belongsTo,
 *   embed,
 *   pick,
 * } from 'schemock/schema';
 *
 * // Define entities
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   name: field.person.fullName(),
 *   email: field.internet.email().unique(),
 *   posts: hasMany('post', { foreignKey: 'authorId' }),
 * });
 *
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   title: field.lorem.sentence(),
 *   authorId: field.uuid(),
 *   author: belongsTo('user', { foreignKey: 'authorId' }),
 * });
 *
 * // Define views
 * const UserFullView = defineView('user-full', {
 *   ...pick(User, ['id', 'name', 'email']),
 *   recentPosts: embed(Post, { limit: 5 }),
 * }, {
 *   endpoint: '/api/users/:id/full',
 *   params: ['id'],
 * });
 * ```
 */

// Type definitions
export * from './types';

// Field builder API
export { field } from './field';
export type { FieldBuilder, StringFieldBuilder, NumberFieldBuilder, DateFieldBuilder, EnumFieldBuilder } from './field';

// Relation builders
export { hasOne, hasMany, belongsTo } from './relations';
export type { HasOneOptions, HasManyOptions, BelongsToOptions } from './relations';

// Entity definition
export { defineData } from './define-data';
export type { FieldDefinitions } from './define-data';

// View definition
export { defineView, embed, pick, omit, isEmbedMarker } from './define-view';
export type { EmbedMarker, ViewFieldDefinitions } from './define-view';

// Endpoint definition
export { defineEndpoint } from './define-endpoint';

// Middleware definitions
export { defineMiddleware } from './define-middleware';
export { defineServerMiddleware } from './define-server-middleware';
export { defineClientMiddleware } from './define-client-middleware';
