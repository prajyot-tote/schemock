/**
 * Supabase Edge Functions Generator
 *
 * Generates Deno-based Edge Functions from Schemock schemas.
 * Creates a proper Supabase Edge Functions project structure.
 *
 * @module cli/generators/supabase-edge
 * @category CLI
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnalyzedSchema,
  AnalyzedEndpoint,
  GenerationTarget,
  SchemockConfig,
  GenerateOptions,
  AnalyzedMiddleware,
} from '../../types';

import { generateTypes } from '../types';
import {
  generateEdgeFunctionFile,
  generateFatFunctionFile,
} from './function-template';
import { generateEndpointEdgeFunction } from './endpoint-function-template';
import { generateSeedEdgeFunction } from './seed-function-template';
import { generateAllEndpointInterfaces, deriveEdgeFunctionName } from '../shared/endpoint-helpers';
import { shouldGenerateSeedHandler } from '../shared/seed-handler-helpers';
import {
  generateSharedCors,
  generateSharedSupabaseClient,
  generateSharedTypes,
  generateDenoConfig,
} from './shared-template';
import {
  generateAuthMiddlewareEdge,
  generateRateLimitMiddlewareEdge,
  generateCacheMiddlewareEdge,
  generateLoggerMiddlewareEdge,
  generateContextMiddlewareEdge,
  generateRlsMiddlewareEdge,
  generateCustomMiddlewareEdge,
  generateValidationEdge,
} from './middleware-template';
import {
  generateEdgeMiddlewareChain,
  normalizeAuthConfig,
  normalizeLoggerConfig,
  normalizeCacheConfig,
} from './middleware-chain-template';

/**
 * Generate Supabase Edge Functions for entities
 *
 * Creates a project structure like:
 * supabase/
 *   functions/
 *     _shared/
 *       cors.ts
 *       supabase.ts
 *       types.ts
 *       middleware/
 *         auth.ts
 *         chain.ts
 *         ...
 *     api-users/
 *       index.ts
 *     api-posts/
 *       index.ts
 *
 * @param allSchemas - All schemas (for type generation)
 * @param targetSchemas - Filtered schemas (for function generation)
 * @param outputDir - Output directory (e.g., ./supabase/functions)
 * @param target - Target configuration
 * @param config - Schemock config
 * @param options - Generation options
 * @param customMiddleware - Analyzed custom middleware definitions
 * @param endpoints - Analyzed custom endpoints (optional)
 */
