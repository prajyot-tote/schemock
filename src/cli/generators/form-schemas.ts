/**
 * Form schema generator - generates Zod validation schemas, form defaults, and table column metadata
 *
 * @module cli/generators/form-schemas
 * @category CLI
 */

import type { AnalyzedSchema, AnalyzedField } from '../types';
import { CodeBuilder } from '../utils/code-builder';

/**
 * Generate form-related schemas and metadata for all entities
 *
 * @param schemas - Analyzed schemas
 * @returns Generated TypeScript code
 */
export function generateFormSchemas(schemas: AnalyzedSchema[]): string {
  const code = new CodeBuilder();

  code.line();
  code.comment('='.repeat(70));
  code.comment('FORM SCHEMAS - Zod validation, defaults, and column metadata');
  code.comment('='.repeat(70));
  code.line();

  // Import zod
  code.line("import { z } from 'zod';");
  code.line();

  // Generate for each non-junction schema
  for (const schema of schemas) {
    if (schema.isJunctionTable) continue;
    generateEntityFormSchemas(code, schema);
  }

  // Generate common column types
  generateColumnTypes(code);

  return code.toString();
}

/**
 * Generate form schemas for a single entity
 */
function generateEntityFormSchemas(code: CodeBuilder, schema: AnalyzedSchema): void {
  const { pascalName, fields } = schema;

  // Filter to creatable/updatable fields
  const formFields = fields.filter((f) => f.name !== 'id' && !f.readOnly && !f.isComputed);

  // ========== Zod Form Schema ==========
  code.multiDocComment([
    `Zod validation schema for ${pascalName} forms`,
    '',
    'Use with react-hook-form:',
    '```typescript',
    "import { useForm } from 'react-hook-form';",
    "import { zodResolver } from '@hookform/resolvers/zod';",
    '',
    'const form = useForm({',
    `  resolver: zodResolver(${pascalName}FormSchema),`,
    `  defaultValues: ${pascalName}FormDefaults,`,
    '});',
    '```',
  ]);
  code.block(`export const ${pascalName}FormSchema = z.object({`, () => {
    for (const field of formFields) {
      const zodType = fieldToZodType(field);
      code.line(`${field.name}: ${zodType},`);
    }
  }, '});');
  code.line();

  // ========== Form Default Values ==========
  code.docComment(`Default values for ${pascalName} form initialization`);
  code.block(`export const ${pascalName}FormDefaults: z.input<typeof ${pascalName}FormSchema> = {`, () => {
    for (const field of formFields) {
      const defaultValue = getFieldDefault(field);
      code.line(`${field.name}: ${defaultValue},`);
    }
  }, '};');
  code.line();

  // ========== Inferred Types ==========
  code.docComment(`Inferred type from ${pascalName}FormSchema`);
  code.line(`export type ${pascalName}FormData = z.infer<typeof ${pascalName}FormSchema>;`);
  code.line();

  // ========== Table Column Definitions ==========
  const tableFields = fields.filter((f) => !f.isComputed || f.name === 'id');

  code.docComment(`Table column definitions for ${pascalName}`);
  code.block(`export const ${pascalName}TableColumns: ColumnDef[] = [`, () => {
    for (const field of tableFields) {
      const columnDef = fieldToColumnDef(field);
      code.line(`${columnDef},`);
    }
  }, '];');
  code.line();

  // ========== Column Keys Type ==========
  const columnKeys = tableFields.map((f) => `'${f.name}'`).join(' | ');
  code.docComment(`Valid column keys for ${pascalName} table`);
  code.line(`export type ${pascalName}ColumnKey = ${columnKeys};`);
  code.line();
}

/**
 * Convert an AnalyzedField to a Zod type string
 */
function fieldToZodType(field: AnalyzedField): string {
  let zodType: string;

  // Handle enums
  if (field.isEnum && field.enumValues && field.enumValues.length > 0) {
    const enumLiterals = field.enumValues.map((v) => `'${v}'`).join(', ');
    zodType = `z.enum([${enumLiterals}])`;
  }
  // Handle arrays
  else if (field.isArray && field.itemType) {
    const itemZod = fieldToZodType(field.itemType);
    zodType = `z.array(${itemZod})`;
  }
  // Handle objects
  else if (field.isObject && field.shape) {
    const shapeFields = Object.entries(field.shape)
      .map(([key, f]) => `${key}: ${fieldToZodType(f)}`)
      .join(', ');
    zodType = `z.object({ ${shapeFields} })`;
  }
  // Handle refs (foreign keys) - typically UUID strings
  else if (field.isRef) {
    zodType = 'z.string().uuid()';
  }
  // Handle base types
  else {
    zodType = baseTypeToZod(field.type, field);
  }

  // Add constraints
  zodType = applyConstraints(zodType, field);

  // Handle nullable/optional
  if (field.nullable) {
    zodType = `${zodType}.nullable()`;
  }
  if (field.hasDefault) {
    zodType = `${zodType}.optional()`;
  }

  return zodType;
}

