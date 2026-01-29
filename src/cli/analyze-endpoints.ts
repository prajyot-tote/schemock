/**
 * Endpoint analysis for Schemock CLI
 *
 * Analyzes endpoint schemas and extracts all information needed for code generation.
 *
 * @module cli/analyze-endpoints
 * @category CLI
 */

import { readFileSync } from 'node:fs';
import type { EndpointSchema, FieldDefinition } from '../schema/types';
import type { AnalyzedEndpoint, AnalyzedEndpointField, ResolverDependency, LocalFunction } from './types';

/**
 * Cache for parsed source file imports
 */
const importCache = new Map<string, Map<string, string>>();

/**
 * Parse imports from a TypeScript/JavaScript source file
 *
 * @param filePath - Path to the source file
 * @returns Map of identifier name to import module path
 */
function parseImportsFromFile(filePath: string): Map<string, string> {
  if (importCache.has(filePath)) {
    return importCache.get(filePath)!;
  }

  const imports = new Map<string, string>();

  try {
    const content = readFileSync(filePath, 'utf-8');

    // Match import statements - both named and default imports
    // Handles: import { a, b } from 'module'
    //          import { a as b } from 'module'
    //          import def from 'module'
    //          import def, { a, b } from 'module'
    const importRegex = /import\s+(?:(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+)?['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, defaultImport, namedImports, modulePath] = match;

      // Handle default import
      if (defaultImport) {
        imports.set(defaultImport, modulePath);
      }

      // Handle named imports
      if (namedImports) {
        const names = namedImports.split(',').map(s => s.trim());
        for (const name of names) {
          // Handle 'a as b' syntax
          const asMatch = name.match(/(\w+)\s+as\s+(\w+)/);
          if (asMatch) {
            imports.set(asMatch[2], modulePath);
          } else if (name && /^\w+$/.test(name)) {
            imports.set(name, modulePath);
          }
        }
      }
    }
  } catch (error) {
    // File read error - return empty map
    console.warn(`Warning: Could not parse imports from ${filePath}`);
  }

  importCache.set(filePath, imports);
  return imports;
}

/**
 * Cache for parsed local functions in source files
 */
const localFunctionCache = new Map<string, Map<string, string>>();

/**
 * Clear analysis caches to prevent stale data between generator runs
 *
 * This should be called at the start of analyzeEndpoints() to ensure
 * fresh analysis when running the generator multiple times in the same process.
 */
export function clearAnalysisCaches(): void {
  importCache.clear();
  localFunctionCache.clear();
}

/**
 * Parse local function definitions from a TypeScript/JavaScript source file
 *
 * @param filePath - Path to the source file
 * @returns Map of function name to full function source code
 */
function parseLocalFunctions(filePath: string): Map<string, string> {
  if (localFunctionCache.has(filePath)) {
    return localFunctionCache.get(filePath)!;
  }

  const functions = new Map<string, string>();

  try {
    const content = readFileSync(filePath, 'utf-8');

    // Pattern 1: function declarations - function name(...) { ... }
    // Matches both exported and non-exported functions
    const funcDeclRegex = /^(export\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/gm;
    let match;
    while ((match = funcDeclRegex.exec(content)) !== null) {
      const name = match[2];
      const source = extractFunctionBody(content, match.index);
      if (source) functions.set(name, source);
    }

    // Pattern 2: arrow function assignments - const name = (...) => { ... }
    // Matches both exported and non-exported const/let
    const arrowRegex = /^(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)[^=]*=>/gm;
    while ((match = arrowRegex.exec(content)) !== null) {
      const name = match[3];
      const source = extractArrowFunction(content, match.index);
      if (source) functions.set(name, source);
    }
  } catch {
    console.warn(`Warning: Could not parse local functions from ${filePath}`);
  }

  localFunctionCache.set(filePath, functions);
  return functions;
}

/**
 * Extract function body by counting braces
 *
 * @param content - Full file content
 * @param startIndex - Starting index of the function declaration
 * @returns Full function source code or null if parsing fails
 */
function extractFunctionBody(content: string, startIndex: number): string | null {
  let braceCount = 0;
  let started = false;

  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      braceCount++;
      started = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        return content.slice(startIndex, i + 1).trim();
      }
    }
  }
  return null;
}