export async function generateSupabaseEdgeTarget(
  allSchemas: AnalyzedSchema[],
  targetSchemas: AnalyzedSchema[],
  outputDir: string,
  target: GenerationTarget,
  config: SchemockConfig,
  options: GenerateOptions,
  customMiddleware: AnalyzedMiddleware[] = [],
  endpoints: AnalyzedEndpoint[] = []
): Promise<string[]> {
  const files: string[] = [];

  // Check if we should use "fat functions" approach (one function for all entities)
  const useFatFunctions = target.options?.fatFunctions !== false;

  // Create _shared directory for common code
  const sharedDir = join(outputDir, '_shared');
  if (!options.dryRun) {
    await mkdir(sharedDir, { recursive: true });
  }

  // Create _shared/middleware directory
  const middlewareDir = join(sharedDir, 'middleware');
  if (!options.dryRun) {
    await mkdir(middlewareDir, { recursive: true });
  }

  // Create custom middleware directory if needed
  if (customMiddleware.length > 0) {
    const customMiddlewareDir = join(middlewareDir, 'custom');
    if (!options.dryRun) {
      await mkdir(customMiddlewareDir, { recursive: true });
    }
  }

  // Generate deno.json configuration
  const denoConfigCode = generateDenoConfig(config);
  await writeOutput(join(outputDir, 'deno.json'), denoConfigCode, options.dryRun);
  files.push('deno.json');
  console.log('   ✓ deno.json');

  // Generate shared files
  const corsCode = generateSharedCors();
  await writeOutput(join(sharedDir, 'cors.ts'), corsCode, options.dryRun);
  files.push('_shared/cors.ts');
  console.log('   ✓ _shared/cors.ts');

  const supabaseClientCode = generateSharedSupabaseClient(target);
  await writeOutput(join(sharedDir, 'supabase.ts'), supabaseClientCode, options.dryRun);
  files.push('_shared/supabase.ts');
  console.log('   ✓ _shared/supabase.ts');

  // Generate TypeScript types
  const typesCode = generateTypes(allSchemas);
  const sharedTypesCode = generateSharedTypes(typesCode);
  await writeOutput(join(sharedDir, 'types.ts'), sharedTypesCode, options.dryRun);
  files.push('_shared/types.ts');
  console.log('   ✓ _shared/types.ts');

  // Check if using new v1.0 middleware config
  const middlewareConfig = config.middleware;
  const hasNewMiddlewareConfig = middlewareConfig !== undefined;

  // Generate middleware based on config
  if (hasNewMiddlewareConfig) {
    const generatedMiddleware = await generateMiddlewareFromConfig(
      middlewareDir,
      config,
      targetSchemas,
      customMiddleware,
      options.dryRun
    );
    files.push(...generatedMiddleware);

    // Generate middleware chain file
    const chainCode = generateEdgeMiddlewareChain(config, customMiddleware);
    await writeOutput(join(middlewareDir, 'chain.ts'), chainCode, options.dryRun);
    files.push('_shared/middleware/chain.ts');
    console.log('   ✓ _shared/middleware/chain.ts');
  }

  // Generate functions
  if (useFatFunctions) {
    // Generate a single "fat function" that handles all entities
    const functionName = target.options?.functionName as string || 'api';
    const functionDir = join(outputDir, functionName);
    if (!options.dryRun) {
      await mkdir(functionDir, { recursive: true });
    }

    const functionCode = generateFatFunctionFile(
      targetSchemas,
      target,
      config,
      functionName
    );
    await writeOutput(join(functionDir, 'index.ts'), functionCode, options.dryRun);
    files.push(`${functionName}/index.ts`);
    console.log(`   ✓ ${functionName}/index.ts (fat function for ${targetSchemas.length} entities)`);
  } else {
    // Generate separate functions for each entity
    for (const schema of targetSchemas) {
      if (schema.isJunctionTable) continue;

      const functionName = `api-${schema.pluralName}`;
      const functionDir = join(outputDir, functionName);
      if (!options.dryRun) {
        await mkdir(functionDir, { recursive: true });
      }

      const functionCode = generateEdgeFunctionFile(schema, target, config);
      await writeOutput(join(functionDir, 'index.ts'), functionCode, options.dryRun);
      files.push(`${functionName}/index.ts`);
      console.log(`   ✓ ${functionName}/index.ts`);
    }
  }

  // Generate custom endpoint edge functions
  if (endpoints.length > 0) {
    // Generate endpoint type interfaces in _shared
    const endpointTypesCode = generateAllEndpointInterfaces(endpoints);
    await writeOutput(join(sharedDir, 'endpoint-types.ts'), endpointTypesCode, options.dryRun);
    files.push('_shared/endpoint-types.ts');
    console.log('   ✓ _shared/endpoint-types.ts');

    // Generate separate edge function for each endpoint
    for (const endpoint of endpoints) {
      const functionName = deriveEdgeFunctionName(endpoint.path);
      const functionDir = join(outputDir, functionName);
      if (!options.dryRun) {
        await mkdir(functionDir, { recursive: true });
      }

      const functionCode = generateEndpointEdgeFunction(endpoint, target, config);
      await writeOutput(join(functionDir, 'index.ts'), functionCode, options.dryRun);
      files.push(`${functionName}/index.ts`);
      console.log(`   ✓ ${functionName}/index.ts (${endpoint.method} ${endpoint.path})`);
    }
  }

  // Generate seed Edge Function if production seed is configured
  if (shouldGenerateSeedHandler(config)) {
    const seedFunctionDir = join(outputDir, '_seed');
    if (!options.dryRun) {
      await mkdir(seedFunctionDir, { recursive: true });
    }

    const seedFunctionCode = generateSeedEdgeFunction(allSchemas, target, config);
    await writeOutput(join(seedFunctionDir, 'index.ts'), seedFunctionCode, options.dryRun);
    files.push('_seed/index.ts');
    console.log('   ✓ _seed/index.ts (POST /_seed)');
  }

  return files;
}

