/**
 * Middleware analysis for Schemock CLI
 *
 * Analyzes middleware schemas and extracts all information needed for code generation.
 * Follows the same pattern as analyze-endpoints.ts for consistency.
 *
 * @module cli/analyze-middleware
 * @category CLI
 */

import { readFileSync } from 'node:fs';
import type { MiddlewareSchema, FieldDefinition } from '../schema/types';
import type { AnalyzedMiddleware, AnalyzedMiddlewareConfigField, ResolverDependency, LocalFunction } from './types';

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
    if (!isBuiltIn(name) && !isMiddlewareContextProperty(name)) {
      identifiers.add(name);
    }
  }

  // Match await calls: await identifier(
  // This catches async function calls that might be missed by the general call regex
  const awaitCallRegex = /\bawait\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(/g;
  while ((match = awaitCallRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    if (!isBuiltIn(name) && !isMiddlewareContextProperty(name)) {
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
  // This catches: someFunc(helper) or const fn = helper
  const valueUsageRegex = /(?:,\s*|\(\s*|=\s*|:\s*)([a-z][a-zA-Z0-9]*)\b(?!\s*[:(])/g;
  while ((match = valueUsageRegex.exec(withoutStrings)) !== null) {
    const name = match[1];
    // Only add if it looks like an imported utility (camelCase, not a keyword)
    if (!isBuiltIn(name) && !isMiddlewareContextProperty(name) && !isKeyword(name) && name.length > 2) {
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
    'setInterval', 'clearTimeout', 'clearInterval', 'crypto', 'atob', 'btoa',
    // Errors
    'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
    // Common methods that look like function calls
    'toString', 'valueOf', 'hasOwnProperty', 'length', 'push', 'pop',
    'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every',
    'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split',
    'toLowerCase', 'toUpperCase', 'trim', 'startsWith', 'endsWith',
  ]);
  return builtIns.has(name);
}

/**
 * Check if identifier is a middleware handler context property
 */
function isMiddlewareContextProperty(name: string): boolean {
  const contextProps = new Set([
    // Middleware handler context properties
    'ctx', 'config', 'next',
    // Context properties
    'headers', 'path', 'method', 'query', 'params', 'body', 'context', 'metadata',
    // Common response methods
    'response', 'status',
  ]);
  return contextProps.has(name);
}

/**
 * Analyze an array of middleware schemas
 *
 * @param middlewares - Array of middleware schemas from discovery
 * @param middlewareFiles - Optional map of middleware names to their source file paths
 * @returns Array of analyzed middlewares ready for code generation
 */
export function analyzeMiddleware(
  middlewares: MiddlewareSchema[],
  middlewareFiles?: Map<string, string>
): AnalyzedMiddleware[] {
  return middlewares.map((middleware) => analyzeMiddlewareItem(middleware, middlewareFiles));
}

/**
 * Analyze a single middleware schema
 */
function analyzeMiddlewareItem(
  middleware: MiddlewareSchema,
  middlewareFiles?: Map<string, string>
): AnalyzedMiddleware {
  // Derive PascalCase name
  const pascalName = toPascalCase(middleware.name);

  // Analyze config fields
  const configFields = analyzeConfigFields(middleware.config);

  // Serialize the handler function to string
  const handlerSource = serializeHandler(middleware.handler);

  // Get source file for this middleware
  const sourceFile = middlewareFiles?.get(middleware.name);

  // Check if handler is a named function (not anonymous or arrow function)
  const handlerFunctionName = middleware.handler.name;
  const isNamedFunction = handlerFunctionName &&
    !handlerFunctionName.startsWith('bound ') &&
    handlerFunctionName !== 'handler' &&
    handlerFunctionName !== 'anonymous';

  let handlerName: string | undefined;
  let handlerImportPath: string | undefined;
  let handlerDependencies: ResolverDependency[] | undefined;
  let localFunctions: LocalFunction[] | undefined;

  if (isNamedFunction) {
    // Named function - will be imported directly
    handlerName = handlerFunctionName;
    if (sourceFile) {
      handlerImportPath = sourceFile;
    }
  } else if (sourceFile) {
    // Inline/anonymous handler - detect external dependencies and local functions
    const usedIdentifiers = detectUsedIdentifiers(handlerSource);

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
        handlerDependencies = deps;
      }
      if (locals.length > 0) {
        localFunctions = locals;
      }
    }
  }

  return {
    name: middleware.name,
    pascalName,
    configFields,
    handlerSource,
    handlerName,
    handlerImportPath,
    sourceFile,
    handlerDependencies,
    localFunctions,
    order: middleware.order,
    description: middleware.description,
  };
}

/**
 * Convert hyphenated/kebab-case string to PascalCase
 *
 * Examples:
 * - tenant -> Tenant
 * - request-id -> RequestId
 * - api-key-auth -> ApiKeyAuth
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Analyze a record of config field definitions
 */
function analyzeConfigFields(fields: Record<string, FieldDefinition>): AnalyzedMiddlewareConfigField[] {
  return Object.entries(fields).map(([name, field]) => analyzeConfigField(name, field));
}

/**
 * Analyze a single config field definition
 */
function analyzeConfigField(name: string, field: FieldDefinition): AnalyzedMiddlewareConfigField {
  const tsType = fieldToTsType(field);
  const hasDefault = field.default !== undefined;

  const analyzed: AnalyzedMiddlewareConfigField = {
    name,
    type: field.type,
    tsType,
    hasDefault,
    default: field.default,
    nullable: field.nullable ?? false,
  };

  // Handle enum values
  if (field.values && field.values.length > 0) {
    analyzed.enumValues = field.values as string[];
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
 * Serialize middleware handler function to string
 *
 * Handles both regular functions and arrow functions
 */
function serializeHandler(handler: Function): string {
  const source = handler.toString();

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

/**
 * Clear the import and function caches (useful for testing)
 */
export function clearAnalysisCache(): void {
  importCache.clear();
  localFunctionCache.clear();
}
