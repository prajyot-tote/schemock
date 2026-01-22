/**
 * Type stubs for @tanstack/react-query v5
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual @tanstack/react-query package.
 */

declare module '@tanstack/react-query' {
  // QueryKey can be a tuple or array
  export type QueryKey = readonly unknown[];

  // Query function context for v5
  export interface QueryFunctionContext<TQueryKey extends QueryKey = QueryKey> {
    queryKey: TQueryKey;
    signal: AbortSignal;
    meta?: Record<string, unknown>;
  }

  export interface UseQueryOptions<
    TQueryFnData = unknown,
    TError = Error,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey
  > {
    queryKey: TQueryKey;
    queryFn?: (context: QueryFunctionContext<TQueryKey>) => Promise<TQueryFnData>;
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
    cacheTime?: number;  // deprecated but may be used
    refetchOnWindowFocus?: boolean | 'always';
    refetchOnMount?: boolean | 'always';
    refetchOnReconnect?: boolean | 'always';
    retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
    retryDelay?: number | ((attempt: number, error: TError) => number);
    select?: (data: TQueryFnData) => TData;
    initialData?: TData | (() => TData);
    initialDataUpdatedAt?: number | (() => number | undefined);
    placeholderData?: TData | (() => TData);
    networkMode?: 'online' | 'always' | 'offlineFirst';
    notifyOnChangeProps?: Array<string> | 'all';
    refetchInterval?: number | false | ((data: TData | undefined, query: unknown) => number | false);
    meta?: Record<string, unknown>;
    throwOnError?: boolean | ((error: TError, query: unknown) => boolean);
  }

  // Alias for backward compatibility
  export type QueryOptions<TQueryFnData = unknown, TError = Error, TData = TQueryFnData> =
    UseQueryOptions<TQueryFnData, TError, TData>;

  export interface UseQueryResult<TData = unknown, TError = Error> {
    data: TData | undefined;
    dataUpdatedAt: number;
    error: TError | null;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: TError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    isSuccess: boolean;
    isPending: boolean;
    isStale: boolean;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isRefetching: boolean;
    isPaused: boolean;
    isPlaceholderData: boolean;
    isRefetchError: boolean;
    isLoadingError: boolean;
    status: 'pending' | 'error' | 'success';
    fetchStatus: 'fetching' | 'paused' | 'idle';
    refetch: (options?: { throwOnError?: boolean }) => Promise<UseQueryResult<TData, TError>>;
  }

  // Alias for backward compatibility
  export type QueryResult<TData = unknown, TError = Error> = UseQueryResult<TData, TError>;

  export interface UseMutationOptions<
    TData = unknown,
    TError = Error,
    TVariables = void,
    TContext = unknown
  > {
    mutationKey?: readonly unknown[];
    mutationFn: (variables: TVariables) => Promise<TData>;
    onMutate?: (variables: TVariables) => TContext | Promise<TContext | undefined>;
    onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
    onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
    onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
    retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
    retryDelay?: number | ((attempt: number, error: TError) => number);
    networkMode?: 'online' | 'always' | 'offlineFirst';
    gcTime?: number;
    meta?: Record<string, unknown>;
    throwOnError?: boolean | ((error: TError) => boolean);
  }

  // Alias for backward compatibility
  export type MutationOptions<TData = unknown, TError = Error, TVariables = void, TContext = unknown> =
    UseMutationOptions<TData, TError, TVariables, TContext>;

