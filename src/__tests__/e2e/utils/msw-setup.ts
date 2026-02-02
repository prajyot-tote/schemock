/**
 * MSW Setup Utilities for E2E Tests
 *
 * Provides helpers for setting up MSW server in Node.js tests.
 */

import { setupServer, SetupServerApi } from 'msw/node';
import type { RequestHandler } from 'msw';

/**
 * MSW server instance type
 */
export type MockServer = SetupServerApi;

/**
 * Create and configure MSW server with given handlers
 *
 * @param handlers - Array of MSW request handlers
 * @returns Configured MSW server
 */
export function createMockServer(handlers: RequestHandler[]): MockServer {
  return setupServer(...handlers);
}

/**
 * Start MSW server for testing
 *
 * @param server - MSW server instance
 */
export function startServer(server: MockServer): void {
  server.listen({
    onUnhandledRequest: 'warn',
  });
}

/**
 * Stop MSW server
 *
 * @param server - MSW server instance
 */
export function stopServer(server: MockServer): void {
  server.close();
}

/**
 * Reset MSW server handlers
 *
 * @param server - MSW server instance
 */
export function resetServer(server: MockServer): void {
  server.resetHandlers();
}

/**
 * Add handlers to running server
 *
 * @param server - MSW server instance
 * @param handlers - Additional handlers to add
 */
export function addHandlers(server: MockServer, handlers: RequestHandler[]): void {
  server.use(...handlers);
}

/**
 * Make a fetch request to the mock server
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Fetch response
 */
export async function mockFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, options);
}

/**
 * Make a JSON request to the mock server
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Parsed JSON response
 */
export async function mockJsonRequest<T>(
  url: string,
  options?: RequestInit
): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json() as T;
  return { status: response.status, data };
}

/**
 * Helper to create POST request options with JSON body
 */
export function postJson<T>(body: T, headers?: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Helper to create PUT request options with JSON body
 */
export function putJson<T>(body: T, headers?: Record<string, string>): RequestInit {
  return {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Helper to create PATCH request options with JSON body
 */
export function patchJson<T>(body: T, headers?: Record<string, string>): RequestInit {
  return {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Helper to create DELETE request options
 */
export function deleteRequest(headers?: Record<string, string>): RequestInit {
  return {
    method: 'DELETE',
    headers,
  };
}
