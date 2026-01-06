/**
 * Data Layer Configuration - Global adapter and middleware setup
 *
 * Provides central configuration for the Schemock data layer,
 * including adapter selection and middleware chain.
 *
 * @module config
 * @category Configuration
 */

import type { Adapter } from './adapters/types';
import type { Middleware } from './middleware/types';

/**
 * Configuration options for the data layer.
 */
export interface DataLayerConfig {
  /** The primary adapter to use for all operations */
  adapter: Adapter;
  /** Named adapters for multi-backend scenarios */
  adapters?: Record<string, Adapter>;
  /** Middleware chain to apply to all operations */
  middleware?: Middleware[];
  /** Default options */
  defaults?: {
    /** Default pagination limit */
    limit?: number;
    /** Default request timeout in ms */
    timeout?: number;
  };
}

/**
 * Global data layer state.
 */
interface DataLayerState {
  /** Whether configured */
  configured: boolean;
  /** Primary adapter */
  adapter: Adapter | null;
  /** Named adapters */
  adapters: Map<string, Adapter>;
  /** Middleware chain */
  middleware: Middleware[];
  /** Default options */
  defaults: {
    limit: number;
    timeout: number;
  };
}

/**
 * Global state singleton.
 */
const state: DataLayerState = {
  configured: false,
  adapter: null,
  adapters: new Map(),
  middleware: [],
  defaults: {
    limit: 20,
    timeout: 30000,
  },
};

/**
 * Configure the global data layer.
 *
 * Sets up the adapter(s) and middleware chain for all Schemock operations.
 * This should be called once at application startup.
 *
 * @param config - Configuration options
 *
 * @example
 * ```typescript
 * import { configureDataLayer } from 'schemock';
 * import { createMockAdapter, createFetchAdapter } from 'schemock/adapters';
 * import { createAuthMiddleware, createCacheMiddleware } from 'schemock/middleware';
 *
 * // Basic setup with MockAdapter
 * configureDataLayer({
 *   adapter: createMockAdapter(schemas),
 * });
 *
 * // Production setup with middleware
 * configureDataLayer({
 *   adapter: createFetchAdapter({ baseUrl: '/api' }),
 *   middleware: [
 *     createAuthMiddleware({ getToken: () => localStorage.getItem('token') }),
 *     createCacheMiddleware({ ttl: 60000 }),
 *   ],
 * });
 *
 * // Multi-backend setup
 * configureDataLayer({
 *   adapter: createFetchAdapter({ baseUrl: '/api' }),
 *   adapters: {
 *     mock: createMockAdapter(schemas),
 *     analytics: createFetchAdapter({ baseUrl: '/analytics-api' }),
 *   },
 * });
 * ```
 */
export function configureDataLayer(config: DataLayerConfig): void {
  // Set primary adapter
  state.adapter = config.adapter;

  // Set named adapters
  state.adapters.clear();
  if (config.adapters) {
    for (const [name, adapter] of Object.entries(config.adapters)) {
      state.adapters.set(name, adapter);
    }
  }

  // Set middleware chain
  state.middleware = config.middleware ?? [];

  // Set defaults
  if (config.defaults) {
    state.defaults = {
      ...state.defaults,
      ...config.defaults,
    };
  }

  state.configured = true;
}

/**
 * Get the primary adapter.
 *
 * @returns The configured adapter
 * @throws If not configured
 *
 * @example
 * ```typescript
 * const adapter = getAdapter();
 * const users = await adapter.findMany({ entity: 'user' });
 * ```
 */
export function getDataLayerAdapter(): Adapter {
  if (!state.adapter) {
    throw new Error(
      'Data layer not configured. Call configureDataLayer() first.'
    );
  }
  return state.adapter;
}

/**
 * Get a named adapter.
 *
 * @param name - The adapter name
 * @returns The adapter or undefined
 *
 * @example
 * ```typescript
 * const analyticsAdapter = getNamedAdapter('analytics');
 * ```
 */
export function getNamedAdapter(name: string): Adapter | undefined {
  return state.adapters.get(name);
}

/**
 * Get the middleware chain.
 *
 * @returns Array of middleware
 */
export function getMiddleware(): Middleware[] {
  return [...state.middleware];
}

/**
 * Get default configuration values.
 *
 * @returns Default options
 */
export function getDefaults(): Readonly<typeof state.defaults> {
  return state.defaults;
}

/**
 * Check if the data layer is configured.
 *
 * @returns True if configured
 */
export function isConfigured(): boolean {
  return state.configured;
}

/**
 * Reset configuration (mainly for testing).
 */
export function resetConfig(): void {
  state.configured = false;
  state.adapter = null;
  state.adapters.clear();
  state.middleware = [];
  state.defaults = {
    limit: 20,
    timeout: 30000,
  };
}

/**
 * Add middleware to the chain.
 *
 * @param middleware - Middleware to add
 *
 * @example
 * ```typescript
 * addMiddleware(createLoggerMiddleware());
 * ```
 */
export function addMiddleware(middleware: Middleware): void {
  state.middleware.push(middleware);
}

/**
 * Remove middleware from the chain.
 *
 * @param name - Name of middleware to remove
 */
export function removeMiddleware(name: string): void {
  state.middleware = state.middleware.filter((m) => m.name !== name);
}
