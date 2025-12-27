/**
 * Type mapping utility - converts schema field types to TypeScript types
 *
 * @module cli/utils/type-mapping
 * @category CLI
 */

import type { FieldDefinition } from '../../schema/types';

/**
 * Convert a field definition to its TypeScript type representation
 *
 * @example
 * ```typescript
 * fieldToTsType({ type: 'string' }) // 'string'
 * fieldToTsType({ type: 'enum', values: ['a', 'b'] }) // "'a' | 'b'"
 * fieldToTsType({ type: 'array', items: { type: 'string' } }) // 'string[]'
 * fieldToTsType({ type: 'bigint' }) // 'bigint'
 * fieldToTsType({ type: 'decimal' }) // 'string' (precision-safe)
 * ```
 */
export function fieldToTsType(field: FieldDefinition): string {
  switch (field.type) {
    case 'uuid':
    case 'string':
    case 'email':
    case 'url':
    case 'text':
      return 'string';

    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
      return 'number';

    // BigInt support - use native bigint type
    case 'bigint':
    case 'bigserial':
      return 'bigint';

    // Decimal/Money - use string for precision (avoids floating point issues)
    case 'decimal':
    case 'numeric':
    case 'money':
      return 'string';

    // Binary data - use Uint8Array or Buffer
    case 'bytea':
    case 'binary':
    case 'blob':
      return 'Uint8Array';

    case 'boolean':
      return 'boolean';

    // Date/time types
    case 'date':
    case 'datetime':
    case 'timestamp':
    case 'timestamptz':
      return 'Date';

    // Time without date
    case 'time':
    case 'timetz':
      return 'string'; // HH:MM:SS format

    // Interval (duration)
    case 'interval':
      return 'string'; // ISO 8601 duration or PostgreSQL interval format

    case 'enum':
      if (field.values && field.values.length > 0) {
        return (field.values as string[]).map((v) => `'${v}'`).join(' | ');
      }
      return 'string';

    case 'array':
      if (field.items) {
        return `${fieldToTsType(field.items)}[]`;
      }
      return 'unknown[]';

    case 'object':
      if (field.shape) {
        const props = Object.entries(field.shape)
          .map(([k, v]) => `${escapePropertyKey(k)}: ${fieldToTsType(v)}`)
          .join('; ');
        return `{ ${props} }`;
      }
      return 'Record<string, unknown>';

    case 'json':
    case 'jsonb':
      return 'unknown';

    case 'ref':
      return 'string'; // FK is always string UUID

    // PostGIS geometry types
    case 'point':
      return '{ x: number; y: number }';

    case 'geometry':
    case 'geography':
      return 'unknown'; // GeoJSON or WKT - depends on use case

    default:
      return 'unknown';
  }
}

/**
 * Escape a property key for use in TypeScript object types.
 * Keys with special characters need to be quoted.
 *
 * @param key - The property key to escape
 * @returns Properly formatted key for TypeScript
 */
function escapePropertyKey(key: string): string {
  // Check if key is a valid identifier (letters, digits, underscore, $, doesn't start with digit)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  // Quote the key and escape any quotes inside
  return `'${key.replace(/'/g, "\\'")}'`;
}

/**
 * Convert a primitive type string to TypeScript type
 */
export function primitiveToTs(type: string): string {
  switch (type) {
    case 'string':
    case 'text':
    case 'uuid':
    case 'email':
    case 'url':
      return 'string';

    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
      return 'number';

    case 'bigint':
    case 'bigserial':
      return 'bigint';

    case 'decimal':
    case 'numeric':
    case 'money':
      return 'string';

    case 'bytea':
    case 'binary':
    case 'blob':
      return 'Uint8Array';

    case 'boolean':
      return 'boolean';

    case 'date':
    case 'datetime':
    case 'timestamp':
    case 'timestamptz':
      return 'Date';

    case 'time':
    case 'timetz':
    case 'interval':
      return 'string';

    default:
      return 'unknown';
  }
}
