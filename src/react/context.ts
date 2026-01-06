/**
 * DataLayer Context - React context for data layer configuration
 *
 * Provides adapter and query client access throughout the React tree.
 *
 * @module react/context
 * @category React
 */

import { createContext, useContext } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Adapter } from '../adapters/types';
import type { Middleware } from '../middleware/types';
import type { EntitySchema } from '../schema/types';

/**
 * Value provided by the DataLayer context.
 */
export interface DataLayerContextValue {
  /** The adapter to use for data operations */
  adapter: Adapter;
  /** React Query client instance */
  queryClient: QueryClient;
  /** Registered entity schemas */
  schemas: Map<string, EntitySchema>;
  /** Middleware chain */
  middleware: Middleware[];
  /** Get schema by entity name */
  getSchema: (name: string) => EntitySchema | undefined;
}

/**
 * React context for the data layer.
 *
 * Holds the adapter, query client, and schema registry.
 */
export const DataLayerContext = createContext<DataLayerContextValue | null>(null);

/**
 * Hook to access the DataLayer context.
 *
 * @returns The DataLayer context value
 * @throws Error if used outside of DataLayerProvider
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { adapter, queryClient } = useDataLayerContext();
 *
 *   const handleRefresh = () => {
 *     queryClient.invalidateQueries();
 *   };
 *
 *   return <button onClick={handleRefresh}>Refresh</button>;
 * }
 * ```
 */
export function useDataLayerContext(): DataLayerContextValue {
  const context = useContext(DataLayerContext);

  if (!context) {
    throw new Error(
      'useDataLayerContext must be used within a DataLayerProvider. ' +
      'Wrap your app with <DataLayerProvider adapter={adapter}>...</DataLayerProvider>'
    );
  }

  return context;
}

/**
 * Hook to get the current adapter.
 *
 * @returns The adapter instance
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const adapter = useAdapter();
 *   // Use adapter directly for custom operations
 * }
 * ```
 */
export function useAdapter(): Adapter {
  return useDataLayerContext().adapter;
}

/**
 * Hook to get the query client.
 *
 * @returns The QueryClient instance
 */
export function useQueryClientFromContext(): QueryClient {
  return useDataLayerContext().queryClient;
}
