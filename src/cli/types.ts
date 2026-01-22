/**
 * CLI type definitions for Schemock code generation
 *
 * @module cli/types
 * @category CLI
 */

import type { EntitySchema, RLSConfig, RLSFilter, RLSContext, RLSScopeMapping, RLSBypass, IndexConfig, RPCConfig, RPCArgument } from '../schema/types';

// Re-export types for generators
export type { RLSConfig, RLSFilter, RLSContext, RLSScopeMapping, RLSBypass, IndexConfig, RPCConfig, RPCArgument } from '../schema/types';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Faker mapping configuration for custom data generation
 */
export interface FakerMapping {
  /** Match field.hint */
  hint?: string;
  /** Match field.type */
  type?: string;
  /** Match field name with regex */
  fieldName?: RegExp;
  /** Faker call to generate */
  call: string;
}

/**
 * Mock adapter configuration
 */
export interface MockAdapterConfig {
  /** Default seed counts per entity */
  seed?: Record<string, number>;
  /** Simulated network delay (ms) */
  delay?: number;
  /** Faker seed for reproducible data */
  fakerSeed?: number;
  /** Persistence mode (default: 'localStorage') */
  persistence?: 'memory' | 'localStorage';
  /** localStorage key prefix (default: 'schemock') */
  storageKey?: string;
}

/**
 * Supabase adapter configuration
 */
export interface SupabaseAdapterConfig {
  /** Schema name -> table name mapping */
  tableMap?: Record<string, string>;
  /** Environment variable prefix */
  envPrefix?: string;
  /** Generate SQL migrations (default: false) */
  migrations?: boolean;
  /** Directory for migration files (default: './supabase/migrations') */
  migrationsDir?: string;
}

/**
 * Firebase adapter configuration
 */
export interface FirebaseAdapterConfig {
  /** Schema name -> collection name mapping */
  collectionMap?: Record<string, string>;
}

/**
 * Fetch adapter configuration
 */
export interface FetchAdapterConfig {
  /** API base URL */
  baseUrl?: string;
  /** Pattern for endpoints */
  endpointPattern?: string;
}

/**
 * GraphQL adapter configuration
 */
