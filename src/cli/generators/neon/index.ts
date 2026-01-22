/**
 * Neon Serverless Generator
 *
 * Generates handlers optimized for Neon Serverless PostgreSQL.
 * Works with Vercel Edge, Cloudflare Workers, and other edge/serverless environments.
 *
 * @module cli/generators/neon
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

import { generateHandlerFile } from './handler-template';
import { generateRouterFile } from './router-template';
import { generateNeonLibFiles } from './lib-template';
import {
  generateNeonAuthMiddleware,
  generateNeonRateLimitMiddleware,
  generateNeonCacheMiddleware,
  generateNeonLoggerMiddleware,
  generateNeonContextMiddleware,
  generateNeonRlsMiddleware,
  generateNeonValidation,
  generateNeonCustomMiddleware,
} from './middleware-template';
import {
  generateNeonMiddlewareChain,
  normalizeAuthConfig,
  normalizeLoggerConfig,
  normalizeCacheConfig,
} from './middleware-chain-template';
import { generateTypes } from '../types';

/**
 * Generate Neon Serverless handlers for entities
 *
 * Creates a project structure like:
 * output/
 *   types.ts
 *   db.ts
 *   router.ts
 *   index.ts
 *   handlers/
 *     users.ts
 *     posts.ts
 *   middleware/
 *     auth.ts
 *     cache.ts
 *     chain.ts
 *     custom/
 *       {middleware-name}.ts
 *
 * @param allSchemas - All schemas (for type generation)
 * @param targetSchemas - Filtered schemas (for handler generation)
 * @param outputDir - Output directory
 * @param target - Target configuration
 * @param config - Schemock config
 * @param options - Generation options
 * @param customMiddleware - Analyzed custom middleware definitions
 */
export async function generateNeonTarget(
  allSchemas: AnalyzedSchema[],
  targetSchemas: AnalyzedSchema[],
  outputDir: string,
  target: GenerationTarget,
  config: SchemockConfig,
  options: GenerateOptions,
  customMiddleware: AnalyzedMiddleware[] = []
): Promise<string[]> {
  const files: string[] = [];

  // Create handlers directory
  const handlersDir = join(outputDir, 'handlers');
  if (!options.dryRun) {
    await mkdir(handlersDir, { recursive: true });
  }

  // Create middleware directory
  const middlewareDir = join(outputDir, 'middleware');
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

  // Generate TypeScript types (ALL schemas to preserve relations)
  const typesCode = generateTypes(allSchemas);
  await writeOutput(join(outputDir, 'types.ts'), typesCode, options.dryRun);
  files.push('types.ts');
  console.log('   ✓ types.ts');

  // Generate Neon-specific library files
  const libFiles = generateNeonLibFiles(target, config);
  for (const [filename, content] of Object.entries(libFiles)) {
    if (filename === 'types.ts') continue; // Skip types, already generated
    await writeOutput(join(outputDir, filename), content, options.dryRun);
    files.push(filename);
    console.log(`   ✓ ${filename}`);
  }

  // Check if using new v1.0 middleware config or legacy target.middleware
  const middlewareConfig = config.middleware;
  const hasNewMiddlewareConfig = middlewareConfig !== undefined;

  // Generate middleware based on config (new v1.0 format)
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
    const chainCode = generateNeonMiddlewareChain(config, customMiddleware);
    await writeOutput(join(middlewareDir, 'chain.ts'), chainCode, options.dryRun);
    files.push('middleware/chain.ts');
    console.log('   ✓ middleware/chain.ts');
  } else {
    // Legacy middleware generation (target.middleware)
    if (target.middleware?.auth) {
      const authConfig = normalizeAuthConfig(target.middleware.auth);
      if (authConfig) {
        const authMiddleware = generateNeonAuthMiddleware(authConfig);
        await writeOutput(join(middlewareDir, 'auth.ts'), authMiddleware, options.dryRun);
        files.push('middleware/auth.ts');
        console.log('   ✓ middleware/auth.ts');
      }
    }

    // Generate validation middleware (only for target schemas)
    if (target.middleware?.validation) {
      const validationMiddleware = generateNeonValidation(targetSchemas);
      await writeOutput(join(middlewareDir, 'validate.ts'), validationMiddleware, options.dryRun);
      files.push('middleware/validate.ts');
      console.log('   ✓ middleware/validate.ts');
    }
  }

  // Generate handler files for TARGET schemas only (filtered)
  for (const schema of targetSchemas) {
    if (schema.isJunctionTable) continue;

    const handlerCode = generateHandlerFile(schema, target, config);
    await writeOutput(join(handlersDir, `${schema.pluralName}.ts`), handlerCode, options.dryRun);
    files.push(`handlers/${schema.pluralName}.ts`);
    console.log(`   ✓ handlers/${schema.pluralName}.ts`);
  }

  // Generate main router file (only includes target schemas)
  const routerCode = generateRouterFile(targetSchemas, target, config);
  await writeOutput(join(outputDir, 'router.ts'), routerCode, options.dryRun);
  files.push('router.ts');
  console.log('   ✓ router.ts (combined router)');

  // Generate index file (only exports target schemas)
  const indexCode = generateIndexFile(targetSchemas, target, config, customMiddleware);
  await writeOutput(join(outputDir, 'index.ts'), indexCode, options.dryRun);
  files.push('index.ts');
  console.log('   ✓ index.ts');

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
      const authCode = generateNeonAuthMiddleware(authConfig);
      await writeOutput(join(middlewareDir, 'auth.ts'), authCode, dryRun);
      files.push('middleware/auth.ts');
      console.log('   ✓ middleware/auth.ts');
    }
  }

  // Rate limit middleware
  if (mwConfig.rateLimit) {
    const rateLimitCode = generateNeonRateLimitMiddleware(mwConfig.rateLimit);
    await writeOutput(join(middlewareDir, 'rate-limit.ts'), rateLimitCode, dryRun);
    files.push('middleware/rate-limit.ts');
    console.log('   ✓ middleware/rate-limit.ts');
  }

  // Cache middleware
  if (mwConfig.cache) {
    const cacheConfig = normalizeCacheConfig(mwConfig.cache);
    if (cacheConfig) {
      const cacheCode = generateNeonCacheMiddleware(cacheConfig);
      await writeOutput(join(middlewareDir, 'cache.ts'), cacheCode, dryRun);
      files.push('middleware/cache.ts');
      console.log('   ✓ middleware/cache.ts');
    }
  }

  // Logger middleware
  if (mwConfig.logger) {
    const loggerConfig = normalizeLoggerConfig(mwConfig.logger);
    if (loggerConfig) {
      const loggerCode = generateNeonLoggerMiddleware(loggerConfig);
      await writeOutput(join(middlewareDir, 'logger.ts'), loggerCode, dryRun);
      files.push('middleware/logger.ts');
      console.log('   ✓ middleware/logger.ts');
    }
  }

  // Context middleware
  if (mwConfig.context) {
    const contextCode = generateNeonContextMiddleware();
    await writeOutput(join(middlewareDir, 'context.ts'), contextCode, dryRun);
    files.push('middleware/context.ts');
    console.log('   ✓ middleware/context.ts');
  }

  // RLS middleware
  if (mwConfig.rls) {
    const rlsCode = generateNeonRlsMiddleware(schemas);
    await writeOutput(join(middlewareDir, 'rls.ts'), rlsCode, dryRun);
    files.push('middleware/rls.ts');
    console.log('   ✓ middleware/rls.ts');
  }

  // Validation middleware
  if (mwConfig.validation) {
    const validationCode = generateNeonValidation(schemas);
    await writeOutput(join(middlewareDir, 'validate.ts'), validationCode, dryRun);
    files.push('middleware/validate.ts');
    console.log('   ✓ middleware/validate.ts');
  }

  // Custom middleware
  for (const mw of customMiddleware) {
    const customCode = generateNeonCustomMiddleware(mw);
    const customDir = join(middlewareDir, 'custom');
    await writeOutput(join(customDir, `${mw.name}.ts`), customCode, dryRun);
    files.push(`middleware/custom/${mw.name}.ts`);
    console.log(`   ✓ middleware/custom/${mw.name}.ts`);
  }

  return files;
}

