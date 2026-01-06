/**
 * PGlite database schema generator
 *
 * Generates SQL schema and TypeScript initialization code for PGlite
 *
 * @module cli/generators/pglite/db
 * @category CLI
 */

import type { AnalyzedSchema, AnalyzedField, PGliteAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

/**
 * Map Schemock field types to PostgreSQL types
 */
function mapToPostgresType(field: AnalyzedField): string {
  // Handle special cases first
  if (field.name === 'id') return 'UUID PRIMARY KEY DEFAULT gen_random_uuid()';

  // Handle enums
  if (field.isEnum && field.enumValues?.length) {
    const enumValues = field.enumValues.map((v) => `'${v}'`).join(', ');
    return `TEXT CHECK (${field.name} IN (${enumValues}))`;
  }

  // Handle arrays and objects as JSONB
  if (field.isArray || field.isObject) {
    return field.nullable ? 'JSONB' : 'JSONB NOT NULL';
  }

  // Handle refs (foreign keys)
  if (field.isRef) {
    return field.nullable ? 'UUID' : 'UUID NOT NULL';
  }

  // Map base types
  let pgType: string;
  switch (field.type) {
    case 'uuid':
      pgType = 'UUID';
      break;
    case 'string':
    case 'text':
      pgType = 'TEXT';
      break;
    case 'email':
      pgType = 'TEXT';
      break;
    case 'url':
      pgType = 'TEXT';
      break;
    case 'number':
    case 'float':
      pgType = 'DOUBLE PRECISION';
      break;
    case 'int':
    case 'integer':
      pgType = 'INTEGER';
      break;
    case 'boolean':
      pgType = 'BOOLEAN';
      break;
    case 'date':
    case 'datetime':
      pgType = 'TIMESTAMPTZ';
      break;
    case 'json':
      pgType = 'JSONB';
      break;
    default:
      pgType = 'TEXT';
  }

  // Add constraints
  const constraints: string[] = [];

  if (!field.nullable && field.name !== 'id') {
    constraints.push('NOT NULL');
  }

  if (field.unique) {
    constraints.push('UNIQUE');
  }

  if (field.hasDefault && field.defaultValue !== undefined) {
    const defaultVal = formatDefaultValue(field);
    if (defaultVal) {
      constraints.push(`DEFAULT ${defaultVal}`);
    }
  }

  return constraints.length > 0 ? `${pgType} ${constraints.join(' ')}` : pgType;
}

/**
 * Format default value for SQL
 */
function formatDefaultValue(field: AnalyzedField): string | null {
  const val = field.defaultValue;

  if (val === null) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;

  return null;
}

/**
 * Generate CREATE TABLE statement for a schema
 */
function generateCreateTable(schema: AnalyzedSchema): string {
  const lines: string[] = [`CREATE TABLE IF NOT EXISTS "${schema.tableName}" (`];

  // Add columns
  const columns: string[] = [];
  for (const field of schema.fields) {
    const pgType = mapToPostgresType(field);
    columns.push(`  "${field.name}" ${pgType}`);
  }

  lines.push(columns.join(',\n'));
  lines.push(');');

  return lines.join('\n');
}

/**
 * Generate foreign key constraints (after all tables exist)
 */
function generateForeignKeys(schema: AnalyzedSchema, allSchemas: AnalyzedSchema[]): string[] {
  const fks: string[] = [];

  for (const field of schema.fields) {
    if (field.isRef && field.refTarget) {
      const targetSchema = allSchemas.find((s) => s.name === field.refTarget);
      if (targetSchema) {
        fks.push(
          `ALTER TABLE "${schema.tableName}" ADD CONSTRAINT "fk_${schema.tableName}_${field.name}" ` +
            `FOREIGN KEY ("${field.name}") REFERENCES "${targetSchema.tableName}"("id") ON DELETE CASCADE;`
        );
      }
    }
  }

  return fks;
}

/**
 * Generate indexes for unique fields
 */
function generateIndexes(schema: AnalyzedSchema): string[] {
  const indexes: string[] = [];

  for (const field of schema.fields) {
    // Create index for foreign keys
    if (field.isRef) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS "idx_${schema.tableName}_${field.name}" ON "${schema.tableName}"("${field.name}");`
      );
    }
  }

  return indexes;
}

/**
 * Generate RLS policies for a schema (generic context-based)
 */
function generateRLSPolicies(schema: AnalyzedSchema): string[] {
  const { tableName, rls } = schema;
  const policies: string[] = [];

  if (!rls.enabled) {
    return policies;
  }

  // Enable RLS on the table
  policies.push(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
  policies.push(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY;`);

  // Generate policies based on configuration
  const operations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
  const opHas = {
    SELECT: rls.hasSelect,
    INSERT: rls.hasInsert,
    UPDATE: rls.hasUpdate,
    DELETE: rls.hasDelete,
  };

  for (const op of operations) {
    if (!opHas[op]) continue;

    // Check for custom SQL policy first
    const opLower = op.toLowerCase() as 'select' | 'insert' | 'update' | 'delete';
    const customSql = rls.sql?.[opLower];

    if (customSql) {
      // Use custom SQL policy
      policies.push(
        `CREATE POLICY "${tableName}_${opLower}_policy" ON "${tableName}" FOR ${op} USING (${customSql});`
      );
    } else if (rls.scope.length > 0) {
      // Generate policy from scope mappings
      const conditions: string[] = [];

      // Add bypass conditions first
      for (const bypass of rls.bypass) {
        const valuesStr = bypass.values.map((v) => `'${v}'`).join(', ');
        conditions.push(`current_setting('app.${bypass.contextKey}', true) IN (${valuesStr})`);
      }

      // Add scope conditions
      for (const mapping of rls.scope) {
        // row.field = current_setting('app.contextKey')
        conditions.push(`"${mapping.field}" = current_setting('app.${mapping.contextKey}', true)::uuid`);
      }

      const condition = conditions.length > 1
        ? conditions.map((c, i) => i === 0 && rls.bypass.length > 0 ? c : `(${c})`).join(' OR ')
        : conditions[0] || 'true';

      policies.push(
        `CREATE POLICY "${tableName}_${opLower}_policy" ON "${tableName}" FOR ${op} USING (${condition});`
      );
    }
  }

  return policies;
}

/**
 * Generate PGlite database initialization code
 *
 * @param schemas - Analyzed schemas
 * @param config - PGlite adapter configuration
 * @returns Generated TypeScript code
 */
export function generatePGliteDb(schemas: AnalyzedSchema[], config: PGliteAdapterConfig): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { PGlite } from '@electric-sql/pglite';");
  code.line();

  // Storage option
  const storage = config.persistence === 'memory' ? undefined : config.dataDir || 'idb://schemock-db';

  code.comment('Database instance');
  if (storage) {
    code.line(`export const db = new PGlite('${storage}');`);
  } else {
    code.line('export const db = new PGlite();');
  }
  code.line();

  // Generate SQL schema
  code.comment('SQL Schema');
  code.line('const schema = `');

  // Enable UUID extension
  code.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  code.raw('');

  // Create tables in dependency order
  for (const schema of schemas) {
    code.raw(generateCreateTable(schema));
    code.raw('');
  }

  // Add foreign keys
  const allFKs: string[] = [];
  for (const schema of schemas) {
    allFKs.push(...generateForeignKeys(schema, schemas));
  }
  if (allFKs.length > 0) {
    code.raw('-- Foreign Keys');
    for (const fk of allFKs) {
      code.raw(fk);
    }
    code.raw('');
  }

  // Add indexes
  const allIndexes: string[] = [];
  for (const schema of schemas) {
    allIndexes.push(...generateIndexes(schema));
  }
  if (allIndexes.length > 0) {
    code.raw('-- Indexes');
    for (const idx of allIndexes) {
      code.raw(idx);
    }
    code.raw('');
  }

  // Add RLS policies
  const allPolicies: string[] = [];
  for (const schema of schemas) {
    allPolicies.push(...generateRLSPolicies(schema));
  }
  if (allPolicies.length > 0) {
    code.raw('-- Row-Level Security Policies');
    for (const policy of allPolicies) {
      code.raw(policy);
    }
  }

  code.line('`;');
  code.line();

  // Initialize function
  code.comment('Initialize database schema');
  code.line('let initialized = false;');
  code.line();
  code.block('export async function initDb(): Promise<void> {', () => {
    code.line('if (initialized) return;');
    code.line('await db.exec(schema);');
    code.line('initialized = true;');
  });
  code.line();

  // Reset function
  code.comment('Reset database (drop and recreate all tables)');
  code.block('export async function resetDb(): Promise<void> {', () => {
    code.line('const dropSql = [');
    for (const schema of [...schemas].reverse()) {
      code.line(`  'DROP TABLE IF EXISTS "${schema.tableName}" CASCADE',`);
    }
    code.line('].join(";\\n");');
    code.line();
    code.line('await db.exec(dropSql);');
    code.line('initialized = false;');
    code.line('await initDb();');
  });
  code.line();

  // Export table names
  code.comment('Table name mapping');
  code.block('export const tables = {', () => {
    for (const schema of schemas) {
      code.line(`${schema.name}: '${schema.tableName}',`);
    }
  }, '} as const;');
  code.line();

  code.line('export type TableName = keyof typeof tables;');
  code.line();

  // Check if any schema has RLS enabled
  const hasRLS = schemas.some((s) => s.rls.enabled);
  if (hasRLS) {
    generateRLSHelpers(code);
  }

  return code.toString();
}

