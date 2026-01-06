/**
 * Endpoint analysis for Schemock CLI
 *
 * Analyzes endpoint schemas and extracts all information needed for code generation.
 *
 * @module cli/analyze-endpoints
 * @category CLI
 */

import type { EndpointSchema, FieldDefinition } from '../schema/types';
import type { AnalyzedEndpoint, AnalyzedEndpointField } from './types';

/**
 * Analyze an array of endpoint schemas
 *
 * @param endpoints - Array of endpoint schemas from discovery
 * @returns Array of analyzed endpoints ready for code generation
 */
export function analyzeEndpoints(endpoints: EndpointSchema[]): AnalyzedEndpoint[] {
  return endpoints.map(analyzeEndpoint);
}

/**
 * Analyze a single endpoint schema
 */
function analyzeEndpoint(endpoint: EndpointSchema): AnalyzedEndpoint {
  // Derive name from path
  const name = deriveEndpointName(endpoint.path);
  const pascalName = toPascalCase(name);

  // Extract path parameters (e.g., :id, :userId)
  const pathParams = extractPathParams(endpoint.path);

  // Analyze params, body, and response fields
  const params = analyzeFields(endpoint.params);
  const body = analyzeFields(endpoint.body);
  const response = analyzeFields(endpoint.response);

  // Serialize the mock resolver function to string
  const mockResolverSource = serializeMockResolver(endpoint.mockResolver);

  return {
    path: endpoint.path,
    method: endpoint.method,
    name,
    pascalName,
    pathParams,
    params,
    body,
    response,
    mockResolverSource,
    description: endpoint.description,
  };
}

/**
 * Derive endpoint name from path
 *
 * Examples:
 * - /api/search -> search
 * - /api/orders/:id -> ordersById
 * - /api/users/:userId/posts -> userPosts
 * - /health -> health
 */
function deriveEndpointName(path: string): string {
  // Remove /api/ prefix if present
  let cleaned = path.replace(/^\/api\//, '');

  // Remove leading slash
  cleaned = cleaned.replace(/^\//, '');

  // Handle path parameters - convert :param to ByParam
  const parts = cleaned.split('/');
  const nameParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith(':')) {
      // Path parameter - add "By" prefix and capitalize
      const paramName = part.slice(1);
      nameParts.push('By' + capitalize(paramName));
    } else if (part) {
      // Regular path segment
      if (i === 0) {
        nameParts.push(part);
      } else {
        nameParts.push(capitalize(part));
      }
    }
  }

  return nameParts.join('');
}

/**
 * Extract path parameter names from path
 *
 * Example: /api/users/:userId/posts/:postId -> ['userId', 'postId']
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:(\w+)/g) || [];
  return matches.map((m) => m.slice(1));
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Analyze a record of field definitions
 */
function analyzeFields(fields: Record<string, FieldDefinition>): AnalyzedEndpointField[] {
  return Object.entries(fields).map(([name, field]) => analyzeField(name, field));
}

/**
 * Analyze a single field definition
 */
function analyzeField(name: string, field: FieldDefinition): AnalyzedEndpointField {
  const tsType = fieldToTsType(field);
  const hasDefault = field.default !== undefined;

  const analyzed: AnalyzedEndpointField = {
    name,
    type: field.type,
    tsType,
    required: !hasDefault && !field.nullable,
    hasDefault,
    default: field.default,
    isArray: field.type === 'array',
    isObject: field.type === 'object',
  };

  // Handle enum values
  if (field.values && field.values.length > 0) {
    analyzed.enumValues = field.values as string[];
  }

  // Handle array items
  if (field.type === 'array' && field.items) {
    analyzed.itemType = analyzeField('item', field.items);
  }

  // Handle object shape
  if (field.type === 'object' && field.shape) {
    analyzed.shape = Object.entries(field.shape).map(([n, f]) => analyzeField(n, f));
  }

  return analyzed;
}

/**
 * Convert field definition to TypeScript type string
 */
function fieldToTsType(field: FieldDefinition): string {
  // Handle enum types
  if (field.values && field.values.length > 0) {
    return field.values.map((v) => `'${v}'`).join(' | ');
  }

  // Handle array types
  if (field.type === 'array') {
    if (field.items) {
      const itemType = fieldToTsType(field.items);
      return `Array<${itemType}>`;
    }
    return 'unknown[]';
  }

  // Handle object types
  if (field.type === 'object') {
    if (field.shape) {
      const props = Object.entries(field.shape)
        .map(([name, f]) => {
          const optional = f.default !== undefined ? '?' : '';
          return `${name}${optional}: ${fieldToTsType(f)}`;
        })
        .join('; ');
      return `{ ${props} }`;
    }
    return 'Record<string, unknown>';
  }

  // Map basic types
  const typeMap: Record<string, string> = {
    string: 'string',
    uuid: 'string',
    email: 'string',
    url: 'string',
    number: 'number',
    int: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'Date',
    ref: 'string',
  };

  const baseType = typeMap[field.type] || 'unknown';

  // Add null if nullable
  if (field.nullable) {
    return `${baseType} | null`;
  }

  return baseType;
}

/**
 * Serialize mock resolver function to string
 *
 * Handles both regular functions and arrow functions
 */
function serializeMockResolver(resolver: Function): string {
  const source = resolver.toString();

  // If it's an arrow function, it might need to be wrapped
  // Check if it starts with 'async' or directly with parameters
  if (source.startsWith('async (') || source.startsWith('(') || source.startsWith('async(')) {
    return source;
  }

  // If it's a regular function, convert to arrow function format
  if (source.startsWith('async function') || source.startsWith('function')) {
    // Extract parameters and body
    const match = source.match(/^(async\s+)?function\s*\w*\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
    if (match) {
      const [, asyncPrefix, params, body] = match;
      return `${asyncPrefix || ''}(${params}) => {${body}}`;
    }
  }

  // Return as-is if we can't parse it
  return source;
}
