/**
 * Schemock - Schema-first mocking for frontend developers
 *
 * Define once. Mock instantly. Ship faster.
 *
 * @packageDocumentation
 */

// Schema DSL
export * from './schema';

// Storage drivers
export * from './storage';

// Adapters (exclude conflicting exports)
export {
  // Types
  type Adapter,
  type AdapterContext,
  type AdapterResponse,
  type AdapterResponseMeta,
  type MockAdapterOptions,
  type FetchAdapterOptions,
  type MswjsDataFactory,
  type MockAdapterConfig,
  type StorageDriverConfig,
  type QueryOptions,
  type QueryMeta,
  // MockAdapter
  MockAdapter,
  createMockAdapter,
  DataGenerator,
  dataGenerator,
  generateFactory,
  generateFactories,
  MswStorageDriver,
  MemoryStorageDriver,
  // FetchAdapter
  FetchAdapter,
  createFetchAdapter,
  // SupabaseAdapter
  SupabaseAdapter,
  createSupabaseAdapter,
  // FirebaseAdapter
  FirebaseAdapter,
  createFirebaseAdapter,
  // GraphQLAdapter
  GraphQLAdapter,
  createGraphQLAdapter,
} from './adapters';

// Middleware (exclude conflicting RLSFilter from schema)
export {
  // Types
  type Middleware,
  type MiddlewareFunction,
  type MiddlewareContext,
  type MiddlewareResult,
  type AuthMiddlewareConfig,
  type RetryMiddlewareConfig,
  type CacheMiddlewareConfig,
  type CacheStorage,
  type CacheEntry,
  type LoggerMiddlewareConfig,
  type LogLevel,
  type ContextMiddlewareConfig,
  type RLSMiddlewareConfig,
  type RLSFilters,
  // Classes and functions
  MiddlewareChain,
  createMiddlewareChain,
  createAuthMiddleware,
  createRetryMiddleware,
  createCacheMiddleware,
  createCacheInvalidator,
  MemoryCacheStorage,
  createLoggerMiddleware,
  createSilentLogger,
  createVerboseLogger,
  createContextMiddleware,
  createMockJwt,
  createRLSMiddleware,
  createBypassCheck,
  RLSError,
  // Defaults
  DEFAULT_MIDDLEWARE_ORDER,
  orderMiddleware,
  filterMiddleware,
  MOCK_MIDDLEWARE_PRESET,
  PRODUCTION_MIDDLEWARE_PRESET,
  TEST_MIDDLEWARE_PRESET,
} from './middleware';

// Runtime (exclude conflicting Database and SchemaRegistry)
export {
  // Setup
  setup,
  teardown,
  isInitialized,
  getAdapter,
  setAdapter,
  type SetupOptions,
  // Seeding
  seed,
  reset,
  seedWithRelations,
  // Handlers
  createHandlers,
  type HandlerOptions,
  // Resolver
  Resolver,
  createResolver,
  ViewResolver,
  createViewResolver,
  type EntityQueryOptions,
  type ListQueryOptions,
  type CountOptions,
  type CreateInput,
  type UpdateInput,
  type ViewResolveOptions,
  // Computed
  topologicalSort,
  resolveComputedFields,
  resolveComputedFieldsSync,
  resolveComputedField,
  clearComputeCache,
  type ResolverContext,
  // Relations
  resolveRelations,
  resolveRelation,
  eagerLoadRelations,
  type ResolveRelationOptions,
} from './runtime';