/**
 * Generate index file
 */
function generateIndexFile(
  schemas: AnalyzedSchema[],
  target: GenerationTarget,
  config: SchemockConfig,
  customMiddleware: AnalyzedMiddleware[] = []
): string {
  const lines: string[] = [
    '// GENERATED BY SCHEMOCK - DO NOT EDIT',
    '',
    "export * from './types';",
    "export { router, createRouter } from './router';",
    "export { sql, neon, getPool } from './db';",
  ];

  // Export handlers
  for (const schema of schemas) {
    if (schema.isJunctionTable) continue;
    lines.push(`export * as ${schema.pluralName}Handlers from './handlers/${schema.pluralName}';`);
  }

  // Check if using new config format
  const mwConfig = config.middleware;

  if (mwConfig) {
    // Export middleware chain (new format)
    lines.push("export { applyMiddleware, middleware, middlewareOrder } from './middleware/chain';");

    // Export individual middleware
    if (mwConfig.auth) {
      lines.push("export { authMiddleware } from './middleware/auth';");
    }
    if (mwConfig.rateLimit) {
      lines.push("export { rateLimitMiddleware } from './middleware/rate-limit';");
    }
    if (mwConfig.cache) {
      lines.push("export { cacheMiddleware, invalidateCache } from './middleware/cache';");
    }
    if (mwConfig.logger) {
      lines.push("export { loggerMiddleware } from './middleware/logger';");
    }
    if (mwConfig.context) {
      lines.push("export { contextMiddleware } from './middleware/context';");
    }
    if (mwConfig.rls) {
      lines.push("export { rlsMiddleware, applyRLSFilter, checkRLSPermission } from './middleware/rls';");
    }
    if (mwConfig.validation) {
      lines.push("export * from './middleware/validate';");
    }

    // Export custom middleware
    for (const mw of customMiddleware) {
      lines.push(`export { ${mw.name}Middleware } from './middleware/custom/${mw.name}';`);
    }
  } else {
    // Legacy middleware exports
    if (target.middleware?.auth) {
      lines.push("export { authMiddleware } from './middleware/auth';");
    }
    if (target.middleware?.validation) {
      lines.push("export * from './middleware/validate';");
    }
  }

  return lines.join('\n');
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
