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
  AnalyzedMiddleware,
} from '../../types';

import { generateRouteFile, generateDynamicRouteFile } from './route-template';
import { generateLibFiles } from './lib-template';
import { generateTypes } from '../types';
import {
  generateAuthMiddlewareNextjs,
  generateRateLimitMiddlewareNextjs,
  generateCacheMiddlewareNextjs,
  generateLoggerMiddlewareNextjs,
  generateContextMiddlewareNextjs,
  generateRlsMiddlewareNextjs,
  generateCustomMiddlewareNextjs,
  generateValidationNextjs,
} from './middleware-template';
import {
  generateNextjsMiddlewareChain,
  normalizeAuthConfig,
  normalizeLoggerConfig,
  normalizeCacheConfig,
} from './middleware-chain-template';

/**
 * Generate Next.js API routes for entities
 *
 * @param allSchemas - All schemas (for type generation, ensures relations work)
 * @param targetSchemas - Filtered schemas (for route generation)
 * @param outputDir - Output directory
 * @param target - Target configuration
 * @param config - Schemock config
 * @param options - Generation options
 * @param customMiddleware - Analyzed custom middleware definitions (optional)
 */
export async function generateNextjsApiTarget(
  allSchemas: AnalyzedSchema[],
  targetSchemas: AnalyzedSchema[],
  outputDir: string,
  target: GenerationTarget,
  config: SchemockConfig,
  options: GenerateOptions,
  customMiddleware: AnalyzedMiddleware[] = []
): Promise<string[]> {
  const files: string[] = [];

  // Create _lib directory for shared code
  const libDir = join(outputDir, '_lib');
  if (!options.dryRun) {
    await mkdir(libDir, { recursive: true });
  }

  // Create custom middleware directory if needed
  if (customMiddleware.length > 0) {
    const customMiddlewareDir = join(libDir, 'custom');
    if (!options.dryRun) {
      await mkdir(customMiddlewareDir, { recursive: true });
    }
  }

  // Generate TypeScript types in _lib (ALL schemas to preserve relations)
  const typesCode = generateTypes(allSchemas);
  await writeOutput(join(libDir, 'types.ts'), typesCode, options.dryRun);
  files.push('_lib/types.ts');
  console.log('   ✓ _lib/types.ts');

  // Check if using new v1.0 middleware config or legacy target.middleware
  const middlewareConfig = config.middleware;
  const hasNewMiddlewareConfig = middlewareConfig !== undefined;

  // Generate middleware based on config (new v1.0 format)
  if (hasNewMiddlewareConfig) {
    const generatedMiddleware = await generateMiddlewareFromConfig(
      libDir,
      config,
      targetSchemas,
      customMiddleware,
      options.dryRun
    );
    files.push(...generatedMiddleware);

    // Generate middleware chain file
    const chainCode = generateNextjsMiddlewareChain(config, customMiddleware);
    await writeOutput(join(libDir, 'chain.ts'), chainCode, options.dryRun);
    files.push('_lib/chain.ts');
    console.log('   ✓ _lib/chain.ts');
  }

  // Generate shared library files (excluding types which we just generated)
  // Only generate legacy middleware if not using new config
  const libFiles = generateLibFiles(target, config);
  for (const [filename, content] of Object.entries(libFiles)) {
    if (filename === 'types.ts') continue; // Skip types, already generated

    // Skip auth.ts if using new middleware config (we generate our own)
    if (filename === 'auth.ts' && hasNewMiddlewareConfig) continue;

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

/**
 * Generate middleware files based on new v1.0 config format
 */
async function generateMiddlewareFromConfig(
  libDir: string,
  config: SchemockConfig,
  schemas: AnalyzedSchema[],
  customMiddleware: AnalyzedMiddleware[],
  dryRun?: boolean
): Promise<string[]> {
  const files: string[] = [];
  const mwConfig = config.middleware;
  if (!mwConfig) return files;

  // Auth middleware
  if (mwConfig.auth) {
    const authConfig = normalizeAuthConfig(mwConfig.auth);
    if (authConfig) {
      const authCode = generateAuthMiddlewareNextjs(authConfig);
      await writeOutput(join(libDir, 'auth.ts'), authCode, dryRun);
      files.push('_lib/auth.ts');
      console.log('   ✓ _lib/auth.ts');
    }
  }

  // Rate limit middleware
  if (mwConfig.rateLimit) {
    const rateLimitCode = generateRateLimitMiddlewareNextjs(mwConfig.rateLimit);
    await writeOutput(join(libDir, 'rate-limit.ts'), rateLimitCode, dryRun);
    files.push('_lib/rate-limit.ts');
    console.log('   ✓ _lib/rate-limit.ts');
  }

  // Cache middleware
  if (mwConfig.cache) {
    const cacheConfig = normalizeCacheConfig(mwConfig.cache);
    if (cacheConfig) {
      const cacheCode = generateCacheMiddlewareNextjs(cacheConfig);
      await writeOutput(join(libDir, 'cache.ts'), cacheCode, dryRun);
      files.push('_lib/cache.ts');
      console.log('   ✓ _lib/cache.ts');
    }
  }

  // Logger middleware
  if (mwConfig.logger) {
    const loggerConfig = normalizeLoggerConfig(mwConfig.logger);
    if (loggerConfig) {
      const loggerCode = generateLoggerMiddlewareNextjs(loggerConfig);
      await writeOutput(join(libDir, 'logger.ts'), loggerCode, dryRun);
      files.push('_lib/logger.ts');
      console.log('   ✓ _lib/logger.ts');
    }
  }

  // Context middleware
  if (mwConfig.context) {
    const contextCode = generateContextMiddlewareNextjs();
    await writeOutput(join(libDir, 'context.ts'), contextCode, dryRun);
    files.push('_lib/context.ts');
    console.log('   ✓ _lib/context.ts');
  }

  // RLS middleware
  if (mwConfig.rls) {
    const rlsCode = generateRlsMiddlewareNextjs(schemas);
    await writeOutput(join(libDir, 'rls.ts'), rlsCode, dryRun);
    files.push('_lib/rls.ts');
    console.log('   ✓ _lib/rls.ts');
  }

  // Validation middleware
  if (mwConfig.validation) {
    const validationCode = generateValidationNextjs(schemas);
    await writeOutput(join(libDir, 'validate.ts'), validationCode, dryRun);
    files.push('_lib/validate.ts');
    console.log('   ✓ _lib/validate.ts');
  }

  // Custom middleware
  for (const mw of customMiddleware) {
    const customCode = generateCustomMiddlewareNextjs(mw);
    const customDir = join(libDir, 'custom');
    await writeOutput(join(customDir, `${mw.name}.ts`), customCode, dryRun);
    files.push(`_lib/custom/${mw.name}.ts`);
    console.log(`   ✓ _lib/custom/${mw.name}.ts`);
  }

  return files;
}