/**
 * Extract arrow function (handles both block body and expression body)
 *
 * @param content - Full file content
 * @param startIndex - Starting index of the arrow function assignment
 * @returns Full arrow function source code or null if parsing fails
 */
function extractArrowFunction(content: string, startIndex: number): string | null {
  const arrowIndex = content.indexOf('=>', startIndex);
  if (arrowIndex === -1) return null;

  // Skip whitespace after arrow
  let i = arrowIndex + 2;
  while (i < content.length && /\s/.test(content[i])) i++;

  if (content[i] === '{') {
    // Block body - use brace counting
    let braceCount = 0;
    let started = false;

    for (let j = i; j < content.length; j++) {
      if (content[j] === '{') {
        braceCount++;
        started = true;
      } else if (content[j] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          return content.slice(startIndex, j + 1).trim();
        }
      }
    }
    return null;
  } else {
    // Expression body - find semicolon or newline (accounting for nested parens)
    let end = i;
    let parenCount = 0;
    while (end < content.length) {
      if (content[end] === '(') parenCount++;
      else if (content[end] === ')') parenCount--;
      else if ((content[end] === ';' || content[end] === '\n') && parenCount === 0) {
        break;
      }
      end++;
    }
    return content.slice(startIndex, end).trim() + ';';
  }
}

/**
 * Detect identifiers used in a function body that might be external dependencies
 *
 * @param functionSource - The serialized function source code
 * @returns Array of potential identifier names
 */
