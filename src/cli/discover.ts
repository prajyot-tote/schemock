/**
 * Schema discovery for Schemock CLI
 *
 * @module cli/discover
 * @category CLI
 */

import { resolve, relative } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { EntitySchema, EndpointSchema, MiddlewareSchema } from '../schema/types';
import { isEndpointSchema, isMiddlewareSchema } from '../schema/types';

/**
 * Result of schema discovery
 */
export interface DiscoveryResult {
  /** Discovered entity schemas */
  schemas: EntitySchema[];
  /** Discovered custom endpoints */
  endpoints: EndpointSchema[];
  /** Discovered middleware schemas */
  middleware: MiddlewareSchema[];
  /** File paths where schemas were found */
  files: string[];
  /** Map of endpoint paths to their source file paths */
  endpointFiles?: Map<string, string>;
  /** Map of middleware names to their source file paths */
  middlewareFiles?: Map<string, string>;
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
 * Options for schema discovery
 */
export interface DiscoverOptions {
  /** Glob pattern for custom endpoints (optional, can also be in schemas pattern) */
  endpointsGlob?: string;
  /** Glob pattern for middleware files */
  middlewareGlob?: string;
}

/**
 * Discover schemas from files matching a glob pattern or direct file path
 *
 * @param pattern - Glob pattern or direct file path to schema files
 * @param options - Optional discovery options for endpoints and middleware
 * @returns Discovery result with schemas, endpoints, middleware, and file paths
 */
export async function discoverSchemas(
  pattern: string,
  options: DiscoverOptions = {}
): Promise<DiscoveryResult> {
  const { endpointsGlob, middlewareGlob } = options;

  // Discover schema and endpoint files from main pattern
  let files = await resolveGlobOrPath(pattern);

  // Discover from separate endpoints glob if provided
  if (endpointsGlob) {
    const endpointFiles = await resolveGlobOrPath(endpointsGlob, { allowEmpty: true });
    files = [...files, ...endpointFiles.filter(f => !files.includes(f))];
  }

  if (files.length === 0) {
    throw new Error(`No schema files found matching: ${pattern}`);
  }

  const schemas: EntitySchema[] = [];
  const endpoints: EndpointSchema[] = [];
  const loadedFiles: string[] = [];
  const endpointFiles = new Map<string, string>();
  const seenEntityNames = new Set<string>();
  const seenEndpointKeys = new Set<string>(); // Use method+path as key for proper deduplication

  for (const file of files) {
    try {
      // Import the module
      const module = await import(file);

      // Find all exports that are EntitySchema or EndpointSchema
      let foundSchema = false;
      for (const [_exportName, value] of Object.entries(module)) {
        if (isEntitySchema(value)) {
          // Deduplicate entities by name (handles re-exports from barrel files)
          if (!seenEntityNames.has(value.name)) {
            seenEntityNames.add(value.name);
            schemas.push(value);
          }
          foundSchema = true;
        } else if (isEndpointSchema(value)) {
          // Deduplicate endpoints by method+path (handles re-exports and named+default exports)
          // Using method+path allows same path with different HTTP methods (GET /users vs POST /users)
          const endpointKey = `${value.method}:${value.path}`;
          if (!seenEndpointKeys.has(endpointKey)) {
            seenEndpointKeys.add(endpointKey);
            endpoints.push(value);
            // Track which file this endpoint came from (only set first occurrence)
            if (!endpointFiles.has(value.path)) {
              endpointFiles.set(value.path, file);
            }
          } else {
            // Warn about duplicate (helps debugging)
            console.warn(`Warning: Duplicate endpoint ${value.method} ${value.path} in ${file}`);
          }
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

  // Discover middleware from separate glob if provided
  const middleware: MiddlewareSchema[] = [];
  const middlewareFilesMap = new Map<string, string>();
  const seenMiddlewareNames = new Set<string>();

  if (middlewareGlob) {
    const mwFiles = await resolveGlobOrPath(middlewareGlob, { allowEmpty: true });

    for (const file of mwFiles) {
      try {
        const module = await import(file);

        for (const [_exportName, value] of Object.entries(module)) {
          if (isMiddlewareSchema(value)) {
            // Deduplicate middleware by name
            if (!seenMiddlewareNames.has(value.name)) {
              seenMiddlewareNames.add(value.name);
              middleware.push(value);
              middlewareFilesMap.set(value.name, file);

              if (!loadedFiles.includes(file)) {
                loadedFiles.push(file);
              }
            } else {
              console.warn(`Warning: Duplicate middleware '${value.name}' in ${file}`);
            }
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not import middleware from ${file}: ${error}`);
      }
    }
  }

  if (schemas.length === 0 && endpoints.length === 0 && middleware.length === 0) {
    throw new Error('No schemas found. Make sure your schema files export defineData(), defineEndpoint(), or defineMiddleware() results.');
  }

  return {
    schemas,
    endpoints,
    middleware,
    files: loadedFiles,
    endpointFiles,
    middlewareFiles: middlewareFilesMap,
  };
}

/**
 * Resolve a glob pattern or direct file path to a list of files
 *
 * @param pattern - Glob pattern or direct file path
 * @param options - Options for resolution
 * @returns Array of resolved file paths
 */
async function resolveGlobOrPath(
  pattern: string,
  options: { allowEmpty?: boolean } = {}
): Promise<string[]> {
  const { allowEmpty = false } = options;

  // Check if pattern is a direct file path (no glob characters)
  const isGlobPatternCheck = pattern.includes('*') || pattern.includes('?') || pattern.includes('[');

  if (!isGlobPatternCheck) {
    // Direct file path - check if it exists
    const resolvedPath = resolve(pattern);
    try {
      const fileStat = await stat(resolvedPath);
      if (fileStat.isFile()) {
        return [resolvedPath];
      } else {
        if (allowEmpty) return [];
        throw new Error(`Path is not a file: ${pattern}`);
      }
    } catch (error) {
      if (allowEmpty) return [];
      throw new Error(`File not found: ${pattern}`);
    }
  } else {
    // Glob pattern - find matching files
    const { baseDir, patterns } = parseGlobPattern(pattern);
    const resolvedBaseDir = resolve(baseDir);
    const files = await findFiles(resolvedBaseDir, patterns);

    if (files.length === 0 && !allowEmpty) {
      throw new Error(`No files found matching: ${pattern}`);
    }

    return files;
  }
}

/**
 * Get relative path from current working directory
 */
export function getRelativePath(absolutePath: string): string {
  return relative(process.cwd(), absolutePath);
}
