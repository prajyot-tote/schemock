/**
 * Schemock Resolver System
 *
 * Provides the core resolution engine for entities, relations,
 * computed fields, and views.
 *
 * @module runtime/resolver
 * @category Runtime
 *
 * @example
 * ```typescript
 * import { SchemaRegistry, Resolver, createResolver } from 'schemock/runtime';
 *
 * // Set up registry
 * const registry = new SchemaRegistry();
 * registry.register(UserSchema);
 * registry.register(PostSchema);
 *
 * // Create resolver
 * const resolver = createResolver(registry, db);
 *
 * // Query data
 * const user = await resolver.findOne('user', '123', {
 *   include: ['profile', 'posts'],
 * });
 * ```
 */

// Schema Registry
export { SchemaRegistry, registry } from './registry';

// Computed Field Resolution
export {
  topologicalSort,
  resolveComputedFields,
  resolveComputedFieldsSync,
  resolveComputedField,
  clearComputeCache,
} from './computed';
export type { ResolverContext, Database } from './computed';

// Relation Resolution
export { resolveRelations, resolveRelation, eagerLoadRelations } from './relation';
export type { ResolveRelationOptions } from './relation';

// View Resolution
export { ViewResolver, createViewResolver } from './view';
export type { ViewResolveOptions } from './view';

// Main Resolver
export { Resolver, createResolver } from './resolver';
export type { EntityQueryOptions, ListQueryOptions, CountOptions, CreateInput, UpdateInput } from './resolver';
