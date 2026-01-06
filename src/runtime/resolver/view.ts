/**
 * View Resolver - Executes view queries by applying filters and transforms
 *
 * @module runtime/resolver/view
 * @category Runtime
 */

import type { ViewSchema, EntitySchema, ComputedFieldDefinition, EmbedConfig } from '../../schema/types';
import { isComputedField } from '../../schema/types';
import type { SchemaRegistry } from './registry';
import type { Database, ResolverContext } from './computed';
import { resolveComputedFields, clearComputeCache } from './computed';

/**
 * Options for resolving a view
 */
export interface ViewResolveOptions {
  /** URL parameters */
  params: Record<string, string>;
  /** Resolver context */
  context: ResolverContext;
}

/**
 * Embed definition with target entity info
 */
interface EmbedDefinition {
  _embed: true;
  entity: EntitySchema;
  config?: EmbedConfig;
}

/**
 * Type guard for embed definition
 */
function isEmbedDefinition(value: unknown): value is EmbedDefinition {
  return typeof value === 'object' && value !== null && '_embed' in value && (value as EmbedDefinition)._embed === true;
}

/**
 * ViewResolver handles resolution of view schemas.
 * Views are computed projections over entity data.
 *
 * @example
 * ```typescript
 * const viewResolver = new ViewResolver(registry, db);
 * const userFull = await viewResolver.resolve(UserFullView, { id: '123' });
 * ```
 */
export class ViewResolver {
  constructor(
    private registry: SchemaRegistry,
    private db: Database
  ) {}

  /**
   * Resolves a view schema with given parameters.
   *
   * @param view - The view schema to resolve
   * @param params - URL parameters for the view
   * @param context - Optional resolver context
   * @returns The resolved view data
   *
   * @example
   * ```typescript
   * const userData = await viewResolver.resolve(UserFullView, { id: 'user-123' });
   * ```
   */
  async resolve<T>(view: ViewSchema, params: Record<string, string>, context?: Partial<ResolverContext>): Promise<T> {
    clearComputeCache();

    const resolverContext: ResolverContext = {
      mode: 'resolve',
      params,
      ...context,
    };

    return this.buildViewResult<T>(view, { params, context: resolverContext });
  }

  /**
   * Builds the view result by resolving all fields
   */
  private async buildViewResult<T>(view: ViewSchema, options: ViewResolveOptions): Promise<T> {
    const result: Record<string, unknown> = {};

    // Process each field in the view
    for (const [fieldName, fieldDef] of Object.entries(view.fields)) {
      if (isEmbedDefinition(fieldDef)) {
        // Resolve embedded entity
        result[fieldName] = await this.resolveEmbed(fieldDef, result, options);
      } else if (isComputedField(fieldDef)) {
        // Resolve computed field
        result[fieldName] = await this.resolveViewComputedField(fieldDef, result, options);
      } else if (this.isNestedObjectField(fieldDef)) {
        // Resolve nested object of fields/computed
        result[fieldName] = await this.resolveNestedObject(fieldDef, result, options);
      } else {
        // Regular field - check if we need to fetch from params or base entity
        const paramValue = options.params[fieldName];
        if (paramValue !== undefined) {
          result[fieldName] = paramValue;
        }
      }
    }

    return result as T;
  }

  /**
   * Check if a field definition is a nested object
   */
  private isNestedObjectField(fieldDef: unknown): fieldDef is Record<string, unknown> {
    return (
      typeof fieldDef === 'object' &&
      fieldDef !== null &&
      !('type' in fieldDef) &&
      !('_computed' in fieldDef) &&
      !('_embed' in fieldDef)
    );
  }

  /**
   * Resolves an embedded entity field
   */
  private async resolveEmbed(
    embed: EmbedDefinition,
    parentData: Record<string, unknown>,
    options: ViewResolveOptions
  ): Promise<unknown> {
    const targetDb = this.db[embed.entity.name];
    if (!targetDb) {
      throw new Error(`Target entity '${embed.entity.name}' not found in database`);
    }

    // Build query from config
    const query: Record<string, unknown> = { where: {} };

    // Use params to build where clause
    const idParam = options.params.id;
    if (idParam) {
      // Try to find by common foreign key patterns
      const possibleForeignKeys = [
        `${this.guessParentEntityName(options)}Id`,
        'userId',
        'authorId',
        'parentId',
      ];

      for (const fk of possibleForeignKeys) {
        if (embed.entity.fields && fk in embed.entity.fields) {
          (query.where as Record<string, unknown>)[fk] = { equals: idParam };
          break;
        }
      }
    }

    // Apply config options
    if (embed.config?.limit) {
      query.take = embed.config.limit;
    }

    if (embed.config?.orderBy) {
      query.orderBy = embed.config.orderBy;
    }

    // Determine if we should return array or single item
    const shouldReturnArray = !embed.config?.limit || embed.config.limit > 1;

    if (shouldReturnArray) {
      const results = targetDb.findMany(query);
      return results;
    } else {
      const result = targetDb.findFirst(query);
      return result;
    }
  }

  /**
   * Guess the parent entity name from the view endpoint
   */
  private guessParentEntityName(options: ViewResolveOptions): string {
    // Simple heuristic: look for entity name in params
    return 'user'; // Default fallback
  }

  /**
   * Resolves a computed field within a view context
   */
  private async resolveViewComputedField(
    computed: ComputedFieldDefinition,
    currentData: Record<string, unknown>,
    options: ViewResolveOptions
  ): Promise<unknown> {
    if (options.context.mode === 'seed' && computed.mock) {
      return computed.mock();
    }

    return computed.resolve(currentData, this.db, options.context);
  }

  /**
   * Resolves a nested object containing fields and computed values
   */
  private async resolveNestedObject(
    nestedDef: Record<string, unknown>,
    parentData: Record<string, unknown>,
    options: ViewResolveOptions
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const [fieldName, fieldDef] of Object.entries(nestedDef)) {
      if (isComputedField(fieldDef)) {
        result[fieldName] = await this.resolveViewComputedField(fieldDef, parentData, options);
      } else {
        // Regular field value
        result[fieldName] = fieldDef;
      }
    }

    return result;
  }

  /**
   * Resolves a view with mock data (for seeding)
   */
  async resolveMock<T>(view: ViewSchema, params: Record<string, string>): Promise<T> {
    return this.resolve<T>(view, params, { mode: 'seed' });
  }
}

/**
 * Creates a new ViewResolver instance
 *
 * @param registry - Schema registry
 * @param db - Database interface
 * @returns ViewResolver instance
 */
export function createViewResolver(registry: SchemaRegistry, db: Database): ViewResolver {
  return new ViewResolver(registry, db);
}
