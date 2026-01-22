/**
 * Type stubs for @neondatabase/serverless
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual @neondatabase/serverless package.
 */

declare module '@neondatabase/serverless' {
  // Row type that allows accessing any property
  export interface NeonRow {
    [key: string]: unknown;
    // PostgreSQL COUNT returns bigint as string
    total?: string;
  }

  export interface NeonQueryFunction {
    // Tagged template literal - returns array of rows with known properties
    <T = NeonRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
    // String query
    <T = NeonRow>(query: string, params?: unknown[]): Promise<T[]>;
  }

  export interface NeonConfig {
    fetchConnectionCache?: boolean;
    webSocketConstructor?: unknown;
    pipelineConnect?: boolean | 'password';
    coalesceWrites?: boolean;
    fetchEndpoint?: (host: string, port: number | string, options: unknown) => string;
    wsProxy?: string | ((host: string, port: number | string) => string);
  }

  export const neonConfig: NeonConfig;

  export function neon(connectionString: string, options?: {
    fullResults?: boolean;
    fetchOptions?: RequestInit;
  }): NeonQueryFunction;

  export interface PoolClient {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    release(): void;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }

  export class Client {
    constructor(connectionString: string);
    connect(): Promise<void>;
    query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
