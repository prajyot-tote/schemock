/**
 * Type stubs for schemock package
 *
 * These stubs provide enough type information to validate generated code
 * that imports from schemock/* paths.
 */

declare module 'schemock/schema' {
  export interface FieldDefinition {
    type: string;
    nullable?: boolean;
    unique?: boolean;
    readOnly?: boolean;
    default?: unknown;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  }

  export interface Field {
    uuid(): FieldDefinition;
    string(): FieldDefinition;
    email(): FieldDefinition;
    url(): FieldDefinition;
    number(): FieldDefinition;
    integer(): FieldDefinition;
    float(): FieldDefinition;
    boolean(): FieldDefinition;
    date(): FieldDefinition;
    json(): FieldDefinition;
    array(itemType: FieldDefinition): FieldDefinition;
    object(shape: Record<string, FieldDefinition>): FieldDefinition;
    enum<T extends string>(values: T[]): FieldDefinition;
    ref(target: string): FieldDefinition;
  }

  export const field: Field;

  export interface RelationOptions {
    foreignKey?: string;
    through?: string;
    otherKey?: string;
    eager?: boolean;
  }

  export function hasOne(target: string, options?: RelationOptions): unknown;
  export function hasMany(target: string, options?: RelationOptions): unknown;
  export function belongsTo(target: string, options?: RelationOptions): unknown;

  export interface EntitySchemaOptions {
    tableName?: string;
    rls?: unknown;
    indexes?: unknown[];
    tags?: string[];
    module?: string;
    group?: string;
  }

  export interface EntitySchema {
    name: string;
    fields: Record<string, unknown>;
    relations?: Record<string, unknown>;
    options?: EntitySchemaOptions;
  }

  export function defineData(
    name: string,
    fields: Record<string, unknown>,
    options?: EntitySchemaOptions
  ): EntitySchema;

  export interface MiddlewareContext {
    headers: Record<string, string>;
    context: Record<string, unknown>;
  }

  export interface MiddlewareHandler {
    (ctx: { ctx: MiddlewareContext; config: unknown; next: () => Promise<unknown> }): Promise<unknown>;
  }

  export interface MiddlewareDefinition {
    name: string;
    config?: Record<string, FieldDefinition>;
    handler: MiddlewareHandler;
  }

  export function defineMiddleware(
    name: string,
    definition: {
      config?: Record<string, FieldDefinition>;
      handler: MiddlewareHandler;
    }
  ): MiddlewareDefinition;

  export class MiddlewareError extends Error {
    constructor(message: string, status?: number);
    status: number;
  }
}

declare module 'schemock/middleware' {
  export interface Middleware<TContext = unknown, TConfig = unknown> {
    (ctx: TContext, config?: TConfig): TContext | Promise<TContext>;
  }

  export interface MiddlewareChain {
    use<TConfig>(middleware: Middleware<unknown, TConfig>, config?: TConfig): MiddlewareChain;
    execute(initialContext: unknown): Promise<unknown>;
  }

  export function createMiddlewareChain(): MiddlewareChain;

  export function createAuthMiddleware(config?: {
    required?: boolean;
    secretEnvVar?: string;
  }): Middleware;

  export function createCacheMiddleware(config?: {
    ttl?: number;
    operations?: string[];
  }): Middleware;

  export function createRetryMiddleware(config?: {
    maxRetries?: number;
    delay?: number;
  }): Middleware;

  export function createLoggerMiddleware(config?: {
    level?: string;
  }): Middleware;
}

declare module 'schemock/adapters' {
  export interface AdapterConfig {
    baseUrl?: string;
  }

  export interface ApiClient<TSchemas = unknown> {
    [key: string]: {
      list(options?: { limit?: number; offset?: number }): Promise<{ data: unknown[]; meta?: unknown }>;
      get(id: string): Promise<unknown>;
      create(data: unknown): Promise<unknown>;
      update(id: string, data: unknown): Promise<unknown>;
      delete(id: string): Promise<void>;
    };
  }

  export function createMockAdapter<TSchemas>(schemas: TSchemas, config?: AdapterConfig): ApiClient<TSchemas>;
  export function createSupabaseAdapter<TSchemas>(schemas: TSchemas, config?: AdapterConfig): ApiClient<TSchemas>;
  export function createFirebaseAdapter<TSchemas>(schemas: TSchemas, config?: AdapterConfig): ApiClient<TSchemas>;
  export function createFetchAdapter<TSchemas>(schemas: TSchemas, config?: AdapterConfig): ApiClient<TSchemas>;
}

declare module 'schemock/react' {
  import type { FC, PropsWithChildren } from 'react';

  export interface SchemockProviderProps extends PropsWithChildren {
    client: unknown;
  }

  export const SchemockProvider: FC<SchemockProviderProps>;
  export function useSchemockClient(): unknown;
}
