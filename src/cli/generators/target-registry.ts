/**
 * Target Registry for Multi-Target Code Generation
 *
 * Manages generation targets and dispatches to appropriate generators.
 *
 * @module cli/generators/target-registry
 * @category CLI
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnalyzedSchema,
  AnalyzedEndpoint,
  SchemockConfig,
  GenerationTarget,
  TargetType,
  GenerateOptions,
} from '../types';

// Existing generators
import { generateTypes } from './types';
import { generateMockDb } from './mock/db';
import { generateMockHandlers, generateAllHandlersExport } from './mock/handlers';
import { generateMockClient } from './mock/client';
import { generateSeed } from './mock/seed';
import { generateRoutes } from './mock/routes';
import {
  generateEndpointTypes,
  generateEndpointClient,
  generateEndpointHandlers,
  generateEndpointResolvers,
} from './mock/endpoints';
import { generateSupabaseClient } from './supabase/client';
import { generateFirebaseClient } from './firebase/client';
import { generateFetchClient } from './fetch/client';
import { generatePGliteDb, generatePGliteClient, generatePGliteSeed } from './pglite';
import { generateHooks } from './hooks';

// Server target generators
import { generateNextjsApiTarget } from './nextjs-api';
import { generateValidation } from './nextjs-api/lib-template';
import { generateNodeHandlersTarget } from './node-handlers';

/**
 * Result of generating a target
 */
export interface TargetGenerationResult {
  target: GenerationTarget;
  files: string[];
  success: boolean;
  error?: Error;
}

/**
 * Filter schemas based on target entity configuration
 */
export function filterSchemasForTarget(
  schemas: AnalyzedSchema[],
  target: GenerationTarget
): AnalyzedSchema[] {
  let filtered = [...schemas];

  // Include only specified entities
  if (target.entities && target.entities.length > 0) {
    const includeSet = new Set(target.entities.map((e) => e.toLowerCase()));
    filtered = filtered.filter(
      (s) =>
        includeSet.has(s.name.toLowerCase()) ||
        includeSet.has(s.pascalName.toLowerCase()) ||
        includeSet.has(s.singularName.toLowerCase())
    );
  }

  // Exclude specified entities
  if (target.excludeEntities && target.excludeEntities.length > 0) {
    const excludeSet = new Set(target.excludeEntities.map((e) => e.toLowerCase()));
    filtered = filtered.filter(
      (s) =>
        !excludeSet.has(s.name.toLowerCase()) &&
        !excludeSet.has(s.pascalName.toLowerCase()) &&
        !excludeSet.has(s.singularName.toLowerCase())
    );
  }

  return filtered;
}

/**
 * Check if a target type is a server-side target
 */
export function isServerTarget(type: TargetType): boolean {
  return ['nextjs-api', 'nextjs-edge', 'express', 'hono', 'node-handlers'].includes(type);
}

/**
 * Check if a target type is a client-side target
 */