export interface GraphQLAdapterConfig {
  /** Operation name patterns */
  operations?: {
    findOne?: string;
    findMany?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
}

/**
 * PGlite adapter configuration
 */
export interface PGliteAdapterConfig {
  /** Persistence mode */
  persistence?: 'memory' | 'indexeddb' | 'opfs';
  /** Data directory (for IndexedDB: 'idb://name', for OPFS: 'opfs://name') */
  dataDir?: string;
  /** Faker seed for reproducible data */
  fakerSeed?: number;
  /** Default seed counts per entity */
  seed?: Record<string, number>;
}

// ============================================================================
// Multi-Target Generation Types
// ============================================================================

/**
 * Auth provider configuration for middleware generation
 */
export interface AuthProviderConfig {
  /** Auth provider type */
  provider: 'supabase-auth' | 'jwt' | 'nextauth' | 'clerk' | 'custom';
  /** Secret key env variable (for JWT) */
  secretEnvVar?: string;
  /** Custom auth validation function path (for custom provider) */
  customHandler?: string;
}

/**
 * Middleware configuration for a target
 * @deprecated Use MiddlewareConfig instead for new config format
 */
export interface TargetMiddlewareConfig {
  /** Middleware chain order */
  chain?: string[];
  /** Auth configuration */
  auth?: AuthProviderConfig;
  /** Enable validation middleware generation from schema */
  validation?: boolean;
  /** Rate limiting configuration */
  rateLimit?: {
    /** Requests per window */
    max: number;
    /** Window duration in ms */
    windowMs: number;
  };
}

// ============================================================================
// New Config Format (v1.0)
// ============================================================================

/**
 * Frontend framework types
 */
export type FrontendFramework = 'react' | 'vue' | 'svelte' | 'none';

/**
 * Frontend adapter types (client-side data layer)
 */
export type FrontendAdapter = 'mock' | 'supabase' | 'firebase' | 'fetch' | 'pglite';

/**
 * Backend framework types
 */
export type BackendFramework = 'node' | 'nextjs' | 'supabase-edge' | 'neon';

/**
 * Frontend configuration
 */
export interface FrontendConfig {
  /** Frontend framework for hooks/components generation */
  framework: FrontendFramework;
  /** Client-side adapter type */
  adapter: FrontendAdapter;
  /** Output directory (defaults to main output) */
  output?: string;
}

/**
 * Backend configuration
 */
export interface BackendConfig {
  /** Backend framework for API generation */
  framework: BackendFramework;
  /** Output directory for backend code */
  output: string;
  /** Database connection (for backends that need it) */
  database?: {
    /** Database type */
    type: 'postgres' | 'supabase' | 'neon';
    /** Environment variable for connection string */
    connectionEnvVar?: string;
  };
}

/**
 * Auth middleware configuration
 */
export interface AuthMiddlewareConfig {
  /** Auth provider type */
  provider: 'supabase-auth' | 'jwt' | 'nextauth' | 'clerk' | 'custom';
  /** Whether auth is required for all routes (default: true) */
  required?: boolean;
  /** Secret key env variable (for JWT) */
  secretEnvVar?: string;
  /** Custom auth handler file path (for custom provider) */
  customHandler?: string;
  /** Routes/operations to skip auth */
  skip?: string[];
}

/**
 * Rate limit middleware configuration
 */
export interface RateLimitMiddlewareConfig {
  /** Maximum requests per window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key generator (default: IP-based) */
  keyGenerator?: 'ip' | 'user' | 'custom';
  /** Custom key generator file path */
  customKeyGenerator?: string;
  /** Key to use for rate limiting (e.g., 'ip', 'userId') - alias for keyGenerator */
  keyBy?: string;
}

/**
 * Cache middleware configuration
 */
export interface CacheMiddlewareConfig {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Operations to cache (default: ['findOne', 'findMany']) */
  operations?: string[];
  /** Cache storage type */
  storage?: 'memory' | 'redis';
  /** Redis connection env var (if storage is redis) */
  redisEnvVar?: string;
}

/**
 * Logger middleware configuration
 */
export interface LoggerMiddlewareConfig {
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error';
  /** Include request body in logs */
  includeBody?: boolean;
  /** Include response in logs */
  includeResponse?: boolean;
  /** Fields to redact from logs */
  redactFields?: string[];
}

/**
 * Unified middleware configuration (v1.0)
 * Middleware defined here is generated for both frontend and backend
 */
export interface MiddlewareConfig {
  /** Middleware execution order (default: auth -> logger -> context -> rls -> cache) */
  chain?: string[];
  /** Auth middleware configuration */
  auth?: AuthMiddlewareConfig | boolean;
  /** Rate limiting configuration */
  rateLimit?: RateLimitMiddlewareConfig;
  /** Cache middleware configuration */
  cache?: CacheMiddlewareConfig | boolean;
  /** Logger middleware configuration */
  logger?: LoggerMiddlewareConfig | boolean;
  /** Enable validation middleware (from schema constraints) */
  validation?: boolean;
  /** Enable context extraction middleware (JWT claims, headers) */
  context?: boolean;
  /** Enable RLS middleware */
  rls?: boolean;
  /** Paths to custom middleware files (using defineMiddleware) */
  custom?: string[];
}

/**
 * Generation target types
 */
export type TargetType =
  | 'mock'
  | 'supabase'
  | 'firebase'
  | 'fetch'
  | 'graphql'
  | 'pglite'
  | 'nextjs-api'
  | 'nextjs-edge'
  | 'express'
  | 'hono'
  | 'node-handlers'
  | 'supabase-edge'
  | 'neon';

/**
 * Configuration for a single generation target
 */
export interface GenerationTarget {
  /** Unique name for this target */
  name: string;
  /** Target type */
  type: TargetType;
  /** Output directory for this target */
  output: string;
  /** Which entities to include (default: all) */
  entities?: string[];
  /** Which entities to exclude */
  excludeEntities?: string[];

