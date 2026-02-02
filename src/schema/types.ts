/**
 * Core type definitions for the Schemock Schema DSL
 *
 * @module schema/types
 * @category Schema
 */

// ============================================================================
// Field Types
// ============================================================================

/**
 * Constraint configuration for fields
 */
export interface FieldConstraints {
  /** Minimum value (for numbers) or minimum length (for strings/arrays) */
  min?: number;
  /** Maximum value (for numbers) or maximum length (for strings/arrays) */
  max?: number;
  /** Regular expression pattern for string validation */
  pattern?: RegExp;
  /** Custom validation message */
  message?: string;
}

/**
 * Base interface for all field definitions in the schema DSL.
 * Fields define the structure and behavior of entity properties.
 *
 * @example
 * ```typescript
 * const emailField: FieldDefinition<string> = {
 *   type: 'email',
 *   hint: 'internet.email',
 *   nullable: false,
 *   unique: true,
 * };
 * ```
 */
export interface FieldDefinition<T = unknown> {
  /** The primitive type of the field (string, number, boolean, date, array, object, ref) */
  type: string;
  /** Faker.js hint for generating mock data (e.g., 'person.fullName', 'internet.email') */
  hint?: string;
  /** Whether the field can be null */
  nullable?: boolean;
  /** Whether the field must be unique across all entities */
  unique?: boolean;
  /** Whether the field is read-only (excluded from create/update operations) */
  readOnly?: boolean;
  /** Default value when not provided */
  default?: T;
  /** Validation constraints */
  constraints?: FieldConstraints;
  /** For array fields: the type of items */
  items?: FieldDefinition;
  /** For object fields: the shape of nested properties */
  shape?: Record<string, FieldDefinition>;
  /** For ref fields: the target entity name */
  target?: string;
  /** For enum fields: the allowed values */
  values?: readonly T[];
  /** Internal type marker for TypeScript inference */
  readonly _type?: T;
}

/**
 * Builder interface for creating field definitions with chainable methods.
 * All field builder methods return a new builder instance to support method chaining.
 *
 * @example
 * ```typescript
 * const field = createFieldBuilder('string')
 *   .min(1)
 *   .max(100)
 *   .nullable()
 *   .default('');
 * ```
 */
export interface FieldBuilder<T> {
  /** The primitive type of the field */
  type: string;
  /** Faker.js hint for generating mock data */
  hint?: string;
  /** Whether the field can be null - use nullable() method to set */
  isNullable?: boolean;
  /** Whether the field must be unique */
  isUnique?: boolean;
  /** Whether the field is read-only */
  isReadOnly?: boolean;
  /** Default value */
  defaultValue?: T;
  /** Validation constraints */
  constraints?: FieldConstraints;
  /** For array fields */
  items?: FieldDefinition;
  /** For object fields */
  shape?: Record<string, FieldDefinition>;
  /** For ref fields */
  target?: string;
  /** For enum fields */
  values?: readonly T[];
  /** Internal type marker */
  readonly _type?: T;

  /** Mark the field as nullable */
  nullable(): FieldBuilder<T | null>;
  /** Mark the field as unique */
  unique(message?: string): FieldBuilder<T>;
  /** Mark the field as read-only */
  readOnly(): FieldBuilder<T>;
  /** Set a default value */
  default(value: T): FieldBuilder<T>;
  /** Set minimum constraint */
  min(value: number, message?: string): FieldBuilder<T>;
  /** Set maximum constraint */
  max(value: number, message?: string): FieldBuilder<T>;
  /** Set regex pattern constraint */
  pattern(regex: RegExp, message?: string): FieldBuilder<T>;
}

/**
 * Extended builder for string fields with additional string-specific options
 */
export interface StringFieldBuilder extends FieldBuilder<string> {
  /** Set minimum length */
  min(length: number, message?: string): StringFieldBuilder;
  /** Set maximum length */
  max(length: number, message?: string): StringFieldBuilder;
  /** Set regex pattern */
  pattern(regex: RegExp, message?: string): StringFieldBuilder;
}

/**
 * Extended builder for number fields with numeric-specific options
 */
export interface NumberFieldBuilder extends FieldBuilder<number> {
  /** Set minimum value */
  min(value: number, message?: string): NumberFieldBuilder;
  /** Set maximum value */
  max(value: number, message?: string): NumberFieldBuilder;
  /** Constrain to integer values */
  int(): NumberFieldBuilder;
}

/**
 * Extended builder for date fields with date-specific options
 */
export interface DateFieldBuilder extends FieldBuilder<Date> {
  /** Constrain to past dates */
  past(): DateFieldBuilder;
  /** Constrain to future dates */
  future(): DateFieldBuilder;
  /** Constrain to recent dates */
  recent(): DateFieldBuilder;
  /** Constrain between specific dates */
  between(options: { from: string | Date; to: string | Date }): DateFieldBuilder;
}

/**
 * Extended builder for enum fields with type-safe values
 */
export interface EnumFieldBuilder<T extends string> extends FieldBuilder<T> {
  /** Set default enum value */
  default(value: T): EnumFieldBuilder<T>;
}

