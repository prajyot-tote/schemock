/**
 * Main generate command for Schemock CLI
 *
 * @module cli/commands/generate
 * @category CLI
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config';
import { discoverSchemas, getRelativePath } from '../discover';
import { analyzeSchemas } from '../analyze';
import { analyzeEndpoints } from '../analyze-endpoints';
import type { SchemockConfig, AnalyzedSchema, AnalyzedEndpoint, GenerateOptions } from '../types';

// Generators
import { generateTypes } from '../generators/types';
import { generateMockDb } from '../generators/mock/db';
import { generateMockHandlers, generateAllHandlersExport } from '../generators/mock/handlers';
import { generateMockClient } from '../generators/mock/client';
import { generateSeed } from '../generators/mock/seed';
import { generateRoutes } from '../generators/mock/routes';
import {
  generateEndpointTypes,
  generateEndpointClient,
  generateEndpointHandlers,
  generateEndpointResolvers,
} from '../generators/mock/endpoints';
import { generateSupabaseClient } from '../generators/supabase/client';
import { generateFirebaseClient } from '../generators/firebase/client';
import { generateFetchClient } from '../generators/fetch/client';
import { generatePGliteDb, generatePGliteClient, generatePGliteSeed } from '../generators/pglite';
import { generateHooks } from '../generators/hooks';
import { generateProvider } from '../generators/provider';
import { generateFormSchemas } from '../generators/form-schemas';

// Multi-target generation
import { generateAllTargets, legacyConfigToTarget } from '../generators/target-registry';

/**
 * Check if a package is installed
 */
