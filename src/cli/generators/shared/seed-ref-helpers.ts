/**
 * Code emission helpers for seed reference resolution
 *
 * These functions emit runtime helpers into generated seed.ts files
 * for both Mock and PGlite adapters. They handle detection and resolution
 * of `ref()` and `lookup()` markers in production seed data.
 *
 * @module cli/generators/shared/seed-ref-helpers
 * @category CLI
 */

import type { AnalyzedSchema } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';
import { toSafePropertyName } from '../../utils/pluralize';

/**
 * Emit the `isSeedReference`, `resolveRef`, and `resolveItem` helper
 * functions into the generated seed.ts file.
 *
 * These are self-contained runtime helpers that resolve `ref()` and
 * `lookup()` markers against a `createdRecords` map.
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
      code.line("const entity = marker.entity as string;");
      code.line("const field = marker.field as string;");
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

      code.line("throw new Error(`Unknown seed reference type: ${String(marker.type)}`);");
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
 * Emit the `entityOrder` constant — a topologically sorted array of
 * entity names that determines insertion order for production seeding.
 *
 * Entities are emitted in the same order as `schemas` (which is already
 * topologically sorted), using their safe property names.
 */
export function emitEntityOrder(code: CodeBuilder, schemas: AnalyzedSchema[]): void {
  code.comment('Entity insertion order (topologically sorted by dependencies)');
  const names = schemas
    .filter((s) => !s.isJunctionTable)
    .map((s) => `'${toSafePropertyName(s.name)}'`);
  code.line(`const entityOrder: string[] = [${names.join(', ')}];`);
  code.line();
}