  // Tag-based filtering
  /** Include only entities with these tags (OR logic - entity must have at least one) */
  tags?: string[];
  /** Exclude entities with these tags */
  excludeTags?: string[];
  /** Include only entities from this module */
  module?: string;
  /** Include only entities from this group */
  group?: string;

  /** Backend to use for server targets (e.g., nextjs-api uses supabase under the hood) */
  backend?: 'supabase' | 'firebase' | 'pglite' | 'fetch';
  /** Framework integration (react generates hooks/provider, none is framework-agnostic) */
  framework?: 'react' | 'none';
  /** Middleware configuration for this target */
  middleware?: TargetMiddlewareConfig;
  /** Path to custom hooks file for lifecycle hooks */
  hooks?: string;
  /** Target-specific options */
  options?: Record<string, unknown>;
}

/**
 * Pluralization configuration
 */
export interface PluralizeConfig {
  /** Custom pluralization overrides */
  custom?: Record<string, string>;
}

/**
 * Production seed configuration
 *
 * Allows users to define custom production data (super admin, default products, etc.)
 * that gets seeded once with a kill switch to prevent re-seeding.
 */
export interface ProductionSeedConfig {
  /** Path to the seed data file (default: './src/seed-data.ts') */
  dataPath?: string;
}

/**
 * Result of running production seed
 */
export interface SeedResult {
  /** Whether the seed operation succeeded */
  success: boolean;
  /** Error code if failed */
  error?: 'INVALID_SECRET' | 'ALREADY_SEEDED';
  /** Timestamp when seeded (if already seeded or just seeded) */
  seededAt?: Date;
}

/**
 * Main Schemock configuration
 */
export interface SchemockConfig {
  /** Schema discovery glob pattern */
  schemas: string;
  /** Output directory (used when targets is not specified) */
  output: string;
  /** Default adapter type (used when targets is not specified) */
  adapter: 'mock' | 'supabase' | 'firebase' | 'fetch' | 'graphql' | 'pglite';
  /** API prefix */
  apiPrefix: string;
  /** Pluralization overrides */
  pluralization?: PluralizeConfig;
  /** Custom faker mappings (extend defaults) */
  fakerMappings?: FakerMapping[];
  /** Adapter-specific configuration */
  adapters?: {
    mock?: MockAdapterConfig;
    supabase?: SupabaseAdapterConfig;
    firebase?: FirebaseAdapterConfig;
    fetch?: FetchAdapterConfig;
    graphql?: GraphQLAdapterConfig;
    pglite?: PGliteAdapterConfig;
  };
  /**
   * Multi-target generation configuration.
   * When specified, generates multiple outputs from the same schema.
   * Each target can have its own output directory, entity selection, and middleware config.
   * @deprecated Use frontend/backend configuration instead
   */
  targets?: GenerationTarget[];

  // ============================================================================
  // New Config Format (v1.0)
  // ============================================================================

  /**
   * Frontend configuration (v1.0)
   * Defines the client-side framework and adapter
   */
  frontend?: FrontendConfig;

  /**
   * Backend configuration (v1.0)
   * Defines the server-side framework for API generation
   */
  backend?: BackendConfig;

  /**
   * Unified middleware configuration (v1.0)
   * Middleware defined here is generated for both frontend and backend
   */
  middleware?: MiddlewareConfig;

  /**
   * Production seed configuration (v1.0)
   * Define custom production data that gets seeded once with a kill switch.
   */
  productionSeed?: ProductionSeedConfig;
}

// ============================================================================
// Analysis Types
// ============================================================================

/**
 * Analyzed field with all computed properties
 */
export interface AnalyzedField {
  name: string;
  /** Original type */
  type: string;
  /** TypeScript type */
  tsType: string;
  /** Faker.js call for mock generation */
  fakerCall: string;

