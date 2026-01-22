/**
 * Type stubs for @supabase/supabase-js
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual @supabase/supabase-js package.
 */

declare module '@supabase/supabase-js' {
  export interface PostgrestFilterBuilder<T> {
    select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }): PostgrestFilterBuilder<T>;
    insert(values: Partial<T> | Partial<T>[]): PostgrestFilterBuilder<T>;
    update(values: Partial<T>): PostgrestFilterBuilder<T>;
    upsert(values: Partial<T> | Partial<T>[], options?: { onConflict?: string }): PostgrestFilterBuilder<T>;
    delete(): PostgrestFilterBuilder<T>;
    eq(column: string, value: unknown): PostgrestFilterBuilder<T>;
    neq(column: string, value: unknown): PostgrestFilterBuilder<T>;
    gt(column: string, value: unknown): PostgrestFilterBuilder<T>;
    gte(column: string, value: unknown): PostgrestFilterBuilder<T>;
    lt(column: string, value: unknown): PostgrestFilterBuilder<T>;
    lte(column: string, value: unknown): PostgrestFilterBuilder<T>;
    like(column: string, pattern: string): PostgrestFilterBuilder<T>;
    ilike(column: string, pattern: string): PostgrestFilterBuilder<T>;
    is(column: string, value: unknown): PostgrestFilterBuilder<T>;
    in(column: string, values: unknown[]): PostgrestFilterBuilder<T>;
    not(column: string, operator: string, value: unknown): PostgrestFilterBuilder<T>;
    or(filters: string): PostgrestFilterBuilder<T>;
    contains(column: string, value: unknown): PostgrestFilterBuilder<T>;
    containedBy(column: string, value: unknown): PostgrestFilterBuilder<T>;
    overlaps(column: string, value: unknown): PostgrestFilterBuilder<T>;
    textSearch(column: string, query: string, options?: { type?: string; config?: string }): PostgrestFilterBuilder<T>;
    match(query: Record<string, unknown>): PostgrestFilterBuilder<T>;
    filter(column: string, operator: string, value: unknown): PostgrestFilterBuilder<T>;
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): PostgrestFilterBuilder<T>;
    limit(count: number): PostgrestFilterBuilder<T>;
    range(from: number, to: number): PostgrestFilterBuilder<T>;
    single(): PostgrestFilterBuilder<T>;
    maybeSingle(): PostgrestFilterBuilder<T>;
    returns<U>(): PostgrestFilterBuilder<U>;
    throwOnError(): PostgrestFilterBuilder<T>;
    then<TResult1 = PostgrestResponse<T>, TResult2 = never>(
      onfulfilled?: ((value: PostgrestResponse<T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2>;
  }

  export interface PostgrestResponse<T> {
    data: T | T[] | null;
    error: PostgrestError | null;
    count?: number | null;
    status: number;
    statusText: string;
  }

  export interface PostgrestError {
    message: string;
    details: string;
    hint: string;
    code: string;
  }

  export interface AuthUser {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }

  export interface AuthResponse {
    data: { user: AuthUser | null };
    error: { message: string } | null;
  }

  export interface SupabaseClient {
    from<T = unknown>(table: string): PostgrestFilterBuilder<T>;
    auth: {
      getUser(token?: string): Promise<AuthResponse>;
      signIn(credentials: { email: string; password: string }): Promise<AuthResponse>;
      signOut(): Promise<{ error: { message: string } | null }>;
    };
    rpc<T = unknown>(functionName: string, params?: Record<string, unknown>): PostgrestFilterBuilder<T>;
  }

  export interface SupabaseClientOptions {
    auth?: {
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      storage?: unknown;
    };
    global?: {
      headers?: Record<string, string>;
      fetch?: typeof fetch;
    };
    db?: {
      schema?: string;
    };
    realtime?: {
      params?: Record<string, unknown>;
    };
  }

  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions
  ): SupabaseClient;
}
