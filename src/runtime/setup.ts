/**
 * Runtime Setup - Initialize mock runtime with MSW worker
 *
 * Provides setup functions for initializing the mock server
 * in both browser and Node.js environments.
 *
 * @module runtime/setup
 * @category Runtime
 */

import type { EntitySchema } from '../schema/types';
import type { Adapter } from '../adapters/types';

/**
 * Global runtime state.
 */
interface RuntimeState {
  /** Whether the runtime is initialized */
  initialized: boolean;
  /** The active adapter */
  adapter: Adapter | null;
  /** Registered entity schemas */
  schemas: EntitySchema[];
  /** MSW worker instance (browser) */
  worker: unknown | null;
  /** MSW server instance (Node.js) */
  server: unknown | null;
}

/**
 * Global runtime state singleton.
 */
const state: RuntimeState = {
  initialized: false,
  adapter: null,
  schemas: [],
  worker: null,
  server: null,
};

/**
 * Setup options for runtime initialization.
 */
export interface SetupOptions {
  /** The adapter to use */
  adapter: Adapter;
  /** Entity schemas */
  schemas: EntitySchema[];
  /** Whether to start MSW (browser only) */
  startMsw?: boolean;
  /** MSW handler options */
  mswOptions?: {
    /** Base URL for handlers */
    baseUrl?: string;
    /** Whether to log requests */
    quiet?: boolean;
  };
}

/**
 * Initialize the mock runtime.
 *
 * Sets up the adapter, registers schemas, and optionally starts
 * the MSW service worker for browser environments.
 *
 * @returns Promise that resolves when setup is complete
 *
 * @example
 * ```typescript
 * import { setup } from 'schemock/runtime';
 * import { createMockAdapter } from 'schemock/adapters';
 *
 * await setup({
 *   adapter: createMockAdapter([userSchema, postSchema]),
 *   schemas: [userSchema, postSchema],
 *   startMsw: true,
 * });
 * ```
 */
export async function setup(options?: SetupOptions): Promise<void> {
  if (state.initialized) {
    console.warn('Schemock runtime already initialized');
    return;
  }

  if (options) {
    state.adapter = options.adapter;
    state.schemas = options.schemas;
  }

  // In browser environment, optionally start MSW worker
  if (
    options?.startMsw &&
    typeof window !== 'undefined' &&
    options.schemas.length > 0
  ) {
    await startMswWorker(options);
  }

  state.initialized = true;
}

/**
 * Start the MSW service worker (browser only).
 *
 * @param options - Setup options
 */
async function startMswWorker(options: SetupOptions): Promise<void> {
  try {
    // Dynamic import to avoid bundling MSW in production
    const { setupWorker } = await import('msw/browser');
    const { createHandlers } = await import('./handlers');

    const handlers = createHandlers(
      options.schemas,
      state.adapter!,
      options.mswOptions
    );

    state.worker = setupWorker(...handlers);

    await (state.worker as { start: (options?: { quiet?: boolean }) => Promise<void> }).start({
      quiet: options.mswOptions?.quiet ?? true,
    });
  } catch (error) {
    console.warn('MSW setup failed:', error);
  }
}

/**
 * Teardown the runtime and clean up resources.
 *
 * @example
 * ```typescript
 * await teardown();
 * ```
 */
export async function teardown(): Promise<void> {
  if (state.worker) {
    await (state.worker as { stop: () => Promise<void> }).stop();
    state.worker = null;
  }

  if (state.server) {
    (state.server as { close: () => void }).close();
    state.server = null;
  }

  state.adapter = null;
  state.schemas = [];
  state.initialized = false;
}

/**
 * Get the current runtime state.
 *
 * @returns The current state
 */
export function getState(): Readonly<RuntimeState> {
  return state;
}

/**
 * Check if the runtime is initialized.
 *
 * @returns True if initialized
 */
export function isInitialized(): boolean {
  return state.initialized;
}

/**
 * Get the active adapter.
 *
 * @returns The adapter or null
 */
export function getAdapter(): Adapter | null {
  return state.adapter;
}

/**
 * Set the active adapter (for testing or manual configuration).
 *
 * @param adapter - The adapter to set
 */
export function setAdapter(adapter: Adapter): void {
  state.adapter = adapter;
}