/**
 * Generate middleware files based on new v1.0 config format
 */
async function generateMiddlewareFromConfig(
  middlewareDir: string,
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
      const authCode = generateAuthMiddlewareEdge(authConfig);
      await writeOutput(join(middlewareDir, 'auth.ts'), authCode, dryRun);
      files.push('_shared/middleware/auth.ts');
      console.log('   ✓ _shared/middleware/auth.ts');
    }
  }

  // Rate limit middleware
  if (mwConfig.rateLimit) {
    const rateLimitCode = generateRateLimitMiddlewareEdge(mwConfig.rateLimit);
    await writeOutput(join(middlewareDir, 'rate-limit.ts'), rateLimitCode, dryRun);
    files.push('_shared/middleware/rate-limit.ts');
    console.log('   ✓ _shared/middleware/rate-limit.ts');
  }

  // Cache middleware
  if (mwConfig.cache) {
    const cacheConfig = normalizeCacheConfig(mwConfig.cache);
    if (cacheConfig) {
      const cacheCode = generateCacheMiddlewareEdge(cacheConfig);
      await writeOutput(join(middlewareDir, 'cache.ts'), cacheCode, dryRun);
      files.push('_shared/middleware/cache.ts');
      console.log('   ✓ _shared/middleware/cache.ts');
    }
  }

  // Logger middleware
  if (mwConfig.logger) {
    const loggerConfig = normalizeLoggerConfig(mwConfig.logger);
    if (loggerConfig) {
      const loggerCode = generateLoggerMiddlewareEdge(loggerConfig);
      await writeOutput(join(middlewareDir, 'logger.ts'), loggerCode, dryRun);
      files.push('_shared/middleware/logger.ts');
      console.log('   ✓ _shared/middleware/logger.ts');
    }
  }

  // Context middleware
  if (mwConfig.context) {
    const contextCode = generateContextMiddlewareEdge();
    await writeOutput(join(middlewareDir, 'context.ts'), contextCode, dryRun);
    files.push('_shared/middleware/context.ts');
    console.log('   ✓ _shared/middleware/context.ts');
  }

  // RLS middleware
  if (mwConfig.rls) {
    const rlsCode = generateRlsMiddlewareEdge(schemas);
    await writeOutput(join(middlewareDir, 'rls.ts'), rlsCode, dryRun);
    files.push('_shared/middleware/rls.ts');
    console.log('   ✓ _shared/middleware/rls.ts');
  }

  // Validation middleware
  if (mwConfig.validation) {
    const validationCode = generateValidationEdge(schemas);
    await writeOutput(join(middlewareDir, 'validate.ts'), validationCode, dryRun);
    files.push('_shared/middleware/validate.ts');
    console.log('   ✓ _shared/middleware/validate.ts');
  }

  // Custom middleware
  for (const mw of customMiddleware) {
    const customCode = generateCustomMiddlewareEdge(mw);
    const customDir = join(middlewareDir, 'custom');
    await writeOutput(join(customDir, `${mw.name}.ts`), customCode, dryRun);
    files.push(`_shared/middleware/custom/${mw.name}.ts`);
    console.log(`   ✓ _shared/middleware/custom/${mw.name}.ts`);
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
