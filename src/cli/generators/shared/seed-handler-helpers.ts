/**
 * Seed Handler Generation Helpers
 *
 * Shared utilities for generating seed handler code across different server targets
 * (node-handlers, nextjs-api, supabase-edge, neon).
 *
 * @module cli/generators/shared/seed-handler-helpers
 * @category CLI
 */

import type { AnalyzedSchema, SchemockConfig, GenerationTarget } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';
import { toSafePropertyName } from '../../utils/pluralize';

/**
 * Backend types supported for seed handlers
 */
export type SeedBackend = 'supabase' | 'firebase' | 'neon' | 'pglite' | 'fetch';

/**
 * Emit the seed reference resolution helpers (isSeedReference, resolveRef, resolveItem)
 * into the generated seed handler.
 *
 * These are the same helpers used in the Mock/PGlite seed.ts files.
 */
export function emitSeedRefHelpers(code: CodeBuilder): void {
  code.comment('Seed reference resolution helpers');
  code.line("const SEED_REF_BRAND = '__schemock_seed_ref__';");
  code.line();

  // isSeedReference
  code.block('function isSeedReference(value: unknown): boolean {', () => {
    code.line('return (');
    code.line("  typeof value === 'object' &&");
    code.line('  value !== null &&');
    code.line('  SEED_REF_BRAND in value &&');
    code.line('  (value as Record<string, unknown>)[SEED_REF_BRAND] === true');
    code.line(');');
  });
  code.line();

  // resolveRef — resolves a single ref or lookup marker
  code.block(
    'function resolveRef(marker: Record<string, unknown>, createdRecords: Map<string, Record<string, unknown>[]>): unknown {',
    () => {
      code.line('const entity = marker.entity as string;');
      code.line('const field = marker.field as string;');
      code.line('const records = createdRecords.get(entity);');
      code.line();

      // ref type
      code.block("if (marker.type === 'ref') {", () => {
        code.line('const index = marker.index as number;');
        code.block('if (!records || records.length <= index) {', () => {
          code.line(
            "throw new Error(`Seed ref error: entity '${entity}' has ${records?.length ?? 0} records, but ref() requested index ${index}`);"
          );
        });
        code.line('return records[index][field];');
      });
      code.line();

      // lookup type
      code.block("if (marker.type === 'lookup') {", () => {
        code.line('const where = marker.where as Record<string, unknown>;');
        code.block('if (!records) {', () => {
          code.line(
            "throw new Error(`Seed lookup error: entity '${entity}' has no records yet. Ensure it is seeded before entities that reference it.`);"
          );
        });
        code.line('const match = records.find((r) => {');
        code.line('  return Object.entries(where).every(([k, v]) => r[k] === v);');
        code.line('});');
        code.block('if (!match) {', () => {
          code.line(
            "throw new Error(`Seed lookup error: no '${entity}' record matches ${JSON.stringify(where)}`);"
          );
        });
        code.line('return match[field];');
      });
      code.line();

      code.line('throw new Error(`Unknown seed reference type: ${String(marker.type)}`);');
    }
  );
  code.line();

  // resolveItem — clones an item, replacing any markers with resolved values
  code.block(
    'function resolveItem(item: Record<string, unknown>, createdRecords: Map<string, Record<string, unknown>[]>, entityName: string): Record<string, unknown> {',
    () => {
      code.line('const resolved: Record<string, unknown> = {};');
      code.block('for (const [key, value] of Object.entries(item)) {', () => {
        code.block('if (isSeedReference(value)) {', () => {
          code.line('resolved[key] = resolveRef(value as Record<string, unknown>, createdRecords);');
        }, '} else {');
        code.indent();
        code.line('resolved[key] = value;');
        code.dedent();
        code.line('}');
      });
      code.line('return resolved;');
    }
  );
  code.line();
}

/**
 * Emit the entityOrder constant and tableNameMap for seed handlers
 */
export function emitEntityOrderAndTableMap(code: CodeBuilder, schemas: AnalyzedSchema[]): void {
  // Entity order (topologically sorted by dependencies)
  code.comment('Entity insertion order (topologically sorted by dependencies)');
  const names = schemas
    .filter((s) => !s.isJunctionTable)
    .map((s) => `'${toSafePropertyName(s.name)}'`);
  code.line(`const entityOrder: string[] = [${names.join(', ')}];`);
  code.line();

  // Table name mapping
  code.comment('Table name to entity name mapping');
  code.block('const tableNameMap: Record<string, string> = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      const safeName = toSafePropertyName(schema.name);
      code.line(`${safeName}: '${schema.tableName}',`);
    }
  }, '};');
  code.line();
}

