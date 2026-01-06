/**
 * SQL Generator Orchestrator
 *
 * Combines all SQL generators into a unified output
 *
 * @module cli/generators/sql
 * @category CLI
 */

import type { AnalyzedSchema, SQLGeneratorResult, GenerateSQLOptions } from '../../types';
import { generateTables, generateForeignKeys, generateTriggers } from './tables';
import { generateIndexes, countIndexes, getIndexSummary } from './indexes';
import { generateRLSPolicies, countRLSPolicies, getRLSSummary } from './rls';
import { generateFunctions, countFunctions, getFunctionSummary } from './functions';

// Re-export individual generators
export { generateTables, generateForeignKeys, generateTriggers } from './tables';
export { generateIndexes, countIndexes, getIndexSummary } from './indexes';
export { generateRLSPolicies, countRLSPolicies, getRLSSummary } from './rls';
export { generateFunctions, countFunctions, getFunctionSummary } from './functions';
export { fieldToPgType, fieldToPgColumn, PG_TYPE_MAP } from './pg-types';

/**
 * Generate all SQL files
 */
export function generateSQL(
  schemas: AnalyzedSchema[],
  options: GenerateSQLOptions = {}
): SQLGeneratorResult {
  const target = options.target ?? 'postgres';
  const only = options.only;

  // Determine which sections to generate
  const includeTables = !only || only.includes('tables');
  const includeForeignKeys = !only || only.includes('foreign-keys');
  const includeIndexes = !only || only.includes('indexes');
  const includeRLS = !only || only.includes('rls');
  const includeFunctions = !only || only.includes('functions');
  const includeTriggers = !only || only.includes('triggers');

  // Generate individual sections
  const tables = includeTables ? generateTables(schemas) : '';
  const foreignKeys = includeForeignKeys ? generateForeignKeys(schemas) : '';
  const indexes = includeIndexes ? generateIndexes(schemas) : '';
  const rls = includeRLS ? generateRLSPolicies(schemas, target) : '';
  const functions = includeFunctions ? generateFunctions(schemas) : '';
  const triggers = includeTriggers ? generateTriggers(schemas) : '';

  // Count totals for summary
  const fkCount = schemas.reduce((sum, s) => {
    return sum + s.fields.filter((f) => f.isRef).length;
  }, 0);

  const triggerCount = schemas.filter((s) => s.hasTimestamps).length;

  const summary = {
    tables: schemas.length,
    foreignKeys: fkCount,
    indexes: countIndexes(schemas),
    rlsPolicies: countRLSPolicies(schemas),
    functions: countFunctions(schemas),
    triggers: triggerCount,
  };

  if (options.combined) {
    // Generate combined single file
    const combined = generateCombinedSQL({
      tables,
      foreignKeys,
      indexes,
      rls,
      functions,
      triggers,
    });

    return { combined, summary };
  } else {
    // Return separate files
    return {
      files: {
        tables,
        foreignKeys,
        indexes,
        rls,
        functions,
        triggers,
      },
      summary,
    };
  }
}

/**
 * Generate combined SQL file
 */
function generateCombinedSQL(sections: {
  tables: string;
  foreignKeys: string;
  indexes: string;
  rls: string;
  functions: string;
  triggers: string;
}): string {
  const parts: string[] = [
    '-- ============================================================================',
    '-- Schemock Generated SQL Schema',
    `-- Generated at: ${new Date().toISOString()}`,
    '-- ============================================================================',
    '',
    '-- This file contains the complete database schema including:',
    '-- - Table definitions',
    '-- - Foreign key constraints',
    '-- - Indexes',
    '-- - Row-Level Security (RLS) policies',
    '-- - Stored procedures (RPC functions)',
    '-- - Triggers',
    '',
    '-- To apply this schema:',
    '-- psql -d your_database -f schema.sql',
    '',
    '-- For Supabase:',
    '-- supabase migration new schema && copy this to the migration file',
    '',
    '\\echo \'Starting schema creation...\'',
    '',
  ];

  // Add each section
  if (sections.tables.trim()) {
    parts.push(sections.tables);
    parts.push('');
  }

  if (sections.foreignKeys.trim()) {
    parts.push(sections.foreignKeys);
    parts.push('');
  }

  if (sections.indexes.trim()) {
    parts.push(sections.indexes);
    parts.push('');
  }

  if (sections.triggers.trim()) {
    parts.push(sections.triggers);
    parts.push('');
  }

  if (sections.rls.trim()) {
    parts.push(sections.rls);
    parts.push('');
  }

  if (sections.functions.trim()) {
    parts.push(sections.functions);
    parts.push('');
  }

  parts.push('\\echo \'Schema creation complete!\'');
  parts.push('');

  return parts.join('\n');
}

/**
 * Get comprehensive summary for README generation
 */
export function getSQLSummary(schemas: AnalyzedSchema[]): {
  tables: Array<{ name: string; columns: number; hasTimestamps: boolean; hasRLS: boolean }>;
  indexes: ReturnType<typeof getIndexSummary>;
  rls: ReturnType<typeof getRLSSummary>;
  functions: ReturnType<typeof getFunctionSummary>;
  foreignKeys: Array<{ table: string; column: string; references: string }>;
} {
  // Table summary
  const tables = schemas.map((s) => ({
    name: s.tableName,
    columns: s.fields.length + (s.hasTimestamps ? 2 : 0),
    hasTimestamps: s.hasTimestamps,
    hasRLS: s.rls.enabled,
  }));

  // Foreign key summary
  const foreignKeys: Array<{ table: string; column: string; references: string }> = [];
  const schemaMap = new Map(schemas.map((s) => [s.name, s]));

  for (const schema of schemas) {
    for (const field of schema.fields) {
      if (field.isRef && field.refTarget) {
        const targetSchema = schemaMap.get(field.refTarget);
        foreignKeys.push({
          table: schema.tableName,
          column: field.name,
          references: targetSchema?.tableName ?? field.refTarget,
        });
      }
    }
  }

  return {
    tables,
    indexes: getIndexSummary(schemas),
    rls: getRLSSummary(schemas),
    functions: getFunctionSummary(schemas),
    foreignKeys,
  };
}
