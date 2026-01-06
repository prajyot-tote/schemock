/**
 * Schemock React - React hooks and components for data fetching
 *
 * @module react
 * @category React
 */

// Re-export context
export {
  DataLayerContext,
  useDataLayerContext,
  useAdapter,
  useQueryClientFromContext,
} from './context';
export type { DataLayerContextValue } from './context';

// Re-export provider
export { DataLayerProvider } from './provider';
export type { DataLayerProviderProps } from './provider';

// Re-export hooks
export {
  useData,
  useMutate,
  useView,
  usePrefetch,
} from './hooks';
export type {
  UseDataOptions,
  UseMutateResult,
  UseMutateOptions,
  UseViewOptions,
} from './hooks';