/**
 * Extended builder for reference fields pointing to other entities
 */
export interface RefFieldBuilder extends FieldBuilder<string> {
  /** The target entity name */
  readonly target: string;
}

/**
 * Extended builder for array fields
 */
export interface ArrayFieldBuilder<T> extends FieldBuilder<T[]> {
  /** Set minimum array length */
  min(length: number): ArrayFieldBuilder<T>;
  /** Set maximum array length */
  max(length: number): ArrayFieldBuilder<T>;
  /** Set exact array length */
  length(count: number): ArrayFieldBuilder<T>;
}

/**
 * Extended builder for object fields with nested shape
 */
export interface ObjectFieldBuilder<T> extends FieldBuilder<T> {
  /** The shape definition of nested properties */
  readonly shape: Record<string, FieldDefinition>;
}

// ============================================================================
// Relation Types
// ============================================================================

/**
 * Defines a relationship between entities.
 * Supports one-to-one, one-to-many, and many-to-many relationships.
 *
 * @example
 * ```typescript
 * const userPostsRelation: RelationDefinition = {
 *   type: 'hasMany',
 *   target: 'post',
 *   foreignKey: 'authorId',
 *   orderBy: { createdAt: 'desc' },
 * };
 * ```
 */
export interface RelationDefinition {
  /** The type of relationship */
  type: 'hasMany' | 'belongsTo' | 'hasOne';
  /** The target entity name */
  target: string;
  /** The foreign key field name (on the related entity for hasMany/hasOne, on this entity for belongsTo) */
  foreignKey?: string;
  /** Whether to eagerly load the relation by default */
  eager?: boolean;
  /** Default ordering for hasMany relations */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Default limit for hasMany relations */
  limit?: number;
  /** For many-to-many: the junction table name */
  through?: string;
  /** For many-to-many: the other foreign key on the junction table */
  otherKey?: string;
}

// ============================================================================
// Computed Field Types
// ============================================================================

/**
 * Configuration for computed fields that derive their value from other data.
 *
 * @example
 * ```typescript
 * const fullNameComputed: ComputedFieldDefinition<string> = {
 *   resolve: (entity) => `${entity.firstName} ${entity.lastName}`,
 *   dependsOn: ['firstName', 'lastName'],
 * };
 * ```
 */
export interface ComputedFieldDefinition<T = unknown> {
  /** Function to generate mock data for this computed field */
  mock?: () => T;
  /** Function to resolve the actual value from entity data */
  resolve: (entity: Record<string, unknown>, db: unknown, ctx: unknown) => T | Promise<T>;
  /** Fields this computed field depends on (for ordering resolution) */
  dependsOn?: string[];
  /** Internal type marker */
  readonly _computed: true;
  readonly _type?: T;
}

/**
 * Type guard to check if a field definition is a computed field
 */
export function isComputedField(field: unknown): field is ComputedFieldDefinition {
  return (
    typeof field === 'object' &&
    field !== null &&
    '_computed' in field &&
    (field as ComputedFieldDefinition)._computed === true
  );
}

/**
 * Type guard to check if a field definition is a relation
 */
export function isRelation(field: unknown): field is RelationDefinition {
  return (
    typeof field === 'object' &&
    field !== null &&
    'type' in field &&
    ['hasMany', 'belongsTo', 'hasOne'].includes((field as RelationDefinition).type)
  );
}

// ============================================================================
// Entity Schema Types
// ============================================================================

/**
 * API configuration for an entity
 */
export interface EntityApiConfig {
  /** Base path for REST endpoints (e.g., '/api/users') */
  basePath: string;
  /** Enable/disable specific CRUD operations */
  operations?: {
    list?: boolean;
    get?: boolean;
    create?: boolean;
    update?: boolean;
    delete?: boolean;
    [key: string]: boolean | { method: string; path: string; params?: string[] } | undefined;
  };
  /** Pagination configuration */
  pagination?: {
    style: 'offset' | 'cursor';
    defaultLimit?: number;
    maxLimit?: number;
  };
  /** Relationship endpoint configuration */
  relationships?: Record<
    string,
    {
      endpoint?: boolean;
      operations?: Array<'list' | 'create' | 'update' | 'delete'>;
    }
  >;
}

// ============================================================================
// Index Configuration Types
// ============================================================================

/**
 * Index configuration for database optimization.
 *
 * @example Simple index
 * ```typescript
 * { fields: ['authorId'] }
 * ```
 *
 * @example Composite unique index
 * ```typescript
 * { fields: ['email', 'tenantId'], unique: true }
 * ```
 *
 * @example Full-text search index
 * ```typescript
 * {
 *   fields: ['title'],
 *   type: 'gin',
 *   using: "to_tsvector('english', title)",
 * }
 * ```
 *
 * @example Partial index
 * ```typescript
 * {
 *   fields: ['createdAt'],
 *   where: "status = 'active'",
 * }
 * ```
 */