function isPkgInstalled(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main generate command
 *
 * @param options - Generation options
 */
export async function generate(options: GenerateOptions): Promise<void> {
  console.log('\n🔍 Schemock Generate\n');

  // 1. Load config
  const config = await loadConfig(options.config);

  // 2. Discover schemas and endpoints
  console.log('📦 Discovering schemas...');
  const { schemas, endpoints, files, endpointFiles } = await discoverSchemas(config.schemas);

  for (const file of files) {
    console.log(`   Found: ${getRelativePath(file)}`);
  }
  console.log(`   Total: ${schemas.length} schemas, ${endpoints.length} endpoints\n`);

  // 3. Analyze schemas (use default adapter for analysis, targets can override)
  const adapter = (options.adapter || config.adapter || 'mock') as SchemockConfig['adapter'];
  const analyzed = analyzeSchemas(schemas, { ...config, adapter });

  // 4. Analyze endpoints
  const analyzedEndpoints = analyzeEndpoints(endpoints, endpointFiles);

  if (options.verbose) {
    console.log('📊 Analyzed schemas:');
    for (const schema of analyzed) {
      console.log(`   ${schema.pascalName}: ${schema.fields.length} fields, ${schema.relations.length} relations`);
      if (schema.isJunctionTable) {
        console.log(`      (junction table)`);
      }
    }
    if (analyzedEndpoints.length > 0) {
      console.log('\n📊 Analyzed endpoints:');
      for (const endpoint of analyzedEndpoints) {
        console.log(`   ${endpoint.method} ${endpoint.path} -> ${endpoint.name}`);
      }
    }
    console.log();
  }

  // 5. Apply CLI-level entity filtering if provided
  let effectiveTargets = config.targets;
  if (options.only || options.exclude) {
    console.log('🔧 Applying CLI entity filters:');
    if (options.only) {
      console.log(`   --only: ${options.only.join(', ')}`);
    }
    if (options.exclude) {
      console.log(`   --exclude: ${options.exclude.join(', ')}`);
    }
    console.log('');

    // If we have targets, apply CLI filters to each target
    if (config.targets && config.targets.length > 0) {
      effectiveTargets = config.targets.map((target) => ({
        ...target,
        // CLI --only overrides target.entities
        entities: options.only || target.entities,
        // CLI --exclude adds to target.excludeEntities
        excludeEntities: options.exclude
          ? [...(target.excludeEntities || []), ...options.exclude]
          : target.excludeEntities,
      }));
    }
  }

  // 6. Check for multi-target configuration
  if (effectiveTargets && effectiveTargets.length > 0) {
    console.log(`🎯 Multi-target generation mode (${effectiveTargets.length} targets)\n`);

    const results = await generateAllTargets(
      effectiveTargets,
      analyzed,
      analyzedEndpoints,
      config,
      options
    );

    // Summary
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log('\n📊 Generation Summary:');
    console.log(`   ✓ ${successCount} targets succeeded`);
    if (failCount > 0) {
      console.log(`   ✗ ${failCount} targets failed`);
      for (const result of results.filter((r) => !r.success)) {
        console.log(`      - ${result.target.name}: ${result.error?.message}`);
      }
    }

    console.log('\n✅ Multi-target generation complete\n');
    return;
  }

  // Legacy single-target mode
  const outputDir = options.output || config.output || './src/generated';
  console.log(`  Adapter: ${adapter}`);
  console.log(`  Output:  ${outputDir}\n`);

  // Create output directory
  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  // 5. Generate types (always)
  console.log('📝 Generating types...');
  let typesCode = generateTypes(analyzed);

  // Append endpoint types if there are any
  if (analyzedEndpoints.length > 0) {
    typesCode += generateEndpointTypes(analyzedEndpoints);
  }

  // Append form schemas if requested
  if (options.withFormSchemas) {
    typesCode += generateFormSchemas(analyzed);
  }

  await writeOutput(join(outputDir, 'types.ts'), typesCode, options.dryRun);
  const entityCount = analyzed.filter((s) => !s.isJunctionTable).length;
  const endpointInfo = analyzedEndpoints.length > 0 ? ` + ${analyzedEndpoints.length} endpoint types` : '';
  const formSchemaInfo = options.withFormSchemas ? ' + form schemas' : '';
  console.log(`   ✓ types.ts (${entityCount} entities + Create/Update/Filter types${endpointInfo}${formSchemaInfo})\n`);

  // 6. Generate adapter-specific code
  console.log(`🔌 Generating ${adapter} adapter...`);

  switch (adapter) {
    case 'mock':
      await generateMockAdapter(analyzed, analyzedEndpoints, outputDir, config, options);
      break;
    case 'supabase':
      await generateSupabaseAdapter(analyzed, outputDir, config, options);
      break;
    case 'firebase':
      await generateFirebaseAdapter(analyzed, outputDir, config, options);
      break;
    case 'fetch':
      await generateFetchAdapter(analyzed, outputDir, config, options);
      break;
    case 'graphql':
      console.log('   ⚠️  GraphQL adapter not yet implemented');
      break;
    case 'pglite':
      await generatePGliteAdapter(analyzed, outputDir, config, options);
      break;
    default:
      throw new Error(`Unknown adapter: ${adapter}`);
  }

  // 7. Generate React files (only if framework=react)
  const framework = options.framework || 'none';
  if (framework === 'react') {
    console.log('\n🎣 Generating React Context provider...');
    const providerCode = generateProvider();
    await writeOutput(join(outputDir, 'provider.tsx'), providerCode, options.dryRun);
    console.log('   ✓ provider.tsx (SchemockProvider + useSchemockClient)');

    console.log('\n⚛️  Generating React hooks...');
    const hooksCode = generateHooks(analyzed);
    await writeOutput(join(outputDir, 'hooks.ts'), hooksCode, options.dryRun);
    const hookCount = analyzed.filter((s) => !s.isJunctionTable).length * 5; // 5 hooks per entity
    console.log(`   ✓ hooks.ts (${hookCount} hooks)`);
  }

  // 8. Generate index.ts
  console.log('\n📦 Generating barrel exports...');
  const indexCode = generateIndex(adapter, analyzedEndpoints.length > 0, framework);
  await writeOutput(join(outputDir, 'index.ts'), indexCode, options.dryRun);
  console.log('   ✓ index.ts');

  // Done
  console.log(`\n✅ Generated ${adapter} adapter in ${outputDir}\n`);

  // PGlite-specific reminder
  if (adapter === 'pglite' && !isPkgInstalled('@electric-sql/pglite')) {
    console.log('⚠️  Required: npm install @electric-sql/pglite\n');
  }

  const firstSchema = analyzed.find((s) => !s.isJunctionTable);
  if (firstSchema) {
    console.log('Usage:');
    if (framework === 'react') {
      console.log(`  import { use${firstSchema.pascalPluralName}, useCreate${firstSchema.pascalName} } from '${outputDir.replace('./', '')}';`);
    } else {
      console.log(`  import { api } from '${outputDir.replace('./', '')}';`);
      console.log(`  const ${firstSchema.pluralName} = await api.${firstSchema.name}.list();`);
    }
    console.log('');
  }
}

/**
 * Generate mock adapter files
 */
async function generateMockAdapter(
  schemas: AnalyzedSchema[],
  endpoints: AnalyzedEndpoint[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const mockConfig = config.adapters?.mock || {};
  const hasEndpoints = endpoints.length > 0;

  const dbCode = generateMockDb(schemas, mockConfig);
  await writeOutput(join(outputDir, 'db.ts'), dbCode, options.dryRun);
  console.log(`   ✓ db.ts (@mswjs/data factory with ${schemas.length} entities)`);

  const routesCode = generateRoutes(schemas);
  await writeOutput(join(outputDir, 'routes.ts'), routesCode, options.dryRun);
  const entityCount = schemas.filter((s) => !s.isJunctionTable).length;
  console.log(`   ✓ routes.ts (${entityCount} entity route definitions)`);

  const handlersCode = generateMockHandlers(schemas, config.apiPrefix || '/api');
  await writeOutput(join(outputDir, 'handlers.ts'), handlersCode, options.dryRun);
  const handlerCount = schemas.filter((s) => !s.isJunctionTable).length * 6; // 6 handlers per entity
  console.log(`   ✓ handlers.ts (${handlerCount} MSW handlers)`);

  const seedCode = generateSeed(schemas, mockConfig);
  await writeOutput(join(outputDir, 'seed.ts'), seedCode, options.dryRun);
  console.log('   ✓ seed.ts (seed/reset utilities)');

  const clientCode = generateMockClient(schemas);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts (API client with relations support)');

  // Generate endpoint files if there are any
  if (hasEndpoints) {
    console.log('\n🎯 Generating custom endpoints...');

    const endpointClientCode = generateEndpointClient(endpoints);
    await writeOutput(join(outputDir, 'endpoints.ts'), endpointClientCode, options.dryRun);
    console.log(`   ✓ endpoints.ts (${endpoints.length} endpoint client methods)`);

    const endpointHandlersCode = generateEndpointHandlers(endpoints);
    await writeOutput(join(outputDir, 'endpoint-handlers.ts'), endpointHandlersCode, options.dryRun);
    console.log(`   ✓ endpoint-handlers.ts (${endpoints.length} MSW handlers)`);

    const endpointResolversCode = generateEndpointResolvers(endpoints, outputDir);
    await writeOutput(join(outputDir, 'endpoint-resolvers.ts'), endpointResolversCode, options.dryRun);
    console.log(`   ✓ endpoint-resolvers.ts (mock resolvers)`);
  }

  // Generate combined handlers export
  const allHandlersCode = generateAllHandlersExport(hasEndpoints);
  await writeOutput(join(outputDir, 'all-handlers.ts'), allHandlersCode, options.dryRun);
  console.log('   ✓ all-handlers.ts (combined handlers export)');
}

/**
 * Generate Supabase adapter files
 */
async function generateSupabaseAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const supabaseConfig = config.adapters?.supabase || {};
  const clientCode = generateSupabaseClient(schemas, supabaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts (Supabase client)');
}

/**
 * Generate Firebase adapter files
 */
async function generateFirebaseAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const firebaseConfig = config.adapters?.firebase || {};
  const clientCode = generateFirebaseClient(schemas, firebaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts (Firebase client)');
}

/**
 * Generate Fetch adapter files
 */
async function generateFetchAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const fetchConfig = config.adapters?.fetch || {};
  const clientCode = generateFetchClient(schemas, fetchConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts (Fetch client)');
}

/**
 * Generate PGlite adapter files
 */
async function generatePGliteAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  // Check if @electric-sql/pglite is installed
  if (!isPkgInstalled('@electric-sql/pglite')) {
    console.log('   ⚠️  @electric-sql/pglite not found. Install it:');
    console.log('      npm install @electric-sql/pglite\n');
  }

  const pgliteConfig = config.adapters?.pglite || {};

  const dbCode = generatePGliteDb(schemas, pgliteConfig);
  await writeOutput(join(outputDir, 'db.ts'), dbCode, options.dryRun);
  console.log(`   ✓ db.ts (PGlite schema with ${schemas.length} tables)`);

  const clientCode = generatePGliteClient(schemas);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts (SQL-based CRUD operations)');

  const seedCode = generatePGliteSeed(schemas, pgliteConfig);
  await writeOutput(join(outputDir, 'seed.ts'), seedCode, options.dryRun);
  console.log('   ✓ seed.ts (seed/reset utilities)');
}

/**
 * Generate barrel export index file
 */
function generateIndex(adapter: string, hasEndpoints: boolean = false, framework: string = 'none'): string {
  const lines = [
    '// GENERATED BY SCHEMOCK - DO NOT EDIT',
    '',
    "export * from './types';",
    "export { api, createClient } from './client';",
  ];

  // React-specific exports (only when framework=react)
  if (framework === 'react') {
    lines.push("export * from './hooks';");
    lines.push("export * from './provider';");
  }

  if (adapter === 'mock') {
    lines.push("export { db } from './db';");
    lines.push("export { handlers } from './handlers';");
    lines.push("export { allHandlers } from './all-handlers';");
    lines.push("export { seed, reset, getAll } from './seed';");

    if (hasEndpoints) {
      lines.push("export { endpoints } from './endpoints';");
      lines.push("export { endpointHandlers } from './endpoint-handlers';");
    }
  }

  if (adapter === 'pglite') {
    lines.push("export { db, initDb, resetDb, tables } from './db';");
    lines.push("export { seed, reset, getAll, count } from './seed';");
  }

  if (adapter === 'supabase') {
    lines.push("export { supabase } from './client';");
  }

  return lines.join('\n');
}

/**
 * Write output file (or show dry-run message)
 */
async function writeOutput(path: string, content: string, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    console.log(`   [DRY RUN] Would write: ${path}`);
    return;
  }
  await writeFile(path, content, 'utf-8');
}
