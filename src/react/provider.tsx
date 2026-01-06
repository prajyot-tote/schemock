/**
 * DataLayerProvider - React context provider for data layer
 *
 * Wraps your application to provide adapter and query client
 * to all data hooks.
 *
 * @module react/provider
 * @category React
 */

import React, { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Adapter } from '../adapters/types';
import type { Middleware } from '../middleware/types';
import type { EntitySchema } from '../schema/types';
import { DataLayerContext, type DataLayerContextValue } from './context';

/**
 * Props for the DataLayerProvider component.
 */
export interface DataLayerProviderProps {
  /** The adapter to use for data operations */
  adapter: Adapter;
  /** Entity schemas to register */
  schemas?: EntitySchema[];
  /** Middleware chain to apply */
  middleware?: Middleware[];
  /** Custom QueryClient (optional, will create one if not provided) */
  queryClient?: QueryClient;
  /** Default query options */
  defaultOptions?: {
    /** Default stale time in ms */
    staleTime?: number;
    /** Default cache time in ms */
    cacheTime?: number;
    /** Default retry count */
    retry?: number;
  };
  /** Child components */
  children: ReactNode;
}

/**
 * DataLayerProvider component.
 *
 * Provides the data layer context to all child components,
 * enabling the use of useData, useMutate, and useView hooks.
 *
 * @example
 * ```typescript
 * import { DataLayerProvider } from 'schemock/react';
 * import { createMockAdapter } from 'schemock/adapters';
 *
 * const adapter = createMockAdapter([userSchema, postSchema]);
 *
 * function App() {
 *   return (
 *     <DataLayerProvider adapter={adapter} schemas={[userSchema, postSchema]}>
 *       <MyApp />
 *     </DataLayerProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With custom query client and middleware
 * const queryClient = new QueryClient({
 *   defaultOptions: { queries: { staleTime: 5000 } },
 * });
 *
 * function App() {
 *   return (
 *     <DataLayerProvider
 *       adapter={adapter}
 *       schemas={schemas}
 *       queryClient={queryClient}
 *       middleware={[authMiddleware, loggerMiddleware]}
 *     >
 *       <MyApp />
 *     </DataLayerProvider>
 *   );
 * }
 * ```
 */
export const DataLayerProvider: React.FC<DataLayerProviderProps> = ({
  adapter,
  schemas = [],
  middleware = [],
  queryClient: providedQueryClient,
  defaultOptions,
  children,
}) => {
  // Create or use provided QueryClient
  const queryClient = useMemo(() => {
    if (providedQueryClient) {
      return providedQueryClient;
    }

    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: defaultOptions?.staleTime ?? 0,
          gcTime: defaultOptions?.cacheTime ?? 5 * 60 * 1000,
          retry: defaultOptions?.retry ?? 3,
          refetchOnWindowFocus: false,
        },
        mutations: {
          retry: defaultOptions?.retry ?? 0,
        },
      },
    });
  }, [providedQueryClient, defaultOptions]);

  // Create schema registry
  const schemaMap = useMemo(() => {
    const map = new Map<string, EntitySchema>();
    for (const schema of schemas) {
      map.set(schema.name, schema);
    }
    return map;
  }, [schemas]);

  // Create context value
  const contextValue: DataLayerContextValue = useMemo(
    () => ({
      adapter,
      queryClient,
      schemas: schemaMap,
      middleware,
      getSchema: (name: string) => schemaMap.get(name),
    }),
    [adapter, queryClient, schemaMap, middleware]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DataLayerContext.Provider value={contextValue}>
        {children}
      </DataLayerContext.Provider>
    </QueryClientProvider>
  );
};