export interface IndexConfig {
  /** Column names to index */
  fields: string[];
  /** Custom index name (auto-generated if not provided) */
  name?: string;
  /** Index type (default: btree) */
  type?: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
  /** Custom expression for functional indexes (e.g., "to_tsvector('english', title)") */
  using?: string;
  /** Create unique index */
  unique?: boolean;
  /** Partial index condition (WHERE clause) */
  where?: string;
  /** Use CONCURRENTLY for production migrations (avoids locking) */
  concurrently?: boolean;
}

// ============================================================================
// RPC/Stored Procedure Configuration Types
// ============================================================================

/**
 * RPC/Stored procedure argument definition.
 *
 * @example
 * ```typescript
 * { name: 'user_id', type: 'uuid' }
 * { name: 'limit', type: 'integer', default: '20' }
 * ```
 */
export interface RPCArgument {
  /** Argument name */
  name: string;
  /** PostgreSQL type (uuid, text, integer, boolean, jsonb, etc.) */
  type: string;
  /** Default value as SQL expression (optional) */
  default?: string;
}

/**
 * RPC/Stored procedure configuration.
 *
 * @example Simple query function
 * ```typescript
 * {
 *   args: [{ name: 'user_id', type: 'uuid' }],
 *   returns: 'post[]',
 *   sql: "SELECT * FROM posts WHERE author_id = $1",
 *   volatility: 'stable',
 * }
 * ```
 *
 * @example Mutation function
 * ```typescript
 * {
 *   args: [{ name: 'post_id', type: 'uuid' }],
 *   returns: 'post',
 *   sql: "UPDATE posts SET status = 'published' WHERE id = $1 RETURNING *",
 *   volatility: 'volatile',
 * }
 * ```
 *
 * @example PL/pgSQL function
 * ```typescript
 * {
 *   args: [{ name: 'user_id', type: 'uuid' }],
 *   returns: 'integer',
 *   language: 'plpgsql',
 *   sql: `
 *     DECLARE
 *       v_count integer;
 *     BEGIN
 *       SELECT COUNT(*) INTO v_count FROM posts WHERE author_id = user_id;
 *       RETURN v_count;
 *     END;
 *   `,
 * }
 * ```
 */
export interface RPCConfig {
  /** Function arguments */
  args?: RPCArgument[];
  /** Return type: 'void', entity name (e.g., 'post'), array (e.g., 'post[]'), or PostgreSQL type */
  returns: string;
  /** SQL function body */
  sql: string;
  /** Function language (default: sql) */
  language?: 'sql' | 'plpgsql';
  /** Volatility marker for query optimization (default: volatile) */
  volatility?: 'volatile' | 'stable' | 'immutable';
  /** Security context (default: invoker) */
  security?: 'invoker' | 'definer';
  /** Function description for documentation */
  description?: string;
}

// ============================================================================
// Entity Options
// ============================================================================

/**
 * Options for entity schema configuration
 */
export interface EntityOptions<T = unknown> {
  /** API endpoint configuration */
  api?: EntityApiConfig;
  /** Whether to automatically add timestamp fields (createdAt, updatedAt) */
  timestamps?: boolean;
  /** Row-level security configuration */
  rls?: RLSConfig<T>;
  /** Database indexes for query optimization */
  indexes?: IndexConfig[];
  /** RPC/Stored procedures related to this entity */
  rpc?: Record<string, RPCConfig>;

  // ============================================================================
  // Entity Organization & Tagging
  // ============================================================================

  /**
   * Tags for entity classification and filtering.
   * Use tags to group entities for selective code generation.
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   tags: ['auth', 'public', 'core'],
   * });
   * ```
   */
  tags?: string[];

  /**
   * Module/domain grouping for the entity.
   * Use modules to organize entities by business domain.
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   module: 'identity',
   * });
   * const Payment = defineData('payment', { ... }, {
   *   module: 'billing',
   * });
   * ```
   */
  module?: string;

  /**
   * Logical grouping for the entity (e.g., access level or visibility).
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   group: 'public',
   * });
   * const AuditLog = defineData('auditLog', { ... }, {
   *   group: 'internal',
   * });
   * ```
   */
  group?: string;

  /**
   * Extensible metadata for custom properties.
   * Use this for any additional organization data not covered by tags/module/group.
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   metadata: {
   *     owner: 'auth-team',
   *     priority: 'high',
   *     deprecated: false,
   *   },
   * });
   * ```
   */
  metadata?: Record<string, unknown>;

  /**
   * Default middleware for all CRUD operations on this entity.
   * Middleware is applied in order to all endpoints unless overridden.
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   middleware: [authMiddleware, tenantMiddleware],
   * });
   * ```
   */
  middleware?: MiddlewareReference<any>[];

  /**
   * Per-operation endpoint configuration overrides.
   * Use this to customize middleware for specific CRUD operations.
   *
   * @example
   * ```typescript
   * const User = defineData('user', { ... }, {
   *   middleware: [authMiddleware],  // Default for all
   *   endpoints: {
   *     list: { middleware: [] },    // Public list
   *     delete: { middleware: [authMiddleware, adminMiddleware] },  // Admin only
   *   },
   * });
   * ```
   */
  endpoints?: EntityEndpointsConfig;
}

