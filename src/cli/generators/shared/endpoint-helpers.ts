/**
 * Shared Endpoint Helpers for Backend Route Generation
 *
 * Cross-target utilities for generating endpoint route/handler files.
 * Used by nextjs-api, node-handlers, supabase-edge, and neon generators.
 *
 * @module cli/generators/shared/endpoint-helpers
 * @category CLI
 */

import type { AnalyzedEndpoint, AnalyzedEndpointField } from '../../types';

/**
 * Target type for backend route generation
 */
export type ServerTargetType = 'nextjs-api' | 'node-handlers' | 'supabase-edge' | 'neon';

/**
 * Backend database type
 */
export type BackendType = 'supabase' | 'firebase' | 'pglite' | 'fetch' | 'neon';

/**
 * Generate TypeScript interfaces for an endpoint's params, body, and response
 */
export function generateEndpointInterfaces(endpoint: AnalyzedEndpoint): string {
  const lines: string[] = [];

  // Params interface (query + path params combined)
  if (endpoint.params.length > 0 || endpoint.pathParams.length > 0) {
    lines.push(`export interface ${endpoint.pascalName}Params {`);
    // Path params are always strings
    for (const param of endpoint.pathParams) {
      // Check if it's also in params with a type
      const typedParam = endpoint.params.find(p => p.name === param);
      if (typedParam) {
        lines.push(`  ${param}${typedParam.required ? '' : '?'}: ${typedParam.tsType};`);
      } else {
        lines.push(`  ${param}: string;`);
      }
    }
    // Query params not already listed as path params
    for (const param of endpoint.params) {
      if (endpoint.pathParams.includes(param.name)) continue;
      lines.push(`  ${param.name}${param.required ? '' : '?'}: ${param.tsType};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Body interface
  if (endpoint.body.length > 0) {
    lines.push(`export interface ${endpoint.pascalName}Body {`);
    for (const field of endpoint.body) {
      lines.push(`  ${field.name}${field.required ? '' : '?'}: ${fieldToTsType(field)};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Response interface
  if (endpoint.response.length > 0) {
    lines.push(`export interface ${endpoint.pascalName}Response {`);
    for (const field of endpoint.response) {
      lines.push(`  ${field.name}${field.required ? '' : '?'}: ${fieldToTsType(field)};`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert an AnalyzedEndpointField to a TypeScript type string
 */
function fieldToTsType(field: AnalyzedEndpointField): string {
  if (field.isArray && field.itemType) {
    return `${fieldToTsType(field.itemType)}[]`;
  }
  if (field.isObject && field.shape) {
    const shapeEntries = field.shape.map(
      (f) => `${f.name}${f.required ? '' : '?'}: ${fieldToTsType(f)}`
    );
    return `{ ${shapeEntries.join('; ')} }`;
  }
  return field.tsType;
}

/**
 * Generate a type-appropriate parsing line for a parameter
 *
 * @param field - The endpoint field to parse
 * @param accessPattern - How to access the raw value (e.g., "searchParams.get('q')")
 * @returns The parsing expression
 */
export function generateParamParsingExpression(
  field: AnalyzedEndpointField,
  accessPattern: string
): string {
  const defaultStr = field.hasDefault ? String(field.default) : undefined;

  switch (field.type) {
    case 'number':
    case 'integer':
      if (defaultStr !== undefined) {
        return `Number(${accessPattern} ?? '${defaultStr}')`;
      }
      return `Number(${accessPattern})`;

    case 'boolean':
      if (defaultStr !== undefined) {
        return `(${accessPattern} ?? '${defaultStr}') === 'true'`;
      }
      return `${accessPattern} === 'true'`;

    case 'string':
    default:
      if (defaultStr !== undefined) {
        return `${accessPattern} ?? '${defaultStr}'`;
      }
      if (!field.required) {
        return `${accessPattern} ?? undefined`;
      }
      return `${accessPattern} ?? ''`;
  }
}

/**
 * Convert an endpoint path from `:param` format to the target's format
 *
 * @param path - Original path (e.g., /api/users/:id/posts)
 * @param target - Target to convert for
 * @returns Converted path
 */
export function convertPathForTarget(
  path: string,
  target: ServerTargetType
): string {
  switch (target) {
    case 'nextjs-api':
      // Convert :param to [param] for Next.js App Router
      return path.replace(/:(\w+)/g, '[$1]');

    case 'supabase-edge':
      // Keep :param format, but the router will use regex matching
      return path;

    case 'node-handlers':
    case 'neon':
      // Express uses :param format natively
      return path;
  }
}

/**
 * Get the correct DB client import for a backend type
 *
 * @param backend - The backend database type
 * @param relativePath - Relative path to the lib/db directory
 * @returns Import statement
 */
export function getBackendImport(
  backend: BackendType,
  relativePath: string
): string {
  switch (backend) {
    case 'supabase':
      return `import { supabase } from '${relativePath}/supabase';`;
    case 'firebase':
      return `import { db } from '${relativePath}/firebase';`;
    case 'pglite':
      return `import { db } from '${relativePath}/pglite';`;
    case 'fetch':
      return `import { api } from '${relativePath}/api';`;
    case 'neon':
      return `import { sql } from '${relativePath}/db';`;
  }
}

/**
 * Generate a TODO body with DB-specific example query for an endpoint
 *
 * @param endpoint - The analyzed endpoint
 * @param backend - The backend database type
 * @returns Lines for the TODO body
 */
export function generateEndpointTodoBody(
  endpoint: AnalyzedEndpoint,
  backend: BackendType
): string[] {
  const lines: string[] = [];
  const hasResponse = endpoint.response.length > 0;
  const responseType = hasResponse ? `${endpoint.pascalName}Response` : 'unknown';

  lines.push('    // TODO: Implement business logic');
  lines.push(`    // Endpoint: ${endpoint.method} ${endpoint.path}`);

  if (endpoint.description) {
    lines.push(`    // ${endpoint.description}`);
  }

  lines.push('    //');

  // DB-specific example
  switch (backend) {
    case 'supabase':
      lines.push('    // Example with Supabase:');
      lines.push("    // const { data, error } = await supabase");
      lines.push("    //   .from('table_name')");
      lines.push("    //   .select('*');");
      break;
    case 'firebase':
      lines.push('    // Example with Firebase:');
      lines.push("    // const snapshot = await db.collection('collection_name').get();");
      lines.push("    // const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));");
      break;
    case 'pglite':
      lines.push('    // Example with PGlite:');
      lines.push("    // const result = await db.query('SELECT * FROM table_name WHERE ...');");
      lines.push('    // return result.rows;');
      break;
    case 'fetch':
      lines.push('    // Example with Fetch:');
      lines.push("    // const response = await api.entity.list();");
      break;
    case 'neon':
      lines.push('    // Example with Neon:');
      lines.push('    // const data = await sql`SELECT * FROM table_name WHERE ...`;');
      break;
  }

  lines.push('    //');
  if (hasResponse) {
    lines.push(`    // Expected return type: ${responseType}`);
  }

  return lines;
}

/**
 * Derive a handler/function name from an endpoint path
 * e.g., /api/auth/login -> authLogin
 * e.g., /api/search -> search
 * e.g., /api/users/:id/posts -> usersIdPosts
 */
export function deriveHandlerName(endpoint: AnalyzedEndpoint): string {
  return endpoint.name;
}

/**
 * Derive an edge function directory name from a path
 * e.g., /api/auth/login -> api-auth-login
 * e.g., /api/search -> api-search
 */
export function deriveEdgeFunctionName(path: string): string {
  return path
    .replace(/^\//, '')  // Remove leading slash
    .replace(/:(\w+)/g, '$1')  // Remove : from params
    .replace(/\//g, '-');  // Replace / with -
}

/**
 * Get query params for an endpoint (params that are not path params)
 */
export function getQueryParams(endpoint: AnalyzedEndpoint): AnalyzedEndpointField[] {
  return endpoint.params.filter(p => !endpoint.pathParams.includes(p.name));
}

/**
 * Generate all endpoint type interfaces for a set of endpoints
 */
export function generateAllEndpointInterfaces(endpoints: AnalyzedEndpoint[]): string {
  const lines: string[] = [
    '// GENERATED BY SCHEMOCK - DO NOT EDIT',
    '',
    '// Endpoint type definitions',
    '',
  ];

  for (const endpoint of endpoints) {
    const interfaces = generateEndpointInterfaces(endpoint);
    if (interfaces) {
      lines.push(`// ${endpoint.method} ${endpoint.path}`);
      lines.push(interfaces);
    }
  }

  return lines.join('\n');
}
