/**
 * Next.js API Route Generator
 *
 * Generates Next.js App Router API routes from Schemock schemas.
 * Supports Supabase/Firebase/PGlite backends and middleware generation.
 *
 * @module cli/generators/nextjs-api
 * @category CLI
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnalyzedSchema,
  GenerationTarget,
  SchemockConfig,
  GenerateOptions,
} from '../../types';

import { generateRouteFile, generateDynamicRouteFile } from './route-template';
import { generateLibFiles } from './lib-template';
import { generateTypes } from '../types';

/**
 * Generate Next.js API routes for entities
 *
 * @param allSchemas - All schemas (for type generation, ensures relations work)
 * @param targetSchemas - Filtered schemas (for route generation)
 * @param outputDir - Output directory
 * @param target - Target configuration
 * @param config - Schemock config
 * @param options - Generation options
 */
export async function generateNextjsApiTarget(
  allSchemas: AnalyzedSchema[],
  targetSchemas: AnalyzedSchema[],
  outputDir: string,
  target: GenerationTarget,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const files: string[] = [];

  // Create _lib directory for shared code
  const libDir = join(outputDir, '_lib');
  if (!options.dryRun) {
    await mkdir(libDir, { recursive: true });
  }

  // Generate TypeScript types in _lib (ALL schemas to preserve relations)
  const typesCode = generateTypes(allSchemas);
  await writeOutput(join(libDir, 'types.ts'), typesCode, options.dryRun);
  files.push('_lib/types.ts');
  console.log('   ✓ _lib/types.ts');

  // Generate shared library files (excluding types which we just generated)
  const libFiles = generateLibFiles(target, config);
  for (const [filename, content] of Object.entries(libFiles)) {
    if (filename === 'types.ts') continue; // Skip types, already generated
    await writeOutput(join(libDir, filename), content, options.dryRun);
    files.push(`_lib/${filename}`);
    console.log(`   ✓ _lib/${filename}`);
  }

  // Generate routes for TARGET schemas only (filtered)
  for (const schema of targetSchemas) {
    if (schema.isJunctionTable) continue;

    // Create entity directory (e.g., /api/users/)
    const entityDir = join(outputDir, schema.pluralName);
    if (!options.dryRun) {
      await mkdir(entityDir, { recursive: true });
    }

    // Generate collection route (GET list, POST create)
    const collectionRoute = generateRouteFile(schema, target, config);
    await writeOutput(join(entityDir, 'route.ts'), collectionRoute, options.dryRun);
    files.push(`${schema.pluralName}/route.ts`);

    // Create [id] directory for dynamic routes
    const dynamicDir = join(entityDir, '[id]');
    if (!options.dryRun) {
      await mkdir(dynamicDir, { recursive: true });
    }

    // Generate dynamic route (GET one, PUT update, DELETE)
    const dynamicRoute = generateDynamicRouteFile(schema, target, config);
    await writeOutput(join(dynamicDir, 'route.ts'), dynamicRoute, options.dryRun);
    files.push(`${schema.pluralName}/[id]/route.ts`);

    console.log(`   ✓ ${schema.pluralName}/ (collection + [id] routes)`);
  }

  return files;
}

/**
 * Write output file (or show dry-run message)
 */
async function writeOutput(
  path: string,
  content: string,
  dryRun?: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`   [DRY RUN] Would write: ${path}`);
    return;
  }
  await writeFile(path, content, 'utf-8');
}
