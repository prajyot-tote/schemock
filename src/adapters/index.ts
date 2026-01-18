/**
 * Schemock Adapters - Pluggable backend implementations
 *
 * @module adapters
 * @category Adapters
 */

// Re-export types
export type {
  Adapter,
  AdapterContext,
  AdapterResponse,
  AdapterResponseMeta,
  MockAdapterOptions,
  FetchAdapterOptions,
  Database,
  MswjsDataFactory,
  SchemaRegistry,
} from './types';

// Re-export MockAdapter and all storage drivers (in-memory and persistent)
export {
  MockAdapter,
  createMockAdapter,
  DataGenerator,
  dataGenerator,
  generateFactory,
  generateFactories,
  MswStorageDriver,
  MemoryStorageDriver,
  LocalStorageDriver,
} from './mock';
export type {
  MockAdapterConfig,
  StorageDriver,
  StorageDriverConfig,
  QueryOptions,
  QueryMeta,
  LocalStorageDriverConfig,
} from './mock';

// Re-export FetchAdapter
export { FetchAdapter, createFetchAdapter } from './fetch';

// Re-export SupabaseAdapter
export {
  SupabaseAdapter,
  createSupabaseAdapter,
} from './supabase';
export type { SupabaseClient, SupabaseAdapterOptions } from './supabase';

// Re-export FirebaseAdapter
export {
  FirebaseAdapter,
  createFirebaseAdapter,
} from './firebase';
export type { Firestore, FirebaseAdapterOptions } from './firebase';

// Re-export GraphQLAdapter
export {
  GraphQLAdapter,
  createGraphQLAdapter,
} from './graphql';
export type { ApolloClient, GraphQLAdapterOptions } from './graphql';
