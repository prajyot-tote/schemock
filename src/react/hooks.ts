/**
 * React Hooks - Data fetching and mutation hooks
 *
 * Provides useData, useMutate, and useView hooks for
 * React Query integration with Schemock.
 *
 * @module react/hooks
 * @category React
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { EntitySchema, ViewSchema } from '../schema/types';
import type { AdapterContext, AdapterResponse } from '../adapters/types';
import { useDataLayerContext } from './context';
import { MiddlewareChain } from '../middleware/chain';
import type { MiddlewareContext } from '../middleware/types';

/**
 * Options for useData hook.
 */
export interface UseDataOptions<T> {
  /** Fetch single entity by ID */
  id?: string;
  /** Relations to include */
  include?: string[];
  /** Filter conditions */
  where?: Record<string, unknown>;
  /** Number of items to fetch */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Ordering */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Fields to select */
  select?: string[];
  /** Whether the query is enabled */
  enabled?: boolean;
  /** Stale time in ms */
  staleTime?: number;
  /** Placeholder data */
  placeholderData?: T | T[];
}

/**
 * useData hook for fetching entities.
 *
 * Fetches single or multiple entities based on options.
 *
 * @param entity - The entity schema to fetch
 * @param options - Query options
 * @returns React Query result
 *
 * @example
 * ```typescript
 * // Fetch single entity
 * const { data: user } = useData(userSchema, { id: '123' });
 *
 * // Fetch multiple entities
 * const { data: users } = useData(userSchema, {
 *   where: { role: 'admin' },
 *   limit: 10,
 *   orderBy: { createdAt: 'desc' },
 * });
 *
 * // Fetch with relations
 * const { data: user } = useData(userSchema, {
 *   id: '123',
 *   include: ['posts', 'comments'],
 * });
 * ```
 */
export function useData<T>(
  entity: EntitySchema<T>,
  options?: UseDataOptions<T>
): UseQueryResult<T | T[]> {
  const { adapter, middleware } = useDataLayerContext();
  const chain = new MiddlewareChain(middleware);

  const {
    id,
    include,
    where,
    limit,
    offset,
    orderBy,
    select,
    enabled = true,
    staleTime,
    placeholderData,
  } = options ?? {};

  // Build query key
  const queryKey = [
    entity.name,
    id ?? 'list',
    { where, limit, offset, orderBy, include, select },
  ];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const ctx: AdapterContext = {
        entity: entity.name,
        params: id ? { id } : undefined,
        filter: where,
        limit,
        offset,
        orderBy,
        select,
        include,
      };

      const middlewareCtx: MiddlewareContext = {
        ...ctx,
        operation: id ? 'findOne' : 'findMany',
        metadata: {},
      };

      const result = await chain.execute(middlewareCtx, () =>
        id
          ? adapter.findOne<T>(ctx)
          : adapter.findMany<T>(ctx) as unknown as Promise<AdapterResponse<T>>
      );

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    enabled,
    staleTime,
    // Cast needed for React Query v5's strict NonFunctionGuard type checking
    ...(placeholderData !== undefined && { placeholderData: placeholderData as never }),
  });
}

/**
 * Result from useMutate hook.
 */
export interface UseMutateResult<T> {
  /** Create mutation */
  create: UseMutationResult<T, Error, Partial<T>>;
  /** Update mutation */
  update: UseMutationResult<T, Error, { id: string; data: Partial<T> }>;
  /** Delete mutation */
  remove: UseMutationResult<void, Error, string>;
}

/**
 * Options for useMutate hook.
 */
export interface UseMutateOptions {
  /** Invalidate queries on success */
  invalidateOnSuccess?: boolean;
  /** Specific query keys to invalidate */
  invalidateQueries?: unknown[][];
  /** Optimistic update function */
  onOptimisticUpdate?: () => void;
}

/**
 * useMutate hook for CRUD mutations.
 *
 * Provides create, update, and delete mutations for an entity.
 *
 * @param entity - The entity schema
 * @param options - Mutation options
 * @returns Object with create, update, and remove mutations
 *
 * @example
 * ```typescript
 * const { create, update, remove } = useMutate(userSchema);
 *
 * // Create
 * const handleCreate = async () => {
 *   await create.mutateAsync({ name: 'John', email: 'john@example.com' });
 * };
 *
 * // Update
 * const handleUpdate = async (id: string) => {
 *   await update.mutateAsync({ id, data: { name: 'Jane' } });
 * };
 *
 * // Delete
 * const handleDelete = async (id: string) => {
 *   await remove.mutateAsync(id);
 * };
 * ```
 */
