/**
 * Test utilities for integration tests
 */
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SchemockConfig, AnalyzedSchema } from '../../../cli/types';
import type { EntitySchema } from '../../../schema/types';
import { analyzeSchemas } from '../../../cli/analyze';

/**
 * Create a temporary directory for test output
 */
export async function createTempDir(prefix: string = 'schemock-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Write generated code to a file in temp directory
 */
export async function writeGeneratedFile(
  dir: string,
  filename: string,
  content: string
): Promise<string> {
  const filePath = join(dir, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Create a subdirectory in temp directory
 */
export async function createSubDir(dir: string, subdir: string): Promise<string> {
  const path = join(dir, subdir);
  await mkdir(path, { recursive: true });
  return path;
}

/**
 * Default test config
 */
export function createTestConfig(overrides?: Partial<SchemockConfig>): SchemockConfig {
  return {
    schemas: './schemas/**/*.ts',
    output: './generated',
    adapter: 'mock',
    apiPrefix: '/api',
    ...overrides,
  };
}

/**
 * Analyze schemas with test config
 */
export function analyzeTestSchemas(
  schemas: EntitySchema[],
  configOverrides?: Partial<SchemockConfig>
): AnalyzedSchema[] {
  return analyzeSchemas(schemas, createTestConfig(configOverrides));
}

/**
 * Get relative path from project root
 */
export function getProjectPath(...segments: string[]): string {
  return join(process.cwd(), ...segments);
}