/**
 * Complete schema definition for an entity.
 * This is the primary output of the defineData function.
 *
 * @example
 * ```typescript
 * const userSchema: EntitySchema = {
 *   name: 'user',
 *   fields: { id: field.uuid(), name: field.string() },
 *   relations: { posts: hasMany('post') },
 *   computed: { postCount: field.computed({...}) },
 * };
 * ```
 */
/**
 * Generic context for RLS evaluation.
 * Can represent users, API keys, services, tenants, or any other context.
 *
 * @example
 * ```typescript
 * // User-based context
 * const userCtx: RLSContext = { userId: 'user-123', role: 'admin', orgId: 'org-456' };
 *
 * // API key context (no user)
 * const apiKeyCtx: RLSContext = { tenantId: 'tenant-789', scope: 'read' };
 *
 * // Service-to-service context
 * const serviceCtx: RLSContext = { serviceId: 'payment-service', environment: 'prod' };
 * ```
 */
export interface RLSContext {
  [key: string]: unknown;
}

/**
 * Row-level security policy filter function.
 * Receives the row data and current context (can be null if no context set).
 */
export type RLSFilter<T = unknown> = (row: T, context: RLSContext | null) => boolean;

/**
 * Scope mapping: maps a row field to a context key.
 * Used for automatic policy generation.
 *
 * @example
 * ```typescript
 * // Row field 'authorId' must match context key 'userId'
 * { field: 'authorId', contextKey: 'userId' }
 *
 * // Row field 'tenantId' must match context key 'tenantId'
 * { field: 'tenantId', contextKey: 'tenantId' }
 * ```
 */
export interface RLSScopeMapping {
  /** The field name on the row/entity */
  field: string;
  /** The key in the RLS context to compare against */
  contextKey: string;
}

/**
 * Bypass condition for RLS.
 * When the context matches this condition, RLS is bypassed.
 */
export interface RLSBypass {
  /** Context key to check */
  contextKey: string;
  /** Values that trigger bypass (e.g., ['admin', 'superuser']) */
  values: string[];
}

/**
 * Row-level security configuration for an entity.
 * Works with any context - users, API keys, services, tenants, etc.
 *
 * @example Simple scope-based (works without users)
 * ```typescript
 * const Post = defineData('post', { ... }, {
 *   rls: {
 *     // Rows filtered by tenantId from context
 *     scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
 *   },
 * });
 * ```
 *
 * @example User-based with owner field
 * ```typescript
 * const Post = defineData('post', { ... }, {
 *   rls: {
 *     scope: [{ field: 'authorId', contextKey: 'userId' }],
 *     bypass: [{ contextKey: 'role', values: ['admin'] }],
 *   },
 * });
 * ```
 *
 * @example Custom filter functions
 * ```typescript
 * const Post = defineData('post', { ... }, {
 *   rls: {
 *     select: (row, ctx) => row.isPublic || row.authorId === ctx?.userId,
 *     insert: (row, ctx) => row.authorId === ctx?.userId,
 *   },
 * });
 * ```
 */
export interface RLSConfig<T = unknown> {
  /**
   * Scope mappings for automatic policy generation.
   * Each mapping requires row[field] === context[contextKey].
   */
  scope?: RLSScopeMapping[];

  /**
   * Conditions that bypass RLS entirely.
   * If any bypass condition matches, all operations are allowed.
   */
  bypass?: RLSBypass[];

  /** Custom filter for SELECT/read operations */
  select?: RLSFilter<T>;
  /** Custom filter for INSERT operations */
  insert?: RLSFilter<T>;
  /** Custom filter for UPDATE operations */
  update?: RLSFilter<T>;
  /** Custom filter for DELETE operations */
  delete?: RLSFilter<T>;

  /**
   * PostgreSQL-compatible policy SQL for PGlite/Supabase.
   * Use current_setting('app.{contextKey}') to reference context values.
   */
  sql?: {
    select?: string;
    insert?: string;
    update?: string;
    delete?: string;
  };
}

export interface EntitySchema<T = unknown> {
  /** The unique name of this entity */
  name: string;
  /** Field definitions */
  fields: Record<string, FieldDefinition>;
  /** Relation definitions */
  relations?: Record<string, RelationDefinition>;
  /** Computed field definitions */
  computed?: Record<string, ComputedFieldDefinition>;
  /** Whether to include timestamp fields */
  timestamps?: boolean;
  /** API configuration */
  api?: EntityApiConfig;
  /** Row-level security configuration */
  rls?: RLSConfig<T>;
  /** Database indexes for query optimization */
  indexes?: IndexConfig[];
  /** RPC/Stored procedures related to this entity */
  rpc?: Record<string, RPCConfig>;

  // Entity Organization & Tagging
  /** Tags for entity classification and filtering */
  tags?: string[];
  /** Module/domain grouping */
  module?: string;
  /** Logical grouping (e.g., access level) */
  group?: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;

