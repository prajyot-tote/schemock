/**
 * E2E Test Utilities
 *
 * Shared utilities for runtime E2E tests.
 */

import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Create a temporary directory for test output
 */
export async function createTempDir(prefix: string = 'schemock-e2e-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write a file to a directory, creating parent directories as needed
 */
export async function writeTestFile(
  dir: string,
  filename: string,
  content: string
): Promise<string> {
  const filepath = join(dir, filename);
  const parentDir = dirname(filepath);
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true });
  }
  await writeFile(filepath, content, 'utf-8');
  return filepath;
}

/**
 * Create a mock JWT token for testing
 *
 * @param payload - JWT payload with user info
 * @returns Encoded JWT (unsigned, for mock testing only)
 */
export function createMockJwt(payload: {
  sub?: string;
  userId?: string;
  role?: string;
  tenantId?: string;
  orgId?: string;
  [key: string]: unknown;
}): string {
  // Create a minimal JWT structure (header.payload.signature)
  // For testing, we don't need real signatures
  const header = { alg: 'HS256', typ: 'JWT' };

  // Encode to base64url
  const encodeBase64Url = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    // Use Buffer if available (Node.js), otherwise btoa (browser)
    const base64 =
      typeof Buffer !== 'undefined'
        ? Buffer.from(json).toString('base64')
        : btoa(json);
    // Convert to base64url
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerEncoded = encodeBase64Url(header);
  const payloadEncoded = encodeBase64Url(payload);
  // Fake signature (not validated in mock environment)
  const signature = 'mock-signature';

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Create authorization headers with JWT
 */
export function createAuthHeaders(jwt: string): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('waitFor timeout');
}

/**
 * UUID v4 generator for testing
 */
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deep equality check for objects
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
      return false;
  }

  return true;
}