export function isClientTarget(type: TargetType): boolean {
  return ['mock', 'supabase', 'firebase', 'fetch', 'graphql', 'pglite'].includes(type);
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

/**
 * Generate a client-side target (existing adapters)
 */
async function generateClientTarget(
  target: GenerationTarget,
  schemas: AnalyzedSchema[],
  endpoints: AnalyzedEndpoint[],
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const files: string[] = [];
  const outputDir = target.output;
  const targetSchemas = filterSchemasForTarget(schemas, target);
  const hasEndpoints = endpoints.length > 0;

  // Create output directory
  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  // Generate types
  let typesCode = generateTypes(targetSchemas);
  if (hasEndpoints) {
    typesCode += generateEndpointTypes(endpoints);
  }
  await writeOutput(join(outputDir, 'types.ts'), typesCode, options.dryRun);
  files.push('types.ts');

  // Generate adapter-specific code
  switch (target.type) {
    case 'mock':
      files.push(...(await generateMockTarget(targetSchemas, endpoints, outputDir, config, options)));
      break;
    case 'supabase':
      files.push(...(await generateSupabaseTarget(targetSchemas, outputDir, config, options)));
      break;
    case 'firebase':
      files.push(...(await generateFirebaseTarget(targetSchemas, outputDir, config, options)));
      break;
    case 'fetch':
      files.push(...(await generateFetchTarget(targetSchemas, outputDir, config, options)));
      break;
    case 'pglite':
      files.push(...(await generatePGliteTarget(targetSchemas, outputDir, config, options)));
      break;
    case 'graphql':
      console.log('   ⚠️  GraphQL target not yet implemented');
      break;
  }

  // Generate hooks
  const hooksCode = generateHooks(targetSchemas);
  await writeOutput(join(outputDir, 'hooks.ts'), hooksCode, options.dryRun);
  files.push('hooks.ts');

  // Generate index
  const indexCode = generateClientIndex(target.type, hasEndpoints);
  await writeOutput(join(outputDir, 'index.ts'), indexCode, options.dryRun);
  files.push('index.ts');

  return files;
}

/**
 * Generate mock adapter target
 */
async function generateMockTarget(
  schemas: AnalyzedSchema[],
  endpoints: AnalyzedEndpoint[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const files: string[] = [];
  const mockConfig = config.adapters?.mock || {};
  const hasEndpoints = endpoints.length > 0;

  const dbCode = generateMockDb(schemas, mockConfig);
  await writeOutput(join(outputDir, 'db.ts'), dbCode, options.dryRun);
  files.push('db.ts');

  const routesCode = generateRoutes(schemas);
  await writeOutput(join(outputDir, 'routes.ts'), routesCode, options.dryRun);
  files.push('routes.ts');

  const handlersCode = generateMockHandlers(schemas, config.apiPrefix || '/api');
  await writeOutput(join(outputDir, 'handlers.ts'), handlersCode, options.dryRun);
  files.push('handlers.ts');

  const seedCode = generateSeed(schemas, mockConfig);
  await writeOutput(join(outputDir, 'seed.ts'), seedCode, options.dryRun);
  files.push('seed.ts');

  const clientCode = generateMockClient(schemas);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  files.push('client.ts');

  if (hasEndpoints) {
    const endpointClientCode = generateEndpointClient(endpoints);
    await writeOutput(join(outputDir, 'endpoints.ts'), endpointClientCode, options.dryRun);
    files.push('endpoints.ts');

    const endpointHandlersCode = generateEndpointHandlers(endpoints);
    await writeOutput(join(outputDir, 'endpoint-handlers.ts'), endpointHandlersCode, options.dryRun);
    files.push('endpoint-handlers.ts');

    const endpointResolversCode = generateEndpointResolvers(endpoints);
    await writeOutput(join(outputDir, 'endpoint-resolvers.ts'), endpointResolversCode, options.dryRun);
    files.push('endpoint-resolvers.ts');
  }

  const allHandlersCode = generateAllHandlersExport(hasEndpoints);
  await writeOutput(join(outputDir, 'all-handlers.ts'), allHandlersCode, options.dryRun);
  files.push('all-handlers.ts');

  return files;
}

/**
 * Generate Supabase target
 */
async function generateSupabaseTarget(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const supabaseConfig = config.adapters?.supabase || {};
  const clientCode = generateSupabaseClient(schemas, supabaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  return ['client.ts'];
}

/**
 * Generate Firebase target
 */
async function generateFirebaseTarget(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const firebaseConfig = config.adapters?.firebase || {};
  const clientCode = generateFirebaseClient(schemas, firebaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  return ['client.ts'];
}

/**
 * Generate Fetch target
 */
async function generateFetchTarget(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const fetchConfig = config.adapters?.fetch || {};
  const clientCode = generateFetchClient(schemas, fetchConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  return ['client.ts'];
}

/**
 * Generate PGlite target
 */
async function generatePGliteTarget(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const files: string[] = [];
  const pgliteConfig = config.adapters?.pglite || {};

  const dbCode = generatePGliteDb(schemas, pgliteConfig);
  await writeOutput(join(outputDir, 'db.ts'), dbCode, options.dryRun);
  files.push('db.ts');

  const clientCode = generatePGliteClient(schemas);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  files.push('client.ts');

  const seedCode = generatePGliteSeed(schemas, pgliteConfig);
  await writeOutput(join(outputDir, 'seed.ts'), seedCode, options.dryRun);
  files.push('seed.ts');

  return files;
}

/**
 * Generate a server-side target (Next.js API, Express, etc.)
 *
 * @param target - Target configuration
 * @param allSchemas - ALL schemas (for type generation, ensures relations work)
 * @param targetSchemas - Filtered schemas (for handler/route generation)
 * @param _endpoints - Analyzed endpoints
 * @param config - Schemock config
 * @param options - Generation options
 */
async function generateServerTarget(
  target: GenerationTarget,
  allSchemas: AnalyzedSchema[],
  targetSchemas: AnalyzedSchema[],
  _endpoints: AnalyzedEndpoint[],
  config: SchemockConfig,
  options: GenerateOptions
): Promise<string[]> {
  const files: string[] = [];
  const outputDir = target.output;

  // Create output directory
  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  // Log what's being generated
  const allCount = allSchemas.filter(s => !s.isJunctionTable).length;
  const targetCount = targetSchemas.filter(s => !s.isJunctionTable).length;
  const isFiltered = targetCount < allCount;

  switch (target.type) {
    case 'nextjs-api':
      if (isFiltered) {
        console.log(`   📂 Next.js API routes (${targetCount}/${allCount} entities)`);
      } else {
        console.log(`   📂 Next.js API routes (${targetCount} entities)`);
      }

      // Generate validation if enabled (only for target schemas)
      if (target.middleware?.validation) {
        const libDir = join(outputDir, '_lib');
        if (!options.dryRun) {
          await mkdir(libDir, { recursive: true });
        }
        const validationCode = generateValidation(targetSchemas);
        await writeOutput(join(libDir, 'validate.ts'), validationCode, options.dryRun);
        files.push('_lib/validate.ts');
        console.log('   ✓ _lib/validate.ts (validation middleware)');
      }

      // Generate routes - pass both allSchemas (for types) and targetSchemas (for routes)
      files.push(...(await generateNextjsApiTarget(allSchemas, targetSchemas, outputDir, target, config, options)));
      break;

    case 'nextjs-edge':
      console.log(`   🚧 Next.js Edge target generation (${targetCount} entities)`);
      console.log('   ⚠️  Next.js Edge target not yet implemented');
      break;

    case 'express':
    case 'hono':
    case 'node-handlers':
      if (isFiltered) {
        console.log(`   📂 Node.js handlers (${targetCount}/${allCount} entities)`);
      } else {
        console.log(`   📂 Node.js handlers (${targetCount} entities)`);
      }
      // Generate handlers - pass both allSchemas (for types) and targetSchemas (for handlers)
      files.push(...(await generateNodeHandlersTarget(allSchemas, targetSchemas, outputDir, target, config, options)));
      break;
  }

  return files;
}

/**
 * Generate barrel export index file for client targets
 */
function generateClientIndex(targetType: TargetType, hasEndpoints: boolean = false): string {
  const lines = [
    '// GENERATED BY SCHEMOCK - DO NOT EDIT',
    '',
    "export * from './types';",
    "export * from './hooks';",
    "export { api } from './client';",
  ];

  if (targetType === 'mock') {
    lines.push("export { db } from './db';");
    lines.push("export { handlers } from './handlers';");
    lines.push("export { allHandlers } from './all-handlers';");
    lines.push("export { seed, reset, getAll } from './seed';");

    if (hasEndpoints) {
      lines.push("export { endpoints } from './endpoints';");
      lines.push("export { endpointHandlers } from './endpoint-handlers';");
    }
  }

  if (targetType === 'pglite') {
    lines.push("export { db, initDb, resetDb, tables } from './db';");
    lines.push("export { seed, reset, getAll, count } from './seed';");
  }

  if (targetType === 'supabase') {
    lines.push("export { supabase } from './client';");
  }

  return lines.join('\n');
}

/**
 * Generate all targets in the configuration
 */
export async function generateAllTargets(
  targets: GenerationTarget[],
  schemas: AnalyzedSchema[],
  endpoints: AnalyzedEndpoint[],
  config: SchemockConfig,
  options: GenerateOptions
): Promise<TargetGenerationResult[]> {
  const results: TargetGenerationResult[] = [];

  for (const target of targets) {
    console.log(`\n🎯 Generating target: ${target.name} (${target.type})`);
    console.log(`   Output: ${target.output}`);

    try {
      let files: string[];

      // Filter schemas for this target (for handlers/routes)
      const targetSchemas = filterSchemasForTarget(schemas, target);

      if (isClientTarget(target.type)) {
        files = await generateClientTarget(target, schemas, endpoints, config, options);
      } else if (isServerTarget(target.type)) {
        // Pass allSchemas for types (ensures relations work) and targetSchemas for handlers
        files = await generateServerTarget(target, schemas, targetSchemas, endpoints, config, options);
      } else {
        throw new Error(`Unknown target type: ${target.type}`);
      }

      console.log(`   ✓ Generated ${files.length} files`);
      results.push({ target, files, success: true });
    } catch (error) {
      console.error(`   ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        target,
        files: [],
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return results;
}

/**
 * Convert legacy single-adapter config to a single target
 */
export function legacyConfigToTarget(config: SchemockConfig): GenerationTarget {
  return {
    name: 'default',
    type: config.adapter,
    output: config.output,
  };
}