/**
 * Convert base field type to Zod type
 */
function baseTypeToZod(type: string, field: AnalyzedField): string {
  const lowerType = type.toLowerCase();

  // String types
  if (
    ['string', 'text', 'varchar', 'char', 'uuid', 'citext'].includes(lowerType) ||
    lowerType.startsWith('varchar')
  ) {
    if (lowerType === 'uuid') {
      return 'z.string().uuid()';
    }
    return 'z.string()';
  }

  // Email (from semantic types)
  if (lowerType === 'email' || field.type.includes('email')) {
    return 'z.string().email()';
  }

  // URL (from semantic types)
  if (lowerType === 'url' || field.type.includes('url')) {
    return 'z.string().url()';
  }

  // Integer types
  if (['int', 'integer', 'smallint', 'serial', 'smallserial'].includes(lowerType)) {
    return 'z.number().int()';
  }

  // BigInt types
  if (['bigint', 'bigserial'].includes(lowerType)) {
    return 'z.bigint()';
  }

  // Float types
  if (['float', 'double', 'real', 'double precision'].includes(lowerType)) {
    return 'z.number()';
  }

  // Decimal types (return as string for precision)
  if (['decimal', 'numeric', 'money'].includes(lowerType)) {
    return 'z.string().regex(/^-?\\d+(\\.\\d+)?$/, "Must be a valid decimal number")';
  }

  // Boolean
  if (['boolean', 'bool'].includes(lowerType)) {
    return 'z.boolean()';
  }

  // Date/time types
  if (['date', 'datetime', 'timestamp', 'timestamptz'].includes(lowerType)) {
    return 'z.coerce.date()';
  }

  // Time types (keep as string)
  if (['time', 'timetz', 'interval'].includes(lowerType)) {
    return 'z.string()';
  }

  // JSON types
  if (['json', 'jsonb'].includes(lowerType)) {
    return 'z.unknown()';
  }

  // Fallback - check TypeScript type
  switch (field.tsType) {
    case 'string':
      return 'z.string()';
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'Date':
      return 'z.coerce.date()';
    case 'bigint':
      return 'z.bigint()';
    default:
      return 'z.unknown()';
  }
}

/**
 * Apply constraints (min, max, pattern) to Zod type
 */
function applyConstraints(zodType: string, field: AnalyzedField): string {
  const constraints: string[] = [];

  // String constraints
  if (field.tsType === 'string' || field.type === 'string' || field.type === 'text') {
    if (field.min !== undefined) {
      constraints.push(`.min(${field.min})`);
    }
    if (field.max !== undefined) {
      constraints.push(`.max(${field.max})`);
    }
    if (field.pattern) {
      // Escape the pattern for use in generated code
      const escapedPattern = field.pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      constraints.push(`.regex(/${escapedPattern}/)`);
    }
  }

  // Number constraints
  if (field.tsType === 'number' || field.type === 'number' || field.type === 'int') {
    if (field.min !== undefined) {
      constraints.push(`.min(${field.min})`);
    }
    if (field.max !== undefined) {
      constraints.push(`.max(${field.max})`);
    }
  }

  // Add required message for non-nullable, non-default fields
  if (!field.nullable && !field.hasDefault) {
    // Only add min(1) for strings that don't already have a min constraint
    if (
      (field.tsType === 'string' || field.type === 'string') &&
      field.min === undefined &&
      !zodType.includes('.email()') &&
      !zodType.includes('.url()') &&
      !zodType.includes('.uuid()')
    ) {
      constraints.push(`.min(1, '${formatFieldName(field.name)} is required')`);
    }
  }

  return zodType + constraints.join('');
}

/**
 * Get default value for a field
 */
