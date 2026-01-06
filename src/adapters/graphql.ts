/**
 * GraphQLAdapter - Adapter for GraphQL/Apollo backends
 *
 * Maps Schemock operations to GraphQL queries and mutations.
 *
 * @module adapters/graphql
 * @category Adapters
 */

import type {
  Adapter,
  AdapterContext,
  AdapterResponse,
} from './types';

/**
 * Apollo Client type (from @apollo/client).
 * Using a minimal interface to avoid requiring the full Apollo package.
 */
export interface ApolloClient {
  query<T>(options: QueryOptions): Promise<QueryResult<T>>;
  mutate<T>(options: MutationOptions): Promise<MutationResult<T>>;
}

/**
 * Apollo query options.
 */
interface QueryOptions {
  query: unknown; // DocumentNode
  variables?: Record<string, unknown>;
  fetchPolicy?: string;
}

/**
 * Apollo query result.
 */
interface QueryResult<T> {
  data: T;
  error?: Error;
}

/**
 * Apollo mutation options.
 */
interface MutationOptions {
  mutation: unknown; // DocumentNode
  variables?: Record<string, unknown>;
}

/**
 * Apollo mutation result.
 */
interface MutationResult<T> {
  data: T | null;
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL adapter options.
 */
export interface GraphQLAdapterOptions {
  /** Apollo Client instance */
  client: ApolloClient;
  /** Custom query/mutation builders */
  operations?: {
    findOne?: (entity: string, variables: Record<string, unknown>) => unknown;
    findMany?: (entity: string, variables: Record<string, unknown>) => unknown;
    create?: (entity: string, variables: Record<string, unknown>) => unknown;
    update?: (entity: string, variables: Record<string, unknown>) => unknown;
    delete?: (entity: string, variables: Record<string, unknown>) => unknown;
  };
  /** Entity name to GraphQL type mapping */
  typeMap?: Record<string, string>;
}

/**
 * GraphQLAdapter class implementing the Adapter interface.
 *
 * @example
 * ```typescript
 * import { ApolloClient, InMemoryCache } from '@apollo/client';
 *
 * const client = new ApolloClient({ uri: '/graphql', cache: new InMemoryCache() });
 * const adapter = new GraphQLAdapter({ client });
 *
 * const users = await adapter.findMany({ entity: 'user' });
 * ```
 */
export class GraphQLAdapter implements Adapter {
  /** Adapter name identifier */
  name = 'graphql';

  /** Apollo client */
  private client: ApolloClient;

  /** Custom operation builders */
  private operations: GraphQLAdapterOptions['operations'];

  /** Entity to GraphQL type mapping */
  private typeMap: Record<string, string>;

  constructor(options: GraphQLAdapterOptions) {
    this.client = options.client;
    this.operations = options.operations ?? {};
    this.typeMap = options.typeMap ?? {};
  }

  /**
   * Get GraphQL type name for entity.
   */
  private getTypeName(entity: string): string {
    return this.typeMap[entity] ?? this.pascalCase(entity);
  }

  /**
   * Convert string to PascalCase.
   */
  private pascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Find a single entity by ID.
   */
  async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const typeName = this.getTypeName(ctx.entity);
      const variables = {
        id: ctx.params?.id,
        ...ctx.filter,
      };

      // Use custom operation if provided
      const query = this.operations?.findOne
        ? this.operations.findOne(ctx.entity, variables)
        : this.buildFindOneQuery(typeName, ctx.select);

      const result = await this.client.query<{ [key: string]: T }>({
        query,
        variables,
        fetchPolicy: 'network-only',
      });

      const data = result.data[ctx.entity] ?? result.data[`get${typeName}`];

      if (result.error) {
        return {
          data: null as unknown as T,
          error: result.error,
        };
      }