  /** Default middleware for all CRUD operations */
  middleware?: MiddlewareReference<any>[];
  /** Per-operation endpoint configuration overrides */
  endpoints?: EntityEndpointsConfig;

  /** Internal type marker */
  readonly _entity?: T;
}

// ============================================================================
// View Schema Types
// ============================================================================

/**
 * Embed configuration for including related data in views
 */
export interface EmbedConfig {
  /** Maximum number of items to include */
  limit?: number;
  /** Ordering for embedded items */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Fields to include (defaults to all) */
  select?: string[];
}

/**
 * View field value type - supports fields, computed, embeds, and nested objects
 */
export type ViewFieldValue =
  | FieldDefinition
  | ComputedFieldDefinition
  | { _embed: true; entity: EntitySchema; config?: EmbedConfig }
  | Record<string, FieldDefinition | ComputedFieldDefinition>;

/**
 * View field definitions (subset of entity fields + embedded relations)
 */
export type ViewFields = Record<string, ViewFieldValue>;

/**
 * Options for view schema configuration
 */
export interface ViewOptions {
  /** The API endpoint for this view */
  endpoint: string;
  /** URL parameters required for this view */
  params: string[];
}

/**
 * Schema definition for a computed view over entities.
 *
 * @example
 * ```typescript
 * const userFullView: ViewSchema = {
 *   name: 'user-full',
 *   fields: { id: field.uuid(), name: field.string() },
 *   endpoint: '/api/users/:id/full',
 *   params: ['id'],
 * };
 * ```
 */
export interface ViewSchema {
  /** The unique name of this view */
  name: string;
  /** Field definitions for the view output */
  fields: ViewFields;
  /** The API endpoint */
  endpoint: string;
  /** Required URL parameters */
  params: string[];
}

// ============================================================================
// Custom Endpoint Types
// ============================================================================

/**
 * HTTP methods supported for custom endpoints
 */
export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Context passed to mock resolver functions.
 * Provides access to request data and the mock database.
 *
 * @example
 * ```typescript
 * mockResolver: async ({ params, body, db }) => {
 *   const users = db.user.findMany({ where: { name: { contains: params.q } } });
 *   return { results: users, total: users.length };
 * }
 * ```
 */
export interface MockResolverContext<TParams = Record<string, unknown>, TBody = Record<string, unknown>, TDb = any> {
  /** Parsed query/path parameters */
  params: TParams;
  /** Parsed request body (for POST/PUT/PATCH) */
  body: TBody;
  /** Access to mock database - typed as `any` for flexibility, actual type is Database from generated db.ts */
  db: TDb;
  /** Request headers */
  headers: Record<string, string>;
}

/**
 * Configuration for defining a custom endpoint.
 *
 * @example
 * ```typescript
 * const config: EndpointConfig = {
 *   method: 'GET',
 *   params: { q: field.string(), limit: field.number.int().default(20) },
 *   response: { results: field.array(field.object({...})), total: field.number.int() },
 *   mockResolver: async ({ params, db }) => ({ results: [], total: 0 }),
 * };
 * ```
 */
export interface EndpointConfig<
  TParams = Record<string, unknown>,
  TBody = Record<string, unknown>,
  TResponse = unknown,
> {
  /** HTTP method */
  method: EndpointMethod;
  /** Query/path parameter definitions */
  params?: Record<string, FieldBuilder<unknown> | FieldDefinition>;
  /** Request body definition (for POST/PUT/PATCH) */
  body?: Record<string, FieldBuilder<unknown> | FieldDefinition>;
  /** Response schema definition */
  response: Record<string, FieldBuilder<unknown> | FieldDefinition>;
  /** Mock resolver function that generates fake responses */
  mockResolver: (ctx: MockResolverContext<TParams, TBody>) => TResponse | Promise<TResponse>;
  /** Optional description for documentation */
  description?: string;
  /** Middleware to apply to this endpoint */
  middleware?: MiddlewareReference<any>[];
}

/**
 * Complete endpoint schema definition.
 * This is the output of the defineEndpoint function.
 *
 * @example
 * ```typescript
 * const SearchEndpoint = defineEndpoint('/api/search', {
 *   method: 'GET',
 *   params: { q: field.string() },
 *   response: { results: field.array(field.string()) },
 *   mockResolver: async ({ params, db }) => ({ results: [] }),
 * });
 * ```
 */
export interface EndpointSchema<
  TParams = Record<string, unknown>,
  TBody = Record<string, unknown>,
  TResponse = unknown,
> {
  /** Endpoint path (e.g., '/api/search', '/api/orders/:id') */
  path: string;
  /** HTTP method */
  method: EndpointMethod;
  /** Parameter definitions (normalized to FieldDefinition) */
  params: Record<string, FieldDefinition>;
  /** Body definitions (normalized to FieldDefinition) */
  body: Record<string, FieldDefinition>;
  /** Response definitions (normalized to FieldDefinition) */
  response: Record<string, FieldDefinition>;
  /** Mock resolver function */
  mockResolver: (ctx: MockResolverContext<TParams, TBody>) => TResponse | Promise<TResponse>;
  /** Description for documentation */
  description?: string;
  /** Middleware to apply to this endpoint */
  middleware?: MiddlewareReference<any>[];
  /** Internal marker for type identification */
  readonly _endpoint: true;
}