export function useMutate<T>(
  entity: EntitySchema<T>,
  options?: UseMutateOptions
): UseMutateResult<T> {
  const { adapter, middleware } = useDataLayerContext();
  const queryClient = useQueryClient();
  const chain = new MiddlewareChain(middleware);

  const { invalidateOnSuccess = true, invalidateQueries } = options ?? {};

  // Helper to invalidate queries
  const invalidate = () => {
    if (invalidateOnSuccess) {
      // Invalidate all queries for this entity
      queryClient.invalidateQueries({ queryKey: [entity.name] });
    }
    if (invalidateQueries) {
      for (const key of invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  };

  // Create mutation
  const create = useMutation<T, Error, Partial<T>>({
    mutationFn: async (data) => {
      const ctx: AdapterContext = {
        entity: entity.name,
        data,
      };

      const middlewareCtx: MiddlewareContext = {
        ...ctx,
        operation: 'create',
        metadata: {},
      };

      const result = await chain.execute(middlewareCtx, () =>
        adapter.create<T>(ctx)
      );

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    onSuccess: invalidate,
  });

  // Update mutation
  const update = useMutation<T, Error, { id: string; data: Partial<T> }>({
    mutationFn: async ({ id, data }) => {
      const ctx: AdapterContext = {
        entity: entity.name,
        params: { id },
        data,
      };

      const middlewareCtx: MiddlewareContext = {
        ...ctx,
        operation: 'update',
        metadata: {},
      };

      const result = await chain.execute(middlewareCtx, () =>
        adapter.update<T>(ctx)
      );

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    onSuccess: invalidate,
  });

  // Delete mutation
  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const ctx: AdapterContext = {
        entity: entity.name,
        params: { id },
      };

      const middlewareCtx: MiddlewareContext = {
        ...ctx,
        operation: 'delete',
        metadata: {},
      };

      const result = await chain.execute(middlewareCtx, () =>
        adapter.delete(ctx)
      );

      if (result.error) {
        throw result.error;
      }
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/**
 * Options for useView hook.
 */
export interface UseViewOptions<T> {
  /** URL parameters for the view */
  params?: Record<string, string>;
  /** Whether the query is enabled */
  enabled?: boolean;
  /** Stale time in ms */
  staleTime?: number;
  /** Placeholder data */
  placeholderData?: T;
}

/**
 * useView hook for fetching computed views.
 *
 * Fetches data from a view schema endpoint.
 *
 * @param view - The view schema
 * @param options - View options
 * @returns React Query result
 *
 * @example
 * ```typescript
 * const userFullView = defineView('user-full', ...);
 *
 * const { data } = useView(userFullView, { params: { id: '123' } });
 * ```
 */
export function useView<T>(
  view: ViewSchema,
  options?: UseViewOptions<T>
): UseQueryResult<T> {
  const { adapter, middleware } = useDataLayerContext();
  const chain = new MiddlewareChain(middleware);

  const { params, enabled = true, staleTime, placeholderData } = options ?? {};

  // Build query key
  const queryKey = ['view', view.name, params];

  return useQuery({
    queryKey,
    queryFn: async () => {
      // Build endpoint with params
      let endpoint = view.endpoint;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          endpoint = endpoint.replace(`:${key}`, value);
        }
      }

      const ctx: AdapterContext = {
        entity: view.name,
        endpoint,
        params,
      };

      const middlewareCtx: MiddlewareContext = {
        ...ctx,
        operation: 'view',
        metadata: {},
      };

      const result = await chain.execute(middlewareCtx, () =>
        adapter.findOne<T>(ctx)
      );

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    enabled,
    staleTime,
    // Cast needed for React Query v5's strict NonFunctionGuard type checking
    ...(placeholderData !== undefined && { placeholderData: placeholderData as never }),
  });
}

/**
 * Hook to prefetch data.
 *
 * @param entity - The entity schema
 * @param options - Data options
 *
 * @example
 * ```typescript
 * const prefetchUser = usePrefetch(userSchema);
 *
 * // Prefetch on hover
 * <div onMouseEnter={() => prefetchUser({ id: '123' })}>
 *   User Profile
 * </div>
 * ```
 */
export function usePrefetch<T>(entity: EntitySchema<T>) {
  const queryClient = useQueryClient();
  const { adapter } = useDataLayerContext();

  return (options?: UseDataOptions<T>) => {
    const { id, where, limit, offset, orderBy } = options ?? {};
    const queryKey = [entity.name, id ?? 'list', { where, limit, offset, orderBy }];

    return queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        const ctx: AdapterContext = {
          entity: entity.name,
          params: id ? { id } : undefined,
          filter: where,
          limit,
          offset,
          orderBy,
        };

        const result = id
          ? await adapter.findOne<T>(ctx)
          : await adapter.findMany<T>(ctx);

        if (result.error) {
          throw result.error;
        }

        return result.data;
      },
    });
  };
}
