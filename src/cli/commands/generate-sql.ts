/**
 * SQL generation command for Schemock CLI
 *
 * Generates PostgreSQL schema including:
 * - Table DDL (CREATE TABLE)
 * - Foreign key constraints
 * - Indexes (user-defined + auto-generated)
 * - Row-Level Security (RLS) policies
 * - RPC functions (CREATE FUNCTION)
 * - Triggers (updated_at)
 * - README documentation
 *
 * @module cli/commands/generate-sql
 * @category CLI
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config';
import { discoverSchemas, getRelativePath } from '../discover';
import { analyzeSchemas } from '../analyze';
import { generateSQL } from '../generators/sql';
import { generateReadme } from '../generators/readme';
import type { GenerateSQLOptions } from '../types';

/**
 * Generate SQL schema files
 *
 * @param options - SQL generation options
 */
export async function generateSQLFiles(options: GenerateSQLOptions): Promise<void> {
  console.log('\n🗄️  Schemock SQL Generator\n');

  // 1. Load config
  const config = await loadConfig(options.config);
  const outputDir = options.output || './sql';
  const target = options.target || 'postgres';

  console.log(`  Target:  ${target}`);
  console.log(`  Output:  ${outputDir}`);
  if (options.combined) {
    console.log('  Mode:    Combined (single file)');
  } else {
    console.log('  Mode:    Separate files');
  }
  if (options.only) {
    console.log(`  Only:    ${options.only.join(', ')}`);
  }
  console.log('');

  // 2. Discover schemas
  console.log('📦 Discovering schemas...');
  const { schemas, files } = await discoverSchemas(config.schemas);

  for (const file of files) {
    console.log(`   Found: ${getRelativePath(file)}`);
  }
  console.log(`   Total: ${schemas.length} schemas\n`);

  if (schemas.length === 0) {
    console.log('⚠️  No schemas found. Nothing to generate.\n');
    return;
  }

  // 3. Analyze schemas
  console.log('📊 Analyzing schemas...');
  const analyzed = analyzeSchemas(schemas, { ...config, adapter: 'mock' });

  if (options.verbose) {
    for (const schema of analyzed) {
      const indexCount = schema.indexes?.length || 0;
      const rpcCount = schema.rpc?.length || 0;
      const rlsStatus = schema.rls.enabled ? 'RLS enabled' : 'no RLS';
      console.log(`   ${schema.pascalName}: ${schema.fields.length} fields, ${indexCount} indexes, ${rpcCount} RPCs (${rlsStatus})`);
    }
  }
  console.log('');

  // 4. Create output directory
  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  // 5. Generate SQL
  console.log('📝 Generating SQL...');
  const result = generateSQL(analyzed, {
    target,
    combined: options.combined,
    only: options.only,
  });

  // 6. Write output files
  if (result.combined) {
    // Single combined file
    await writeOutput(join(outputDir, 'schema.sql'), result.combined, options.dryRun);
    console.log('   ✓ schema.sql (combined)');
  } else if (result.files) {
    // Separate files
    const fileMapping = [
      { name: '001_tables.sql', content: result.files.tables, label: 'tables' },
      { name: '002_foreign_keys.sql', content: result.files.foreignKeys, label: 'foreign keys' },
      { name: '003_indexes.sql', content: result.files.indexes, label: 'indexes' },
      { name: '004_rls.sql', content: result.files.rls, label: 'RLS policies' },
      { name: '005_functions.sql', content: result.files.functions, label: 'functions' },
      { name: '006_triggers.sql', content: result.files.triggers, label: 'triggers' },
    ];

    for (const { name, content, label } of fileMapping) {
      if (content && content.trim()) {
        await writeOutput(join(outputDir, name), content, options.dryRun);
        console.log(`   ✓ ${name} (${label})`);
      }
    }
  }

  // 7. Generate README if requested
  if (options.readme) {
    console.log('\n📖 Generating documentation...');
    const readmeContent = generateReadme(analyzed, { target });
    await writeOutput(join(outputDir, 'README.md'), readmeContent, options.dryRun);
    console.log('   ✓ README.md');
  }

  // 8. Print summary
  console.log('\n📊 Summary:');
  console.log(`   Tables:        ${result.summary.tables}`);
  console.log(`   Foreign Keys:  ${result.summary.foreignKeys}`);
  console.log(`   Indexes:       ${result.summary.indexes}`);
  console.log(`   RLS Policies:  ${result.summary.rlsPolicies}`);
  console.log(`   Functions:     ${result.summary.functions}`);
  console.log(`   Triggers:      ${result.summary.triggers}`);

  // Done
  console.log(`\n✅ SQL schema generated in ${outputDir}\n`);

  // Usage hints based on target
  console.log('Next steps:');
  if (target === 'supabase') {
    console.log('  1. Create migration: supabase migration new schema_setup');
    console.log('  2. Copy schema.sql to the migration file');
    console.log('  3. Apply: supabase db push');
  } else if (target === 'pglite') {
    console.log("  1. Import schema: import schemaSQL from './sql/schema.sql?raw';");
    console.log('  2. Initialize: await db.exec(schemaSQL);');
  } else {
    console.log('  1. Apply schema: psql -d your_database -f sql/schema.sql');
    console.log('  2. Or apply individually: psql -d your_database -f sql/001_tables.sql');
  }
  console.log('');
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
