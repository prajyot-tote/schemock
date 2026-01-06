/**
 * Schema discovery for Schemock CLI
 *
 * @module cli/discover
 * @category CLI
 */

import { resolve, relative } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { EntitySchema, EndpointSchema } from '../schema/types';
import { isEndpointSchema } from '../schema/types';

/**
 * Result of schema discovery
 */
export interface DiscoveryResult {
  /** Discovered entity schemas */
  schemas: EntitySchema[];
  /** Discovered custom endpoints */
  endpoints: EndpointSchema[];
  /** File paths where schemas were found */
  files: string[];
}

/**
 * Parse a glob pattern to extract base directory and pattern parts
 */
function parseGlobPattern(pattern: string): { baseDir: string; patterns: string[] } {
  // Find the first part with glob characters
  const parts = pattern.split('/');
  const baseParts: string[] = [];
  const patternParts: string[] = [];

  let foundGlob = false;
  for (const part of parts) {
    if (foundGlob || part.includes('*') || part.includes('?') || part.includes('[')) {
      foundGlob = true;
      patternParts.push(part);
    } else {
      baseParts.push(part);
    }
  }

  return {
    baseDir: baseParts.join('/') || '.',
    patterns: patternParts,
  };
}

/**
 * Check if a file path matches a simple glob pattern
 */
function matchesPattern(filePath: string, patterns: string[]): boolean {
  const parts = filePath.split('/');

  if (patterns.length === 0) return true;

  // Handle ** pattern (match any depth including zero)
  const patternStr = patterns.join('/');
  if (patternStr.includes('**')) {
    // Convert glob to regex
    // Order is critical: handle glob patterns before escaping regex metacharacters
    let regexStr = patternStr
      .replace(/\*\*\//g, '<<<GLOBSTAR_SLASH>>>')     // **/ -> placeholder (before * and . handling)
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')             // ** -> placeholder
      .replace(/\?/g, '<<<QUESTION>>>')               // ? -> placeholder
      .replace(/\*/g, '<<<STAR>>>')                   // * -> placeholder
      .replace(/\./g, '\\.')                          // . -> literal dot (escape regex metachar)
      .replace(/<<<GLOBSTAR_SLASH>>>/g, '(?:.*/)?')   // **/ -> optional any path
      .replace(/<<<GLOBSTAR>>>/g, '.*')               // ** -> any chars
      .replace(/<<<STAR>>>/g, '[^/]*')                // * -> any chars except /
      .replace(/<<<QUESTION>>>/g, '.');               // ? -> single char
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(filePath);
  }

  // Simple pattern matching
  if (parts.length !== patterns.length) return false;

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const part = parts[i];

    if (pattern === '*') continue;
    if (pattern.includes('*')) {
      const regexStr = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(`^${regexStr}$`);
      if (!regex.test(part)) return false;
    } else if (pattern !== part) {
      return false;
    }
  }

  return true;
}

/**
 * Recursively find all files matching a pattern
 */
async function findFiles(baseDir: string, patterns: string[], currentPath: string = ''): Promise<string[]> {
  const fullPath = resolve(baseDir, currentPath);
  const files: string[] = [];

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await findFiles(baseDir, patterns, entryPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file matches pattern
        if (matchesPattern(entryPath, patterns)) {
          // Skip .d.ts, .test.ts, .spec.ts files
          if (
            !entry.name.endsWith('.d.ts') &&
            !entry.name.endsWith('.test.ts') &&
            !entry.name.endsWith('.spec.ts')
          ) {
            files.push(resolve(baseDir, entryPath));
          }
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    console.warn(`Warning: Could not read directory ${fullPath}`);
  }

  return files;
}

/**
 * Check if a value is an EntitySchema
 */
function isEntitySchema(value: unknown): value is EntitySchema {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.fields === 'object' && obj.fields !== null;
}

/**
 * Discover schemas from files matching a glob pattern or direct file path
 *
 * @param pattern - Glob pattern or direct file path to schema files
 * @returns Discovery result with schemas and file paths
 */
export async function discoverSchemas(pattern: string): Promise<DiscoveryResult> {
  let files: string[];

  // Check if pattern is a direct file path (no glob characters)
  const isGlobPattern = pattern.includes('*') || pattern.includes('?') || pattern.includes('[');

  if (!isGlobPattern) {
    // Direct file path - check if it exists
    const resolvedPath = resolve(pattern);
    try {
      const fileStat = await stat(resolvedPath);
      if (fileStat.isFile()) {
        files = [resolvedPath];
      } else {
        throw new Error(`Path is not a file: ${pattern}`);
      }
    } catch (error) {
      throw new Error(`Schema file not found: ${pattern}`);
    }
  } else {
    // Glob pattern - find matching files
    const { baseDir, patterns } = parseGlobPattern(pattern);
    const resolvedBaseDir = resolve(baseDir);
    files = await findFiles(resolvedBaseDir, patterns);

    if (files.length === 0) {
      throw new Error(`No schema files found matching: ${pattern}`);
    }
  }

  const schemas: EntitySchema[] = [];
  const endpoints: EndpointSchema[] = [];
  const loadedFiles: string[] = [];

  for (const file of files) {
    try {
      // Import the module
      const module = await import(file);

      // Find all exports that are EntitySchema or EndpointSchema
      let foundSchema = false;
      for (const [_exportName, value] of Object.entries(module)) {
        if (isEntitySchema(value)) {
          schemas.push(value);
          foundSchema = true;
        } else if (isEndpointSchema(value)) {
          endpoints.push(value);
          foundSchema = true;
        }
      }

      if (foundSchema) {
        loadedFiles.push(file);
      }
    } catch (error) {
      console.warn(`Warning: Could not import ${file}: ${error}`);
    }
  }

  if (schemas.length === 0 && endpoints.length === 0) {
    throw new Error('No schemas found. Make sure your schema files export defineData() or defineEndpoint() results.');
  }

  return { schemas, endpoints, files: loadedFiles };
}

/**
 * Get relative path from current working directory
 */
export function getRelativePath(absolutePath: string): string {
  return relative(process.cwd(), absolutePath);
}