  // Flags
  nullable: boolean;
  unique: boolean;
  readOnly: boolean;
  hasDefault: boolean;
  defaultValue: unknown;

  // Reference info
  isRef: boolean;
  refTarget?: string;

  // Enum info
  isEnum: boolean;
  enumValues?: string[];

  // Array/Object info
  isArray: boolean;
  isObject: boolean;
  itemType?: AnalyzedField;
  shape?: Record<string, AnalyzedField>;

  // Computed field flag
  isComputed?: boolean;

  // Constraints
  min?: number;
  max?: number;
  pattern?: string;
}

/**
 * Analyzed relation with computed properties
 */
export interface AnalyzedRelation {
  name: string;
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
  /** Original target as defined in relation (e.g., 'user') */
  target: string;
  /** Resolved target - actual schema name found (e.g., 'authUser'). Falls back to target if not found. */
  resolvedTarget: string;
  targetPascal: string;
  foreignKey: string;

  /** For belongsTo - FK is on this entity */
  localField?: string;

  /** For manyToMany - junction table */
  through?: string;
  /** For manyToMany - other FK */
  otherKey?: string;

  /** Always load */
  eager: boolean;

  /** True if FK was inferred (not explicitly specified or using default fallback) */
  inferred?: boolean;
}

/**
 * Analyzed computed field
 */
export interface AnalyzedComputed {
  name: string;
  type: string;
  tsType: string;
}

/**
 * Analyzed RLS configuration for code generation
 */
export interface AnalyzedRLS {
  /** Has any RLS policies defined */
  enabled: boolean;
  /** Has select policy */
  hasSelect: boolean;
  /** Has insert policy */
  hasInsert: boolean;
  /** Has update policy */
  hasUpdate: boolean;
  /** Has delete policy */
  hasDelete: boolean;
  /** Scope mappings (row field -> context key) */
  scope: RLSScopeMapping[];
  /** Bypass conditions */
  bypass: RLSBypass[];
  /** Serialized function source for select policy */
  selectSource?: string;
  /** Serialized function source for insert policy */
  insertSource?: string;
  /** Serialized function source for update policy */
  updateSource?: string;
  /** Serialized function source for delete policy */
  deleteSource?: string;
  /** Raw SQL policies (for PostgreSQL) */
  sql?: {
    select?: string;
    insert?: string;
    update?: string;
    delete?: string;
  };
  /** Original RLS config reference */
  original?: RLSConfig;
}

/**
 * Analyzed database index with computed properties
 */
export interface AnalyzedIndex {
  /** Index name (auto-generated or user-defined) */
  name: string;
  /** Table name this index belongs to */
  tableName: string;
  /** Column names in the index */
  fields: string[];
  /** Index type */
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
  /** Is unique index */
  unique: boolean;
  /** Custom expression for functional indexes */
  using?: string;
  /** Partial index condition (WHERE clause) */
  where?: string;
  /** Use CONCURRENTLY */
  concurrently: boolean;
  /** Auto-generated (FK, unique field) vs user-defined */
  autoGenerated: boolean;
}

/**
 * Analyzed RPC/stored procedure function
 */
export interface AnalyzedRPC {
  /** Function name */
  name: string;
  /** Related entity name */
  entityName: string;
  /** Table name for SQL */
  tableName: string;
  /** Function arguments with PostgreSQL types */
  args: Array<{
    name: string;
    type: string;
    pgType: string;
    default?: string;
  }>;
  /** Return type (entity name, 'void', or PostgreSQL type) */
  returns: string;
  /** PostgreSQL return type for SQL */
  pgReturns: string;
  /** Is array return (SETOF) */
  returnsArray: boolean;
  /** SQL function body */
  sql: string;
  /** Function language */
  language: 'sql' | 'plpgsql';
  /** Volatility marker */
  volatility: 'volatile' | 'stable' | 'immutable';
  /** Security context */
  security: 'invoker' | 'definer';
  /** Function description */
  description?: string;
}

/**
 * Fully analyzed schema with all computed properties
 */
export interface AnalyzedSchema {
  // Names
  /** Original name (as defined in schema) */
  name: string;
  /** Singularized name (user, post) */
  singularName: string;
  /** Pluralized name (users, posts) */
  pluralName: string;
  /** PascalCase singular name (User, Post) */
  pascalName: string;
  /** PascalCase singular name (alias for pascalName) */
  pascalSingularName: string;
  /** PascalCase plural name (Users, Posts) */
  pascalPluralName: string;
  /** DB table name */
  tableName: string;
  /** API endpoint */
  endpoint: string;