  export interface UseMutationResult<TData = unknown, TError = Error, TVariables = void, TContext = unknown> {
    data: TData | undefined;
    error: TError | null;
    failureCount: number;
    failureReason: TError | null;
    isLoading: boolean;
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    isIdle: boolean;
    isPaused: boolean;
    status: 'idle' | 'pending' | 'error' | 'success';
    variables: TVariables | undefined;
    context: TContext | undefined;
    mutate: (variables: TVariables, options?: {
      onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
      onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
      onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined) => void;
    }) => void;
    mutateAsync: (variables: TVariables, options?: {
      onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
      onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
      onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined) => void;
    }) => Promise<TData>;
    reset: () => void;
  }

  // Alias for backward compatibility
  export type MutationResult<TData = unknown, TError = Error, TVariables = void> =
    UseMutationResult<TData, TError, TVariables>;

  export interface QueryClientConfig {
    defaultOptions?: {
      queries?: Partial<UseQueryOptions>;
      mutations?: Partial<UseMutationOptions>;
    };
    queryCache?: unknown;
    mutationCache?: unknown;
  }

  export class QueryClient {
    constructor(config?: QueryClientConfig);
    invalidateQueries(filters?: { queryKey?: QueryKey; exact?: boolean; refetchType?: 'active' | 'inactive' | 'all' | 'none' }): Promise<void>;
    refetchQueries(filters?: { queryKey?: QueryKey; exact?: boolean; type?: 'active' | 'inactive' | 'all' }): Promise<void>;
    setQueryData<T>(queryKey: QueryKey, updater: T | ((prev: T | undefined) => T | undefined)): T | undefined;
    getQueryData<T>(queryKey: QueryKey): T | undefined;
    getQueryState<T>(queryKey: QueryKey): unknown;
    prefetchQuery<T>(options: UseQueryOptions<T>): Promise<void>;
    cancelQueries(filters?: { queryKey?: QueryKey }): Promise<void>;
    removeQueries(filters?: { queryKey?: QueryKey }): void;
    resetQueries(filters?: { queryKey?: QueryKey }): Promise<void>;
    isFetching(filters?: { queryKey?: QueryKey }): number;
    isMutating(filters?: { mutationKey?: readonly unknown[] }): number;
    getDefaultOptions(): QueryClientConfig['defaultOptions'];
    setDefaultOptions(options: QueryClientConfig['defaultOptions']): void;
    getQueryDefaults(queryKey: QueryKey): UseQueryOptions | undefined;
    setQueryDefaults(queryKey: QueryKey, options: Partial<UseQueryOptions>): void;
    getMutationDefaults(mutationKey: readonly unknown[]): UseMutationOptions | undefined;
    setMutationDefaults(mutationKey: readonly unknown[], options: Partial<UseMutationOptions>): void;
    clear(): void;
  }

  export interface QueryClientProviderProps {
    client: QueryClient;
    children?: unknown;
  }

  export function QueryClientProvider(props: QueryClientProviderProps): unknown;
  export function useQueryClient(): QueryClient;

  export function useQuery<
    TQueryFnData = unknown,
    TError = Error,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
  ): UseQueryResult<TData, TError>;

  export function useMutation<
    TData = unknown,
    TError = Error,
    TVariables = void,
    TContext = unknown
  >(
    options: UseMutationOptions<TData, TError, TVariables, TContext>
  ): UseMutationResult<TData, TError, TVariables, TContext>;

  export function useSuspenseQuery<
    TQueryFnData = unknown,
    TError = Error,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
  ): Omit<UseQueryResult<TData, TError>, 'data'> & { data: TData };

  export function useInfiniteQuery<TQueryFnData = unknown, TError = Error>(
    options: UseQueryOptions<TQueryFnData, TError> & {
      getNextPageParam?: (lastPage: TQueryFnData, allPages: TQueryFnData[]) => unknown;
      getPreviousPageParam?: (firstPage: TQueryFnData, allPages: TQueryFnData[]) => unknown;
      initialPageParam?: unknown;
    }
  ): UseQueryResult<{ pages: TQueryFnData[]; pageParams: unknown[] }, TError> & {
    fetchNextPage: () => Promise<unknown>;
    fetchPreviousPage: () => Promise<unknown>;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    isFetchingNextPage: boolean;
    isFetchingPreviousPage: boolean;
  };

  export function useIsFetching(filters?: { queryKey?: QueryKey }): number;
  export function useIsMutating(filters?: { mutationKey?: readonly unknown[] }): number;
}