function getFieldDefault(field: AnalyzedField): string {
  // Use explicit default if provided
  if (field.hasDefault && field.defaultValue !== undefined) {
    return formatDefaultValue(field.defaultValue, field);
  }

  // Generate sensible defaults
  if (field.isEnum && field.enumValues && field.enumValues.length > 0) {
    // Return undefined to let user select, or first value
    return `'${field.enumValues[0]}'`;
  }

  if (field.isArray) {
    return '[]';
  }

  if (field.isObject && field.shape) {
    const shapeDefaults = Object.entries(field.shape)
      .map(([key, f]) => `${key}: ${getFieldDefault(f)}`)
      .join(', ');
    return `{ ${shapeDefaults} }`;
  }

  if (field.isRef) {
    return "''"; // Empty string, user must select
  }

  if (field.nullable) {
    return 'null';
  }

  // Type-based defaults
  switch (field.tsType) {
    case 'string':
      return "''";
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'Date':
      return 'new Date()';
    case 'bigint':
      return 'BigInt(0)';
    default:
      return 'undefined';
  }
}

/**
 * Format a default value for code output
 */
function formatDefaultValue(value: unknown, field: AnalyzedField): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'bigint') {
    return `BigInt(${value})`;
  }

  if (value instanceof Date) {
    return `new Date('${value.toISOString()}')`;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return 'undefined';
}

/**
 * Convert a field to table column definition
 */
function fieldToColumnDef(field: AnalyzedField): string {
  const parts: string[] = [];

  // Key
  parts.push(`key: '${field.name}'`);

  // Label (convert camelCase to Title Case)
  parts.push(`label: '${formatFieldName(field.name)}'`);

  // Type for rendering/alignment
  const columnType = getColumnType(field);
  parts.push(`type: '${columnType}'`);

  // Sortable (most fields are sortable except computed and complex types)
  const sortable = !field.isComputed && !field.isObject && !field.isArray;
  parts.push(`sortable: ${sortable}`);

  // Filterable
  const filterable = !field.isComputed && !field.isObject;
  parts.push(`filterable: ${filterable}`);

  // Hidden by default for certain fields
  const hidden =
    field.name === 'id' ||
    field.name.endsWith('Id') ||
    field.name === 'createdAt' ||
    field.name === 'updatedAt';
  if (hidden) {
    parts.push(`hidden: true`);
  }

  return `{ ${parts.join(', ')} }`;
}

/**
 * Get column type for table rendering
 */
function getColumnType(field: AnalyzedField): string {
  if (field.isEnum) return 'enum';
  if (field.isArray) return 'array';
  if (field.isObject) return 'object';
  if (field.isRef) return 'ref';

  const lowerType = field.type.toLowerCase();

  if (['boolean', 'bool'].includes(lowerType)) return 'boolean';
  if (['date', 'datetime', 'timestamp', 'timestamptz'].includes(lowerType)) return 'date';
  if (['time', 'timetz'].includes(lowerType)) return 'time';
  if (
    ['number', 'int', 'integer', 'float', 'double', 'decimal', 'numeric', 'money', 'bigint'].includes(
      lowerType
    )
  )
    return 'number';
  // Also check tsType for number
  if (field.tsType === 'number') return 'number';
  if (lowerType === 'email' || field.type.includes('email')) return 'email';
  if (lowerType === 'url' || field.type.includes('url')) return 'url';
  if (lowerType === 'uuid') return 'id';

  return 'text';
}

/**
 * Format field name to human-readable label
 * camelCase -> Title Case
 */
function formatFieldName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .trim();
}

/**
 * Generate common column definition types
 */
function generateColumnTypes(code: CodeBuilder): void {
  code.comment('='.repeat(70));
  code.comment('COLUMN TYPES');
  code.comment('='.repeat(70));
  code.line();

  code.docComment('Column type for table rendering and behavior');
  code.line(
    "export type ColumnType = 'text' | 'number' | 'boolean' | 'date' | 'time' | 'email' | 'url' | 'id' | 'enum' | 'ref' | 'array' | 'object';"
  );
  code.line();

  code.docComment('Table column definition');
  code.block('export interface ColumnDef {', () => {
    code.line('/** Field key in the data object */');
    code.line('key: string;');
    code.line('/** Display label for column header */');
    code.line('label: string;');
    code.line('/** Column type for rendering and alignment */');
    code.line('type: ColumnType;');
    code.line('/** Whether column is sortable */');
    code.line('sortable: boolean;');
    code.line('/** Whether column is filterable */');
    code.line('filterable: boolean;');
    code.line('/** Whether column is hidden by default */');
    code.line('hidden?: boolean;');
    code.line('/** Custom width (CSS value) */');
    code.line('width?: string;');
    code.line('/** Custom render function name */');
    code.line('render?: string;');
  });
  code.line();
}