/**
 * Type guard to check if a value is an EndpointSchema
 */
export function isEndpointSchema(value: unknown): value is EndpointSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_endpoint' in value &&
    (value as EndpointSchema)._endpoint === true
  );
}

// ============================================================================
// Custom Middleware Definition Types
// ============================================================================

/**
 * Context passed to middleware handlers.
 * This is the framework-agnostic context that gets adapted per backend.
 */
export interface MiddlewareHandlerContext {
  /** Request headers */
  headers: Record<string, string | undefined>;
  /** URL path */
  path: string;
  /** HTTP method */
  method: string;
  /** Query parameters */
  query: Record<string, string | string[] | undefined>;
  /** Path parameters */
  params: Record<string, string>;
  /** Request body (parsed JSON) */
  body?: unknown;
  /** User context (populated by auth middleware) */
  context: Record<string, unknown>;
  /** Metadata for passing data between middleware */
  metadata: Record<string, unknown>;
}

/**
 * Result returned by middleware handlers
 */
export interface MiddlewareHandlerResult {
  /** Modified context to pass to next middleware */
  ctx?: Partial<MiddlewareHandlerContext>;
  /** Response to return (short-circuits the chain) */
  response?: {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

/**
 * Middleware handler function type.
 * Similar to endpoint resolvers, this is framework-agnostic and gets adapted per backend.
 *
 * @example
 * ```typescript
 * const handler: MiddlewareHandler = async ({ ctx, config, next }) => {
 *   const tenantId = ctx.headers['x-tenant-id'];
 *   if (!tenantId) {
 *     return { response: { status: 400, body: { error: 'Tenant ID required' } } };
 *   }
 *   ctx.context.tenantId = tenantId;
 *   return next();
 * };
 * ```
 */
export type MiddlewareHandler<TConfig = Record<string, unknown>> = (params: {
  /** Request context */
  ctx: MiddlewareHandlerContext;
  /** Middleware configuration from schemock.config.ts */
  config: TConfig;
  /** Call the next middleware in the chain */
  next: () => Promise<MiddlewareHandlerResult | void>;
}) => Promise<MiddlewareHandlerResult | void>;

/**
 * Configuration for custom middleware definition.
 *
 * @example
 * ```typescript
 * const TenantMiddleware = defineMiddleware('tenant', {
 *   config: {
 *     headerName: field.string().default('X-Tenant-ID'),
 *     required: field.boolean().default(true),
 *   },
 *   handler: async ({ ctx, config, next }) => {
 *     const tenantId = ctx.headers[config.headerName.toLowerCase()];
 *     if (!tenantId && config.required) {
 *       return { response: { status: 400, body: { error: 'Tenant ID required' } } };
 *     }
 *     ctx.context.tenantId = tenantId;
 *     return next();
 *   },
 * });
 * ```
 */
export interface MiddlewareConfig<TConfig = Record<string, unknown>> {
  /** Configuration schema for this middleware (optional) */
  config?: Record<string, FieldBuilder<unknown> | FieldDefinition>;
  /** The middleware handler function */
  handler: MiddlewareHandler<TConfig>;
  /** Description for documentation */
  description?: string;
  /** Order hint - where in the chain this should run */
  order?: 'early' | 'normal' | 'late';
  /** Headers required by this middleware (for documentation/validation) */
  requiredHeaders?: string[];
}

/**
 * Complete middleware schema definition.
 * This is the output of the defineMiddleware function.
 */
export interface MiddlewareSchema<TConfig = Record<string, unknown>> {
  /** Unique middleware name */
  name: string;
  /** Configuration schema (normalized to FieldDefinition) */
  config: Record<string, FieldDefinition>;
  /** The middleware handler function */
  handler: MiddlewareHandler<TConfig>;
  /** Description for documentation */
  description?: string;
  /** Order hint */
  order: 'early' | 'normal' | 'late';
  /** Headers required by this middleware (for documentation/validation) */
  requiredHeaders?: string[];
  /** Internal marker for type identification */
  readonly _middleware: true;

  /**
   * Create a new middleware reference with configuration overrides.
   * Use this to customize middleware behavior per-entity or per-endpoint.
   *
   * @param overrides - Partial configuration to override defaults
   * @returns MiddlewareWithConfig that can be used in middleware arrays
   *
   * @example
   * ```typescript
   * const rateLimitMiddleware = defineServerMiddleware('rate-limit', {
   *   config: { max: field.number().default(100) },
   *   handler: async ({ ctx, config, next }) => { ... },
   * });
   *
   * // Use with overrides
   * const endpoint = defineEndpoint('/api/search', {
   *   middleware: [rateLimitMiddleware.with({ max: 10 })],
   *   ...
   * });
   * ```
   */
  with(overrides: Partial<TConfig>): MiddlewareWithConfig<TConfig>;
}

/**
 * Type guard to check if a value is a MiddlewareSchema
 */
export function isMiddlewareSchema(value: unknown): value is MiddlewareSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_middleware' in value &&
    (value as MiddlewareSchema)._middleware === true
  );
}

