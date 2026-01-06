/**
 * Relation builder functions for defining entity relationships.
 * Supports one-to-one, one-to-many, and many-to-many relationships.
 *
 * @module schema/relations
 * @category Schema
 *
 * @example
 * ```typescript
 * import { defineData, field, hasOne, hasMany, belongsTo } from 'schemock/schema';
 *
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   profile: hasOne('userProfile', { foreignKey: 'userId' }),
 *   posts: hasMany('post', { foreignKey: 'authorId' }),
 * });
 *
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   authorId: field.uuid(),
 *   author: belongsTo('user', { foreignKey: 'authorId' }),
 * });
 * ```
 */

import type { RelationDefinition } from './types';

/**
 * Options for hasOne relations (one-to-one)
 */
export interface HasOneOptions {
  /**
   * The foreign key field on the related entity.
   * @example For User -> Profile, foreignKey is 'userId' on Profile
   */
  foreignKey?: string;
  /**
   * Whether to eagerly load this relation by default.
   * When true, the relation is included in all queries.
   */
  eager?: boolean;
}

/**
 * Options for hasMany relations (one-to-many)
 */
export interface HasManyOptions {
  /**
   * The foreign key field on the related entity.
   * @example For User -> Posts, foreignKey is 'authorId' on Post
   */
  foreignKey?: string;
  /**
   * Default ordering for related items.
   * @example { createdAt: 'desc' }
   */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /**
   * Default limit for related items.
   */
  limit?: number;
  /**
   * For many-to-many: the junction table entity name.
   * @example For User -> Followers (through Follow), through is 'follow'
   */
  through?: string;
  /**
   * For many-to-many: the other foreign key on the junction table.
   * @example For followers, otherKey might be 'followerId'
   */
  otherKey?: string;
}

/**
 * Options for belongsTo relations (inverse of hasOne/hasMany)
 */
export interface BelongsToOptions {
  /**
   * The foreign key field on THIS entity.
   * @example For Post -> Author, foreignKey is 'authorId' on Post
   */
  foreignKey?: string;
  /**
   * Whether to eagerly load this relation by default.
   */
  eager?: boolean;
}

/**
 * Defines a one-to-one relationship where this entity has one related entity.
 * The foreign key is stored on the related entity.
 *
 * @param target - The name of the related entity
 * @param options - Relation configuration
 * @returns RelationDefinition
 *
 * @example
 * ```typescript
 * // User has one profile
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   profile: hasOne('userProfile', {
 *     foreignKey: 'userId',  // FK on UserProfile
 *     eager: true,           // Always include
 *   }),
 * });
 *
 * // UserProfile table has userId column
 * const UserProfile = defineData('userProfile', {
 *   id: field.uuid(),
 *   userId: field.uuid(),  // Foreign key
 *   bio: field.string(),
 * });
 * ```
 */
export function hasOne(target: string, options?: HasOneOptions): RelationDefinition {
  return {
    type: 'hasOne',
    target,
    foreignKey: options?.foreignKey,
    eager: options?.eager,
  };
}

/**
 * Defines a one-to-many relationship where this entity has many related entities.
 * The foreign key is stored on the related entities.
 *
 * @param target - The name of the related entity
 * @param options - Relation configuration
 * @returns RelationDefinition
 *
 * @example
 * ```typescript
 * // User has many posts
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   posts: hasMany('post', {
 *     foreignKey: 'authorId',
 *     orderBy: { createdAt: 'desc' },
 *     limit: 10,
 *   }),
 * });
 *
 * // Post table has authorId column
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   authorId: field.uuid(),  // Foreign key
 *   title: field.string(),
 * });
 * ```
 *
 * @example Many-to-many through junction table
 * ```typescript
 * // User has many followers (other users) through follows
 * const User = defineData('user', {
 *   id: field.uuid(),
 *   followers: hasMany('user', {
 *     through: 'follow',
 *     foreignKey: 'followingId',  // Points to this user
 *     otherKey: 'followerId',     // Points to follower
 *   }),
 * });
 *
 * // Junction table
 * const Follow = defineData('follow', {
 *   id: field.uuid(),
 *   followerId: field.uuid(),
 *   followingId: field.uuid(),
 * });
 * ```
 */
export function hasMany(target: string, options?: HasManyOptions): RelationDefinition {
  return {
    type: 'hasMany',
    target,
    foreignKey: options?.foreignKey,
    orderBy: options?.orderBy,
    limit: options?.limit,
    through: options?.through,
    otherKey: options?.otherKey,
  };
}

/**
 * Defines an inverse relationship where this entity belongs to another entity.
 * The foreign key is stored on THIS entity.
 *
 * @param target - The name of the parent entity
 * @param options - Relation configuration
 * @returns RelationDefinition
 *
 * @example
 * ```typescript
 * // Post belongs to a user (author)
 * const Post = defineData('post', {
 *   id: field.uuid(),
 *   authorId: field.uuid(),  // Foreign key on THIS entity
 *   title: field.string(),
 *
 *   author: belongsTo('user', {
 *     foreignKey: 'authorId',
 *     eager: true,  // Always include author
 *   }),
 * });
 * ```
 */
export function belongsTo(target: string, options?: BelongsToOptions): RelationDefinition {
  return {
    type: 'belongsTo',
    target,
    foreignKey: options?.foreignKey,
    eager: options?.eager,
  };
}
