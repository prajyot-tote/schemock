/**
 * PostgreSQL type mapping for SQL generation
 *
 * @module cli/generators/sql/pg-types
 * @category CLI
 */

import type { AnalyzedField } from '../../types';

/**
 * Escape a string value for safe use in PostgreSQL SQL.
 * Escapes single quotes by doubling them.
 *
 * @param value - The string value to escape
 * @returns Escaped string safe for SQL
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Map Schemock field types to PostgreSQL types
 */
export const PG_TYPE_MAP: Record<string, string> = {
  // String types
  uuid: 'UUID',
  string: 'VARCHAR(255)',
  text: 'TEXT',
  email: 'VARCHAR(255)',
  url: 'TEXT',

  // Numeric types
  int: 'INTEGER',
  integer: 'INTEGER',
  number: 'DOUBLE PRECISION',
  float: 'DOUBLE PRECISION',
  double: 'DOUBLE PRECISION',

  // BigInt types
  bigint: 'BIGINT',
  bigserial: 'BIGSERIAL',

  // Decimal/Money types (precision-safe)
  decimal: 'DECIMAL',
  numeric: 'NUMERIC',
  money: 'MONEY',

  // Binary types
  bytea: 'BYTEA',
  binary: 'BYTEA',
  blob: 'BYTEA',

  // Boolean
  boolean: 'BOOLEAN',

  // Date/time types
  date: 'DATE',
  datetime: 'TIMESTAMPTZ',
  timestamp: 'TIMESTAMP',
  timestamptz: 'TIMESTAMPTZ',
  time: 'TIME',
  timetz: 'TIMETZ',
  interval: 'INTERVAL',

  // JSON types
  json: 'JSONB',
  jsonb: 'JSONB',
  array: 'JSONB',
  object: 'JSONB',

  // Reference type
  ref: 'UUID',
  enum: 'VARCHAR(50)',

  // PostGIS types
  point: 'POINT',
  geometry: 'GEOMETRY',
  geography: 'GEOGRAPHY',
};

/**
 * Convert a field to its PostgreSQL type with constraints
 */
export function fieldToPgType(field: AnalyzedField): string {
  // Handle primary key
  if (field.name === 'id' && field.type === 'uuid') {
    return 'UUID PRIMARY KEY DEFAULT gen_random_uuid()';
  }

  // Handle enums with CHECK constraint
  if (field.isEnum && field.enumValues?.length) {
    const values = field.enumValues.map((v) => `'${v}'`).join(', ');
    const baseType = `VARCHAR(${Math.max(...field.enumValues.map((v) => v.length)) + 10})`;
    return baseType;
  }

  // Handle arrays and objects
  if (field.isArray || field.isObject) {
    return 'JSONB';
  }

  // Handle refs (foreign keys)
  if (field.isRef) {
    return 'UUID';
  }

  // Handle string with max length
  if (field.type === 'string' && field.max) {
    return `VARCHAR(${field.max})`;
  }

  // Default type mapping
  return PG_TYPE_MAP[field.type] ?? 'TEXT';
}

/**
 * Generate PostgreSQL column definition with all constraints
 */
export function fieldToPgColumn(field: AnalyzedField): string {
  const parts: string[] = [];

  // Column name (quoted for safety)
  parts.push(`"${field.name}"`);

  // Base type
  parts.push(fieldToPgType(field));

  // NOT NULL constraint (skip for id and nullable fields)
  if (field.name !== 'id' && !field.nullable) {
    parts.push('NOT NULL');
  }

  // UNIQUE constraint (skip for id, handled separately)
  if (field.unique && field.name !== 'id') {
    parts.push('UNIQUE');
  }

  // DEFAULT value
  if (field.hasDefault && field.defaultValue !== undefined) {
    const defaultVal = formatDefaultValue(field.defaultValue, field);
    if (defaultVal !== null) {
      parts.push(`DEFAULT ${defaultVal}`);
    }
  }

  // CHECK constraint for enums
  if (field.isEnum && field.enumValues?.length) {
    const values = field.enumValues.map((v) => `'${escapeSqlString(v)}'`).join(', ');
    parts.push(`CHECK ("${field.name}" IN (${values}))`);
  }

  return parts.join(' ');
}

/**
 * Format a default value for PostgreSQL
 */
export function formatDefaultValue(value: unknown, field: AnalyzedField): string | null {
  if (value === undefined || value === null) {
    return field.nullable ? 'NULL' : null;
  }

  // String values
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  // Boolean values
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  // Number values
  if (typeof value === 'number') {
    return String(value);
  }

  // Object/array values (JSONB)
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }

  return null;
}

/**
 * Map RPC argument type to PostgreSQL type
 */
export function argTypeToPg(type: string): string {
  const typeMap: Record<string, string> = {
    uuid: 'UUID',
    string: 'TEXT',
    text: 'TEXT',
    int: 'INTEGER',
    integer: 'INTEGER',
    number: 'DOUBLE PRECISION',
    float: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMPTZ',
    json: 'JSONB',
    jsonb: 'JSONB',
  };
  return typeMap[type.toLowerCase()] ?? 'TEXT';
}

/**
 * Generate timestamp columns if timestamps are enabled
 */
export function generateTimestampColumns(): string[] {
  return [
    '"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    '"updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  ];
}