      return { data };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Find multiple entities.
   */
  async findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>> {
    try {
      const typeName = this.getTypeName(ctx.entity);
      const variables: Record<string, unknown> = {
        ...ctx.filter,
      };

      if (ctx.limit !== undefined) {
        variables.limit = ctx.limit;
      }
      if (ctx.offset !== undefined) {
        variables.offset = ctx.offset;
      }
      if (ctx.orderBy) {
        variables.orderBy = ctx.orderBy;
      }

      // Use custom operation if provided
      const query = this.operations?.findMany
        ? this.operations.findMany(ctx.entity, variables)
        : this.buildFindManyQuery(typeName, ctx.select);

      const result = await this.client.query<{ [key: string]: T[] | { items: T[]; total: number } }>({
        query,
        variables,
        fetchPolicy: 'network-only',
      });

      const rawData = result.data[`${ctx.entity}s`] ?? result.data[`list${typeName}s`];

      if (result.error) {
        return {
          data: [],
          error: result.error,
        };
      }

      // Handle paginated response
      if (rawData && typeof rawData === 'object' && 'items' in rawData) {
        return {
          data: rawData.items,
          meta: { total: rawData.total },
        };
      }

      return { data: rawData as T[] ?? [] };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Create a new entity.
   */
  async create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const typeName = this.getTypeName(ctx.entity);
      const variables = {
        input: ctx.data,
      };

      // Use custom operation if provided
      const mutation = this.operations?.create
        ? this.operations.create(ctx.entity, variables)
        : this.buildCreateMutation(typeName);

      const result = await this.client.mutate<{ [key: string]: T }>({
        mutation,
        variables,
      });

      if (result.errors?.length) {
        return {
          data: null as unknown as T,
          error: new Error(result.errors.map((e) => e.message).join(', ')),
        };
      }

      const data = result.data?.[`create${typeName}`] ?? result.data?.[ctx.entity];

      return { data: data as T };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Update an existing entity.
   */
  async update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const typeName = this.getTypeName(ctx.entity);
      const variables = {
        id: ctx.params?.id,
        input: ctx.data,
      };

      // Use custom operation if provided
      const mutation = this.operations?.update
        ? this.operations.update(ctx.entity, variables)
        : this.buildUpdateMutation(typeName);

      const result = await this.client.mutate<{ [key: string]: T }>({
        mutation,
        variables,
      });

      if (result.errors?.length) {
        return {
          data: null as unknown as T,
          error: new Error(result.errors.map((e) => e.message).join(', ')),
        };
      }

      const data = result.data?.[`update${typeName}`] ?? result.data?.[ctx.entity];

      return { data: data as T };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Delete an entity.
   */
  async delete(ctx: AdapterContext): Promise<AdapterResponse<void>> {
    try {
      const typeName = this.getTypeName(ctx.entity);
      const variables = {
        id: ctx.params?.id,
      };

      // Use custom operation if provided
      const mutation = this.operations?.delete
        ? this.operations.delete(ctx.entity, variables)
        : this.buildDeleteMutation(typeName);

      const result = await this.client.mutate({
        mutation,
        variables,
      });

      if (result.errors?.length) {
        return {
          data: undefined,
          error: new Error(result.errors.map((e) => e.message).join(', ')),
        };
      }

      return { data: undefined };
    } catch (error) {
      return {
        data: undefined,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Build a default findOne query.
   * Returns a placeholder - users should provide custom operations.
   */
  private buildFindOneQuery(typeName: string, _select?: string[]): unknown {
    // This is a simplified placeholder.
    // In real usage, users should provide DocumentNode via operations.
    console.warn(
      `GraphQLAdapter: Using default query for ${typeName}. ` +
      'Consider providing custom operations for better control.'
    );
    return {
      kind: 'Document',
      definitions: [{
        kind: 'OperationDefinition',
        operation: 'query',
        name: { kind: 'Name', value: `Get${typeName}` },
        variableDefinitions: [{
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: { kind: 'NonNullType', type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } } },
        }],
        selectionSet: {
          kind: 'SelectionSet',
          selections: [{
            kind: 'Field',
            name: { kind: 'Name', value: `get${typeName}` },
            arguments: [{
              kind: 'Argument',
              name: { kind: 'Name', value: 'id' },
              value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
            }],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          }],
        },
      }],
    };
  }

  /**
   * Build a default findMany query.
   */
  private buildFindManyQuery(typeName: string, _select?: string[]): unknown {
    return {
      kind: 'Document',
      definitions: [{
        kind: 'OperationDefinition',
        operation: 'query',
        name: { kind: 'Name', value: `List${typeName}s` },
        selectionSet: {
          kind: 'SelectionSet',
          selections: [{
            kind: 'Field',
            name: { kind: 'Name', value: `list${typeName}s` },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          }],
        },
      }],
    };
  }

  /**
   * Build a default create mutation.
   */
  private buildCreateMutation(typeName: string): unknown {
    return {
      kind: 'Document',
      definitions: [{
        kind: 'OperationDefinition',
        operation: 'mutation',
        name: { kind: 'Name', value: `Create${typeName}` },
        variableDefinitions: [{
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: { kind: 'NonNullType', type: { kind: 'NamedType', name: { kind: 'Name', value: `Create${typeName}Input` } } },
        }],
        selectionSet: {
          kind: 'SelectionSet',
          selections: [{
            kind: 'Field',
            name: { kind: 'Name', value: `create${typeName}` },
            arguments: [{
              kind: 'Argument',
              name: { kind: 'Name', value: 'input' },
              value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
            }],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          }],
        },
      }],
    };
  }

  /**
   * Build a default update mutation.
   */
  private buildUpdateMutation(typeName: string): unknown {
    return {
      kind: 'Document',
      definitions: [{
        kind: 'OperationDefinition',
        operation: 'mutation',
        name: { kind: 'Name', value: `Update${typeName}` },
        variableDefinitions: [
          {
            kind: 'VariableDefinition',
            variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
            type: { kind: 'NonNullType', type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } } },
          },
          {
            kind: 'VariableDefinition',
            variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
            type: { kind: 'NonNullType', type: { kind: 'NamedType', name: { kind: 'Name', value: `Update${typeName}Input` } } },
          },
        ],
        selectionSet: {
          kind: 'SelectionSet',
          selections: [{
            kind: 'Field',
            name: { kind: 'Name', value: `update${typeName}` },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          }],
        },
      }],
    };
  }

  /**
   * Build a default delete mutation.
   */
  private buildDeleteMutation(typeName: string): unknown {
    return {
      kind: 'Document',
      definitions: [{
        kind: 'OperationDefinition',
        operation: 'mutation',
        name: { kind: 'Name', value: `Delete${typeName}` },
        variableDefinitions: [{
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: { kind: 'NonNullType', type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } } },
        }],
        selectionSet: {
          kind: 'SelectionSet',
          selections: [{
            kind: 'Field',
            name: { kind: 'Name', value: `delete${typeName}` },
            arguments: [{
              kind: 'Argument',
              name: { kind: 'Name', value: 'id' },
              value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
            }],
          }],
        },
      }],
    };
  }
}

/**
 * Create a GraphQLAdapter for GraphQL/Apollo backends.
 *
 * @param config - Configuration with Apollo Client
 * @returns A configured Adapter instance
 *
 * @example
 * ```typescript
 * import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
 * import { createGraphQLAdapter } from 'schemock/adapters';
 *
 * const client = new ApolloClient({
 *   uri: '/graphql',
 *   cache: new InMemoryCache(),
 * });
 *
 * const adapter = createGraphQLAdapter({
 *   client,
 *   operations: {
 *     findMany: (entity) => gql`query { ${entity}s { id name } }`,
 *   },
 * });
 * ```
 */
export function createGraphQLAdapter(config: GraphQLAdapterOptions): Adapter {
  return new GraphQLAdapter(config);
}