  // Structure
  fields: AnalyzedField[];
  relations: AnalyzedRelation[];
  computed: AnalyzedComputed[];

  // Dependencies (for topological sort)
  dependsOn: string[];

  // Flags
  hasTimestamps: boolean;
  /** Only refs + maybe enum (junction table) */
  isJunctionTable: boolean;

  // Row-Level Security
  rls: AnalyzedRLS;
  /** RLS config (alias for rls) */
  rlsConfig?: AnalyzedRLS;

  // Database indexes
  indexes: AnalyzedIndex[];

  // RPC/Stored procedures
  rpc: AnalyzedRPC[];

  // Entity Organization & Tagging
  /** Tags for entity classification and filtering */
  tags: string[];
  /** Module/domain grouping */
  module?: string;
  /** Logical grouping (e.g., access level) */
  group?: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;

  // Original schema reference
  original: EntitySchema;
}

// ============================================================================
// Analyzed Endpoint Types
// ============================================================================

/**
 * Analyzed field for endpoint params/body/response
 */
export interface AnalyzedEndpointField {
  /** Field name */
  name: string;
  /** Original type */
  type: string;
  /** TypeScript type */
  tsType: string;
  /** Is required (no default) */
  required: boolean;
  /** Has default value */
  hasDefault: boolean;
  /** Default value */
  default?: unknown;
  /** Is array type */
  isArray: boolean;
  /** Is object type */
  isObject: boolean;
  /** Nested fields for objects */
  shape?: AnalyzedEndpointField[];
  /** Item type for arrays */
  itemType?: AnalyzedEndpointField;
  /** Enum values if enum type */
  enumValues?: string[];
}

/**
 * Dependency import for inline resolvers
 */
export interface ResolverDependency {
  /** Identifier name used in the resolver */
  name: string;
  /** Module path to import from */
  from: string;
  /** Whether it's a default import */
  isDefault?: boolean;
}

/**
 * Local function definition used by inline resolver
 */
export interface LocalFunction {
  /** Function name */
  name: string;
  /** Full function source code */
  source: string;
}

/**
 * Fully analyzed endpoint with all computed properties
 */
export interface AnalyzedEndpoint {
  /** Original URL path */
  path: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint name (derived from path) */
  name: string;
  /** PascalCase name for types */
  pascalName: string;
  /** Path parameters extracted from path (e.g., :id -> ['id']) */
  pathParams: string[];
  /** Analyzed query/path parameters */
  params: AnalyzedEndpointField[];
  /** Analyzed body fields */
  body: AnalyzedEndpointField[];
  /** Analyzed response fields */
  response: AnalyzedEndpointField[];
  /** Serialized mock resolver function source */
  mockResolverSource: string;
  /** Name of the resolver function (if it's a named function) */
  mockResolverName?: string;
  /** Import path for the resolver (if external) */
  mockResolverImportPath?: string;
  /** Export name in the source file */
  mockResolverExportName?: string;
  /** Source file path where this endpoint is defined */
  sourceFile?: string;
  /** Dependencies detected in inline resolver (functions used but not defined locally) */
  resolverDependencies?: ResolverDependency[];
  /** Local functions used by inline resolver */
  localFunctions?: LocalFunction[];
  /** Description */
  description?: string;
}

// ============================================================================
// Analyzed Middleware Types
// ============================================================================

/**
 * Analyzed config field for middleware
 */
export interface AnalyzedMiddlewareConfigField {
  /** Field name */
  name: string;
  /** Original type */
  type: string;
  /** TypeScript type */
  tsType: string;
  /** Has default value */
  hasDefault: boolean;
  /** Default value */
  default?: unknown;
  /** Default value (alias for default) */
  defaultValue?: unknown;
  /** Is nullable */
  nullable: boolean;
  /** Enum values if enum type */
  enumValues?: string[];
}

/**
 * Fully analyzed middleware with all computed properties
 */
export interface AnalyzedMiddleware {
  /** Unique middleware name */
  name: string;
  /** PascalCase name for types (e.g., 'tenant' -> 'Tenant') */
  pascalName: string;
  /** Analyzed configuration fields */
  configFields: AnalyzedMiddlewareConfigField[];
  /** Serialized handler function source */
  handlerSource: string;
  /** Serialized handler function source (alias for handlerSource) */
  handlerCode?: string;
  /** Name of the handler function (if it's a named function) */
  handlerName?: string;
  /** Import path for the handler (if external) */
  handlerImportPath?: string;
  /** Source file path where this middleware is defined */
  sourceFile?: string;
  /** Dependencies detected in inline handler (functions used but not defined locally) */
  handlerDependencies?: ResolverDependency[];
  /** Local functions used by inline handler */
  localFunctions?: LocalFunction[];
  /** Order hint for middleware chain */
  order: 'early' | 'normal' | 'late';
  /** Description */
  description?: string;
}

// ============================================================================
// Generate Command Types
// ============================================================================

/**
 * Options for the generate command
 */
/** Framework type for generated code */
export type FrameworkType = 'react' | 'none';

export interface GenerateOptions {
  /** Adapter type to generate */
  adapter?: string;
  /** Output directory */
  output?: string;
  /** Config file path */
  config?: string;
  /** Watch mode */
  watch?: boolean;
  /** Show what would be generated without writing */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Only generate for these entities (applies to all targets) */
  only?: string[];
  /** Exclude these entities (applies to all targets) */
  exclude?: string[];
  /** Generate form schemas (Zod validation, defaults, column metadata) */
  withFormSchemas?: boolean;
  /** Framework integration (react generates hooks/provider, none is framework-agnostic) */
  framework?: FrameworkType;
}

/**
 * Options for the generate:sql command
 */
export interface GenerateSQLOptions {
  /** Output directory for SQL files */
  output?: string;
  /** Generate combined single file vs separate files */
  combined?: boolean;
  /** Target platform */
  target?: 'postgres' | 'supabase' | 'pglite';
  /** Generate only specific sections */
  only?: ('tables' | 'foreign-keys' | 'indexes' | 'rls' | 'functions' | 'triggers')[];
  /** Include README documentation */
  readme?: boolean;
  /** Show what would be generated without writing */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Config file path */
  config?: string;
}

/**
 * SQL generator result
 */
export interface SQLGeneratorResult {
  /** Combined SQL (if mode=combined) */
  combined?: string;
  /** Separate files (if mode=separate) */
  files?: {
    tables: string;
    foreignKeys: string;
    indexes: string;
    rls: string;
    functions: string;
    triggers: string;
  };
  /** Summary counts for README */
  summary: {
    tables: number;
    foreignKeys: number;
    indexes: number;
    rlsPolicies: number;
    functions: number;
    triggers: number;
  };
}

/**
 * Helper function for type-safe config
 */
export function defineConfig(config: Partial<SchemockConfig>): SchemockConfig {
  return {
    schemas: './src/schemas/**/*.ts',
    output: './src/generated',
    adapter: 'mock',
    apiPrefix: '/api',
    ...config,
  };
}
