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
  /** Enable localStorage persistence (default: true) */
  persist?: boolean;
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

/**
 * Pluralization configuration
 */
export interface PluralizeConfig {
  /** Custom pluralization overrides */
  custom?: Record<string, string>;
}

/**
 * Main Schemock configuration
 */
export interface SchemockConfig {
  /** Schema discovery glob pattern */
  schemas: string;
  /** Output directory */
  output: string;
  /** Default adapter type */
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
  target: string;
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

  // Database indexes
  indexes: AnalyzedIndex[];

  // RPC/Stored procedures
  rpc: AnalyzedRPC[];

  // Original schema reference
  original: EntitySchema;
}

// ============================================================================
// Generate Command Types
// ============================================================================

/**
 * Options for the generate command
 */
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
