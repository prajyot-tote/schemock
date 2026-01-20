/**
 * Type stub for @electric-sql/pglite
 * Used by integration tests to validate generated PGlite code compiles
 */
declare module '@electric-sql/pglite' {
  export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    affectedRows?: number;
  }

  export interface PGliteOptions {
    dataDir?: string;
    debug?: number;
  }

  export class PGlite {
    constructor(dataDir?: string, options?: PGliteOptions);
    static create(dataDir?: string, options?: PGliteOptions): Promise<PGlite>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    exec(sql: string): Promise<void>;
    close(): Promise<void>;
  }
}