// Type aliases for explicit server middleware naming
export type ServerMiddlewareConfig<TConfig = Record<string, unknown>> = MiddlewareConfig<TConfig>;
export type ServerMiddlewareSchema<TConfig = Record<string, unknown>> = MiddlewareSchema<TConfig>;

// ============================================================================
// Middleware Reference Types (for entity/endpoint middleware configuration)
// ============================================================================

/**
 * Result of calling `.with()` on a middleware schema.
 * Contains the middleware reference and configuration overrides.
 *
 * @example
 * ```typescript
 * const rateLimitConfig: MiddlewareWithConfig = rateLimitMiddleware.with({ max: 10 });
 * ```
 */
export interface MiddlewareWithConfig<TConfig = Record<string, unknown>> {
  /** The original middleware schema */
  middleware: MiddlewareSchema<TConfig>;
  /** Configuration overrides to apply */
  configOverrides: Partial<TConfig>;
  /** Internal marker for type identification */
  _middlewareRef: true;
}

/**
 * Type guard to check if a value is a MiddlewareWithConfig
 */
export function isMiddlewareWithConfig(value: unknown): value is MiddlewareWithConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_middlewareRef' in value &&
    (value as MiddlewareWithConfig)._middlewareRef === true
  );
}

/**
 * A reference to middleware that can be used in entity or endpoint configuration.
 * Can be either a direct middleware schema or a configured instance via `.with()`.
 *
 * @example
 * ```typescript
 * const middleware: MiddlewareReference[] = [
 *   authMiddleware,                           // Direct reference
 *   rateLimitMiddleware.with({ max: 100 }),  // Configured reference
 * ];
 * ```
 */
export type MiddlewareReference<TConfig = Record<string, unknown>> =
  | MiddlewareSchema<TConfig>
  | MiddlewareWithConfig<TConfig>;

/**
 * Configuration for a specific CRUD endpoint on an entity.
 * Allows per-operation customization of middleware.
 *
 * @example
 * ```typescript
 * const deleteConfig: EntityEndpointConfig = {
 *   middleware: [authMiddleware, adminMiddleware],
 * };
 * ```
 */
export interface EntityEndpointConfig {
  /** Middleware to apply to this specific operation */
  middleware?: MiddlewareReference<any>[];
}

/**
 * Per-operation endpoint configuration overrides for an entity.
 * Each operation can have its own middleware configuration.
 *
 * @example
 * ```typescript
 * const endpoints: EntityEndpointsConfig = {
 *   list: { middleware: [] },                    // Public list
 *   get: { middleware: [authMiddleware] },       // Requires auth
 *   delete: { middleware: [authMiddleware, adminMiddleware] },  // Admin only
 * };
 * ```
 */
export interface EntityEndpointsConfig {
  /** Configuration for the list (GET all) operation */
  list?: EntityEndpointConfig;
  /** Configuration for the get (GET by ID) operation */
  get?: EntityEndpointConfig;
  /** Configuration for the create (POST) operation */
  create?: EntityEndpointConfig;
  /** Configuration for the update (PUT/PATCH) operation */
  update?: EntityEndpointConfig;
  /** Configuration for the delete (DELETE) operation */
  delete?: EntityEndpointConfig;
}

// ============================================================================
// Client Middleware Definition Types
// ============================================================================

/**
 * Context passed to client middleware before hook.
 * Contains request information before it's sent to the server.
 */
export interface ClientBeforeContext {
  /** The outgoing request details */
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  /** Shared context for passing data between middleware */
  context: Record<string, unknown>;
  /** Information about the API operation being performed */
  operation: {
    /** The entity being operated on (e.g., 'user', 'post') */
    entity: string;
    /** The action being performed (e.g., 'list', 'get', 'create', 'update', 'delete') */
    action: string;
  };
}

/**
 * Context passed to client middleware after hook.
 * Contains both request and response information.
 */
export interface ClientAfterContext extends ClientBeforeContext {
  /** The response received from the server */
  response: {
    data: unknown;
    status: number;
    headers: Record<string, string>;
  };
  /** Metadata passed from before hook or previous middleware */
  metadata: Record<string, unknown>;
}

/**
 * Context passed to client middleware error hook.
 * Contains request info and error details.
 */
export interface ClientErrorContext extends ClientBeforeContext {
  /** Error information */
  error: {
    status: number;
    message: string;
    data?: unknown;
  };
  /** Metadata passed from before hook or previous middleware */
  metadata: Record<string, unknown>;
  /** Number of retry attempts so far */
  retryCount: number;
}

/**
 * Result returned from client middleware before hook.
 * Can modify the request, short-circuit with a response, or pass metadata.
 */