function detectUsedIdentifiers(functionSource: string): string[] {
  // Remove string literals to avoid false positives
  const withoutStrings = functionSource
    .replace(/'[^']*'/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/`[^`]*`/g, '');

  // Match function calls and identifier usage
  // Look for: functionName( or ClassName.method or throw new ClassName
  const identifiers = new Set<string>();

  // Match function calls: identifier(
  const callRegex = /\b([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*)\s*\(/g;
  let match;
  while ((match = callRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    // Skip common built-ins and context properties
    if (!isBuiltIn(name) && !isContextProperty(name)) {
      identifiers.add(name);
    }
  }

  // Match await calls: await identifier(
  // This catches async function calls that might be missed by the general call regex
  const awaitCallRegex = /\bawait\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(/g;
  while ((match = awaitCallRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    if (!isBuiltIn(name) && !isContextProperty(name)) {
      identifiers.add(name);
    }
  }

  // Match class instantiation: new ClassName
  const newRegex = /\bnew\s+([A-Z][a-zA-Z0-9]*)/g;
  while ((match = newRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    if (!isBuiltIn(name)) {
      identifiers.add(name);
    }
  }

  // Match throw new: throw new ClassName
  const throwRegex = /\bthrow\s+new\s+([A-Z][a-zA-Z0-9]*)/g;
  while ((match = throwRegex.exec(withoutStrings)) !== null) {
    identifiers.add(match[1]);
  }

  // Match identifiers used as values (passed to functions, assigned, etc.)
  // This catches: someFunc(hashPassword) or const fn = hashPassword
  // Use a more targeted approach: look for camelCase identifiers that appear
  // in contexts where they're used as values (not called)
  const valueUsageRegex = /(?:,\s*|\(\s*|=\s*|:\s*)([a-z][a-zA-Z0-9]*)\b(?!\s*[:(])/g;
  while ((match = valueUsageRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    // Only add if it looks like an imported utility (camelCase, not a keyword)
    if (!isBuiltIn(name) && !isContextProperty(name) && !isKeyword(name) && name.length > 2) {
      identifiers.add(name);
    }
  }

  return Array.from(identifiers);
}

/**
 * Check if identifier is a JavaScript keyword
 */
function isKeyword(name: string): boolean {
  const keywords = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'throw', 'try', 'catch', 'finally', 'const', 'let', 'var',
    'function', 'async', 'await', 'class', 'new', 'this', 'super', 'import',
    'export', 'default', 'from', 'as', 'true', 'false', 'null', 'undefined',
    'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'with', 'yield',
  ]);
  return keywords.has(name);
}

/**
 * Check if identifier is a JavaScript built-in
 */
function isBuiltIn(name: string): boolean {
  const builtIns = new Set([
    // Functions
    'console', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Date', 'Math', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'fetch', 'setTimeout',
    'setInterval', 'clearTimeout', 'clearInterval',
    // Errors
    'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
    // Common methods that look like function calls
    'toString', 'valueOf', 'hasOwnProperty', 'length', 'push', 'pop',
    'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every',
    'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split',
  ]);
  return builtIns.has(name);
}

/**
 * Check if identifier is a resolver context property
 */
function isContextProperty(name: string): boolean {
  const contextProps = new Set([
    'params', 'body', 'db', 'headers', 'ctx',
    // Common db methods
    'findMany', 'findFirst', 'findUnique', 'create', 'update', 'delete',
    'count', 'getAll', 'deleteMany', 'updateMany', 'upsert',
  ]);
  return contextProps.has(name);
}

/**
 * Analyze an array of endpoint schemas
 *
 * @param endpoints - Array of endpoint schemas from discovery
 * @param endpointFiles - Optional map of endpoint paths to their source file paths
 * @returns Array of analyzed endpoints ready for code generation
 */
export function analyzeEndpoints(
  endpoints: EndpointSchema[],
  endpointFiles?: Map<string, string>
): AnalyzedEndpoint[] {
  // Clear stale caches from previous runs to prevent stale data
  clearAnalysisCaches();

  return endpoints.map((endpoint) => analyzeEndpoint(endpoint, endpointFiles));
}

/**
 * Analyze a single endpoint schema
 */
function analyzeEndpoint(
  endpoint: EndpointSchema,
  endpointFiles?: Map<string, string>
): AnalyzedEndpoint {
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

  // Get source file for this endpoint
  const sourceFile = endpointFiles?.get(endpoint.path);

  // Check if resolver is a named function (not anonymous or arrow function)
  const resolverName = endpoint.mockResolver.name;
  const isNamedFunction = resolverName && !resolverName.startsWith('bound ') && resolverName !== 'mockResolver';

  let mockResolverName: string | undefined;
  let mockResolverImportPath: string | undefined;
  let resolverDependencies: ResolverDependency[] | undefined;
  let localFunctions: LocalFunction[] | undefined;

  if (isNamedFunction) {
    // Named function - will be imported directly
    mockResolverName = resolverName;
    if (sourceFile) {
      mockResolverImportPath = sourceFile;
    }
  } else if (sourceFile) {
    // Inline/anonymous resolver - detect external dependencies and local functions
    const usedIdentifiers = detectUsedIdentifiers(mockResolverSource);

    if (usedIdentifiers.length > 0) {
      // Parse imports and local functions from source file
      const fileImports = parseImportsFromFile(sourceFile);
      const localFuncs = parseLocalFunctions(sourceFile);

      // Categorize used identifiers as either imported dependencies or local functions
      const deps: ResolverDependency[] = [];
      const locals: LocalFunction[] = [];

      for (const identifier of usedIdentifiers) {
        const importPath = fileImports.get(identifier);
        if (importPath) {
          // It's an imported dependency
          deps.push({ name: identifier, from: importPath });
        } else {
          // Check if it's a local function defined in the source file
          const localSource = localFuncs.get(identifier);
          if (localSource) {
            locals.push({ name: identifier, source: localSource });
          }
        }
      }

      if (deps.length > 0) {
        resolverDependencies = deps;
      }
      if (locals.length > 0) {
        localFunctions = locals;
      }
    }
  }

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
    mockResolverName,
    mockResolverImportPath,
    sourceFile,
    resolverDependencies,
    localFunctions,
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
 * - /api/posts/bulk-delete -> postsBulkDelete
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
    let part = parts[i];

    if (part.startsWith(':')) {
      // Path parameter - add "By" prefix and capitalize
      // Also handle hyphenated params like :user-id -> ByUserId
      const paramName = toCamelCaseFromHyphen(part.slice(1));
      nameParts.push('By' + capitalize(paramName));
    } else if (part) {
      // Convert hyphenated segments to camelCase
      part = toCamelCaseFromHyphen(part);

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
 * Convert hyphenated string to camelCase
 *
 * Example: bulk-delete -> bulkDelete
 */
function toCamelCaseFromHyphen(str: string): string {
  return str
    .split('-')
    .map((part, index) => (index === 0 ? part : capitalize(part)))
    .join('');
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