/**
 * Generate RLS helper functions (generic context-based)
 */
function generateRLSHelpers(code: CodeBuilder): void {
  code.comment('Row-Level Security Context (generic key-value)');
  code.block('export interface RLSContext {', () => {
    code.line('[key: string]: unknown;');
  }, '}');
  code.line();

  code.comment('Set context for RLS (sets PostgreSQL session variables)');
  code.block('export async function setContext(ctx: RLSContext | null): Promise<void> {', () => {
    code.block('if (ctx) {', () => {
      code.block('for (const [key, value] of Object.entries(ctx)) {', () => {
        code.line("if (value !== undefined && value !== null) {");
        code.line("  await db.exec(`SET LOCAL app.${key} = '${value}'`);");
        code.line('}');
      });
    }, '} else {');
    code.indent();
    code.comment('Reset all app.* settings would require knowing which keys were set');
    code.comment('For simplicity, start a new transaction instead');
    code.dedent();
    code.line('}');
  });
  code.line();

  code.comment('Execute a function with context (transaction-scoped)');
  code.block('export async function withContext<T>(ctx: RLSContext, fn: () => Promise<T>): Promise<T> {', () => {
    code.line("await db.exec('BEGIN');");
    code.block('try {', () => {
      code.line('await setContext(ctx);');
      code.line('const result = await fn();');
      code.line("await db.exec('COMMIT');");
      code.line('return result;');
    }, '} catch (e) {');
    code.indent();
    code.line("await db.exec('ROLLBACK');");
    code.line('throw e;');
    code.dedent();
    code.line('}');
  });
  code.line();

  code.comment('RLS Error class');
  code.block('export class RLSError extends Error {', () => {
    code.line("readonly code = 'RLS_DENIED';");
    code.block('constructor(message: string) {', () => {
      code.line('super(message);');
      code.line("this.name = 'RLSError';");
    });
  }, '}');
}