export interface ClientBeforeResult {
  /** Modified request properties (merged with original) */
  request?: Partial<ClientBeforeContext['request']>;
  /** Short-circuit response (skips actual API call) */
  response?: {
    data: unknown;
    status: number;
  };
  /** Metadata to pass to after/error hooks */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for defining client-side middleware.
 * Client middleware runs in the browser and intercepts API calls.
 *
 * @example
 * ```typescript
 * const analyticsMiddleware = defineClientMiddleware('analytics', {
 *   before: async ({ request, operation }) => {
 *     console.log(`API call: ${operation.action} ${operation.entity}`);
 *     return { metadata: { startTime: Date.now() } };
 *   },
 *   after: async ({ response, metadata }) => {
 *     const duration = Date.now() - (metadata.startTime as number);
 *     console.log(`Response in ${duration}ms`);
 *   },
 *   onError: async ({ error, operation }) => {
 *     console.error(`Error in ${operation.action}: ${error.message}`);
 *   },
 * });
 * ```
 */
export interface ClientMiddlewareConfig {
  /** Hook called before the request is sent */
  before?: (ctx: ClientBeforeContext) => Promise<ClientBeforeResult | void>;
  /** Hook called after a successful response */
  after?: (ctx: ClientAfterContext) => Promise<ClientAfterContext['response'] | void>;
  /** Hook called when an error occurs */
  onError?: (ctx: ClientErrorContext) => Promise<unknown | void>;
  /** Description for documentation */
  description?: string;
  /** Order hint - where in the chain this should run */
  order?: 'early' | 'normal' | 'late';
}

/**
 * Complete client middleware schema definition.
 * This is the output of the defineClientMiddleware function.
 */
export interface ClientMiddlewareSchema {
  /** Unique middleware name */
  name: string;
  /** Hook called before the request is sent */
  before?: (ctx: ClientBeforeContext) => Promise<ClientBeforeResult | void>;
  /** Hook called after a successful response */
  after?: (ctx: ClientAfterContext) => Promise<ClientAfterContext['response'] | void>;
  /** Hook called when an error occurs */
  onError?: (ctx: ClientErrorContext) => Promise<unknown | void>;
  /** Description for documentation */
  description?: string;
  /** Order hint */
  order: 'early' | 'normal' | 'late';
  /** Internal marker for type identification */
  readonly _clientMiddleware: true;
}

/**
 * Type guard to check if a value is a ClientMiddlewareSchema
 */
export function isClientMiddlewareSchema(value: unknown): value is ClientMiddlewareSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_clientMiddleware' in value &&
    (value as ClientMiddlewareSchema)._clientMiddleware === true
  );
}

// ============================================================================
// Type Inference Utilities
// ============================================================================

/**
 * Maps field types to their TypeScript equivalents
 */
type FieldTypeMap = {
  string: string;
  uuid: string;
  email: string;
  url: string;
  number: number;
  int: number;
  float: number;
  boolean: boolean;
  date: Date;
  array: unknown[];
  object: Record<string, unknown>;
  ref: string;
  enum: string;
};

/**
 * Infer the TypeScript type from a FieldDefinition
 */
export type InferFieldType<F extends FieldDefinition> = F['nullable'] extends true
  ? (F extends { _type: infer T } ? T : FieldTypeMap[F['type'] & keyof FieldTypeMap]) | null
  : F extends { _type: infer T }
    ? T
    : FieldTypeMap[F['type'] & keyof FieldTypeMap];

/**
 * Infer the complete entity type from an EntitySchema
 *
 * @example
 * ```typescript
 * const User = defineData('user', { id: field.uuid(), name: field.string() });
 * type UserType = InferEntity<typeof User>;
 * // { id: string; name: string; }
 * ```
 */
export type InferEntity<S extends EntitySchema> = {
  [K in keyof S['fields']]: InferFieldType<S['fields'][K]>;
} & (S['relations'] extends Record<string, RelationDefinition>
  ? {
      [K in keyof S['relations']]?: S['relations'][K]['type'] extends 'hasMany' ? unknown[] : unknown;
    }
  : object) &
  (S['computed'] extends Record<string, ComputedFieldDefinition>
    ? { [K in keyof S['computed']]: S['computed'][K]['_type'] }
    : object);

/**
 * Infer the type for creating a new entity (excludes id, readOnly, computed fields)
 *
 * @example
 * ```typescript
 * type UserCreate = InferCreate<typeof User>;
 * // { name: string; email: string; } (without id, createdAt, etc.)
 * ```
 */
export type InferCreate<S extends EntitySchema> = {
  [K in keyof S['fields'] as S['fields'][K]['readOnly'] extends true
    ? never
    : K extends 'id'
      ? never
      : K]: S['fields'][K]['default'] extends undefined
    ? InferFieldType<S['fields'][K]>
    : InferFieldType<S['fields'][K]> | undefined;
};

/**
 * Infer the type for updating an entity (all fields optional, excludes readOnly)
 *
 * @example
 * ```typescript
 * type UserUpdate = InferUpdate<typeof User>;
 * // { name?: string; email?: string; }
 * ```
 */
export type InferUpdate<S extends EntitySchema> = Partial<InferCreate<S>>;