/**
 * Emit the SeedResult and ProductionSeedData types
 */
export function emitSeedTypes(code: CodeBuilder): void {
  code.multiDocComment([
    'Result of a production seed operation.',
  ]);
  code.block('interface SeedResult {', () => {
    code.line('success: boolean;');
    code.line("error?: 'INVALID_SECRET' | 'ALREADY_SEEDED' | 'MISSING_SECRET';");
    code.line('seededAt?: Date;');
  });
  code.line();

  code.multiDocComment([
    'Configuration for production seed data.',
  ]);
  code.block('interface ProductionSeedData {', () => {
    code.line('secret: string;');
    code.line('data: Record<string, Record<string, unknown>[]>;');
  });
  code.line();
}

/**
 * Get the relative import path for the seed data file
 */
export function getSeedDataImportPath(
  config: SchemockConfig,
  targetOutputDepth: number
): string {
  const dataPath = config.productionSeed?.dataPath || './src/seed-data.ts';
  // Remove the .ts extension and ./
  const cleanPath = dataPath.replace(/^\.\//, '').replace(/\.ts$/, '');
  // Calculate relative path from output directory
  const dots = '../'.repeat(targetOutputDepth);
  return `${dots}${cleanPath}`;
}

/**
 * Emit the escapeSQL helper function for SQL-based backends
 */
export function emitEscapeSQL(code: CodeBuilder): void {
  code.comment('Escape SQL string values');
  code.block('function escapeSQL(value: unknown): string {', () => {
    code.line('if (value === null || value === undefined) return "NULL";');
    code.line('if (typeof value === "boolean") return value ? "TRUE" : "FALSE";');
    code.line('if (typeof value === "number") return String(value);');
    code.line('if (value instanceof Date) return `\'${value.toISOString()}\'`;');
    code.line('if (typeof value === "object") return `\'${JSON.stringify(value).replace(/\'/g, "\'\'")}\'::jsonb`;');
    code.line('return `\'${String(value).replace(/\'/g, "\'\'")}\'`;');
  });
  code.line();
}

/**
 * Generate the kill switch check logic for Supabase backend
 */
export function emitSupabaseKillSwitchHelpers(code: CodeBuilder): void {
  code.comment('Kill switch helpers (uses _schemock_meta table)');
  code.line();

  // ensureMetaTable
  code.block('async function ensureMetaTable(): Promise<void> {', () => {
    code.comment('Create meta table if not exists (relies on RLS being disabled for this table)');
    code.line('const { error } = await supabase.rpc(\'exec_sql\', {');
    code.line("  sql: `CREATE TABLE IF NOT EXISTS \"_schemock_meta\" (");
    code.line('    \"key\" TEXT PRIMARY KEY,');
    code.line('    \"value\" TEXT NOT NULL,');
    code.line('    \"created_at\" TIMESTAMPTZ DEFAULT NOW()');
    code.line('  )`');
    code.line('}).maybeSingle();');
    code.comment('Ignore error if function doesn\'t exist - table may already exist');
    code.line('if (error && !error.message?.includes(\'does not exist\')) {');
    code.line('  console.warn(\'Could not ensure _schemock_meta table:\', error.message);');
    code.line('}');
  });
  code.line();

  // isSeeded
  code.block('async function isSeeded(): Promise<boolean> {', () => {
    code.line('const { data } = await supabase');
    code.line("  .from('_schemock_meta')");
    code.line("  .select('value')");
    code.line("  .eq('key', 'seeded_at')");
    code.line('  .maybeSingle();');
    code.line('return !!data;');
  });
  code.line();

  // getSeededAt
  code.block('async function getSeededAt(): Promise<Date | null> {', () => {
    code.line('const { data } = await supabase');
    code.line("  .from('_schemock_meta')");
    code.line("  .select('value')");
    code.line("  .eq('key', 'seeded_at')");
    code.line('  .maybeSingle();');
    code.line('if (!data) return null;');
    code.line('return new Date(parseInt(data.value, 10));');
  });
  code.line();

  // setSeeded
  code.block('async function setSeeded(): Promise<void> {', () => {
    code.line('const now = Date.now().toString();');
    code.line('await supabase');
    code.line("  .from('_schemock_meta')");
    code.line("  .upsert({ key: 'seeded_at', value: now }, { onConflict: 'key' });");
  });
  code.line();
}

/**
 * Generate the kill switch check logic for Neon backend (raw SQL)
 */
export function emitNeonKillSwitchHelpers(code: CodeBuilder): void {
  code.comment('Kill switch helpers (uses _schemock_meta table)');
  code.line();

  // ensureMetaTable
  code.block('async function ensureMetaTable(): Promise<void> {', () => {
    code.line('await sql`');
    code.line('  CREATE TABLE IF NOT EXISTS "_schemock_meta" (');
    code.line('    "key" TEXT PRIMARY KEY,');
    code.line('    "value" TEXT NOT NULL,');
    code.line('    "created_at" TIMESTAMPTZ DEFAULT NOW()');
    code.line('  )');
    code.line('`;');
  });
  code.line();

  // isSeeded
  code.block('async function isSeeded(): Promise<boolean> {', () => {
    code.line('await ensureMetaTable();');
    code.line("const result = await sql`SELECT \"value\" FROM \"_schemock_meta\" WHERE \"key\" = 'seeded_at'`;");
    code.line('return result.rows.length > 0;');
  });
  code.line();

  // getSeededAt
  code.block('async function getSeededAt(): Promise<Date | null> {', () => {
    code.line("const result = await sql`SELECT \"value\" FROM \"_schemock_meta\" WHERE \"key\" = 'seeded_at'`;");
    code.line('if (result.rows.length === 0) return null;');
    code.line('return new Date(parseInt((result.rows[0] as { value: string }).value, 10));');
  });
  code.line();

  // setSeeded
  code.block('async function setSeeded(): Promise<void> {', () => {
    code.line('const now = Date.now().toString();');
    code.line('await sql`');
    code.line("  INSERT INTO \"_schemock_meta\" (\"key\", \"value\") VALUES ('seeded_at', ${now})");
    code.line("  ON CONFLICT (\"key\") DO UPDATE SET \"value\" = ${now}");
    code.line('`;');
  });
  code.line();
}

/**
 * Generate the kill switch check logic for Firebase backend
 */
export function emitFirebaseKillSwitchHelpers(code: CodeBuilder): void {
  code.comment('Kill switch helpers (uses _schemock_meta collection)');
  code.line();

  // isSeeded
  code.block('async function isSeeded(): Promise<boolean> {', () => {
    code.line("const doc = await db.collection('_schemock_meta').doc('seed').get();");
    code.line("return doc.exists && !!doc.data()?.seededAt;");
  });
  code.line();

  // getSeededAt
  code.block('async function getSeededAt(): Promise<Date | null> {', () => {
    code.line("const doc = await db.collection('_schemock_meta').doc('seed').get();");
    code.line("if (!doc.exists || !doc.data()?.seededAt) return null;");
    code.line("return new Date(doc.data()!.seededAt);");
  });
  code.line();

  // setSeeded
  code.block('async function setSeeded(): Promise<void> {', () => {
    code.line("await db.collection('_schemock_meta').doc('seed').set({");
    code.line('  seededAt: Date.now(),');
    code.line('  updatedAt: new Date().toISOString(),');
    code.line('});');
  });
  code.line();
}

/**
 * Generate the INSERT logic for Supabase backend
 */
export function emitSupabaseInsertLogic(code: CodeBuilder): void {
  code.block('for (const entity of orderedEntities) {', () => {
    code.line('const items = seedConfig.data[entity];');
    code.line('const tableName = tableNameMap[entity];');
    code.block('if (!tableName) {', () => {
      code.line('console.warn(`Unknown entity in seed data: ${entity}`);');
      code.line('continue;');
    });
    code.line();
    code.line('const entityRecords: Record<string, unknown>[] = [];');
    code.block('for (const item of items) {', () => {
      code.block('try {', () => {
        code.line('const resolved = resolveItem(item, createdRecords, entity);');
        code.line();
        code.line('const { data, error } = await supabase');
        code.line('  .from(tableName)');
        code.line('  .insert(resolved)');
        code.line('  .select()');
        code.line('  .single();');
        code.line();
        code.block("if (error && !error.message?.includes('duplicate') && error.code !== '23505') {", () => {
          code.line('console.warn(`Failed to seed ${entity}:`, error.message);');
          code.line('continue;');
        });
        code.line('if (data) entityRecords.push(data);');
      }, '} catch (e) {');
      code.indent();
      code.line('const error = e as Error;');
      code.line('console.warn(`Failed to seed ${entity}:`, error.message);');
      code.dedent();
      code.line('}');
    });
    code.line('createdRecords.set(entity, entityRecords);');
  });
}

/**
 * Generate the INSERT logic for Neon backend (raw SQL)
 */
export function emitNeonInsertLogic(code: CodeBuilder): void {
  code.block('for (const entity of orderedEntities) {', () => {
    code.line('const items = seedConfig.data[entity];');
    code.line('const tableName = tableNameMap[entity];');
    code.block('if (!tableName) {', () => {
      code.line('console.warn(`Unknown entity in seed data: ${entity}`);');
      code.line('continue;');
    });
    code.line();
    code.line('const entityRecords: Record<string, unknown>[] = [];');
    code.block('for (const item of items) {', () => {
      code.block('try {', () => {
        code.line('const resolved = resolveItem(item, createdRecords, entity);');
        code.line();
        code.comment('Build column names and values');
        code.line('const columns = Object.keys(resolved).map(k => `"${k}"`).join(\', \');');
        code.line('const values = Object.values(resolved).map(v => escapeSQL(v)).join(\', \');');
        code.line();
        code.line('const result = await sql.unsafe(`INSERT INTO "${tableName}" (${columns}) VALUES (${values}) RETURNING *`);');
        code.line('if (result.rows.length > 0) {');
        code.line('  entityRecords.push(result.rows[0] as Record<string, unknown>);');
        code.line('}');
      }, '} catch (e) {');
      code.indent();
      code.line('const error = e as Error;');
      code.comment('Ignore duplicate key errors');
      code.line("if (!error.message?.includes('duplicate') && !error.message?.includes('23505')) {");
      code.line('  console.warn(`Failed to seed ${entity}:`, error.message);');
      code.line('}');
      code.dedent();
      code.line('}');
    });
    code.line('createdRecords.set(entity, entityRecords);');
  });
}

/**
 * Generate the INSERT logic for Firebase backend
 */
export function emitFirebaseInsertLogic(code: CodeBuilder): void {
  code.block('for (const entity of orderedEntities) {', () => {
    code.line('const items = seedConfig.data[entity];');
    code.line('const tableName = tableNameMap[entity];');
    code.block('if (!tableName) {', () => {
      code.line('console.warn(`Unknown entity in seed data: ${entity}`);');
      code.line('continue;');
    });
    code.line();
    code.line('const entityRecords: Record<string, unknown>[] = [];');
    code.block('for (const item of items) {', () => {
      code.block('try {', () => {
        code.line('const resolved = resolveItem(item, createdRecords, entity);');
        code.line();
        code.comment('Check if item has an id - if so, use set() to preserve it');
        code.block("if (resolved.id && typeof resolved.id === 'string') {", () => {
          code.line('const { id, ...data } = resolved;');
          code.line('await db.collection(tableName).doc(id as string).set({');
          code.line('  ...data,');
          code.line('  createdAt: new Date().toISOString(),');
          code.line('});');
          code.line('entityRecords.push(resolved);');
        }, '} else {');
        code.indent();
        code.line('const docRef = await db.collection(tableName).add({');
        code.line('  ...resolved,');
        code.line('  createdAt: new Date().toISOString(),');
        code.line('});');
        code.line('entityRecords.push({ id: docRef.id, ...resolved });');
        code.dedent();
        code.line('}');
      }, '} catch (e) {');
      code.indent();
      code.line('const error = e as Error;');
      code.line('console.warn(`Failed to seed ${entity}:`, error.message);');
      code.dedent();
      code.line('}');
    });
    code.line('createdRecords.set(entity, entityRecords);');
  });
}

/**
 * Check if seed handler should be generated for a target
 */
export function shouldGenerateSeedHandler(config: SchemockConfig): boolean {
  return !!config.productionSeed?.dataPath;
}

/**
 * Get the backend type from a target
 */
export function getBackendType(target: GenerationTarget): SeedBackend {
  return (target.backend || 'supabase') as SeedBackend;
}
