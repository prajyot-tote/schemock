/**
 * Configuration loader for Schemock CLI
 *
 * @module cli/config
 * @category CLI
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import type { SchemockConfig } from './types';

// ============================================================================
// Zod Schema for Config Validation
// ============================================================================

/**
 * Zod schema for FakerMapping validation
 */
const FakerMappingSchema = z.object({
  hint: z.string().optional(),
  type: z.string().optional(),
  fieldName: z.instanceof(RegExp).optional(),
  call: z.string(),
});

/**
 * Zod schema for MockAdapterConfig validation
 */
const MockAdapterConfigSchema = z.object({
  seed: z.record(z.string(), z.number()).optional(),
  delay: z.number().min(0).optional(),
  fakerSeed: z.number().optional(),
  persistence: z.enum(['memory', 'localStorage']).optional(),
  storageKey: z.string().optional(),
}).strict();

/**
 * Zod schema for SupabaseAdapterConfig validation
 */
const SupabaseAdapterConfigSchema = z.object({
  tableMap: z.record(z.string(), z.string()).optional(),
  envPrefix: z.string().optional(),
  migrations: z.boolean().optional(),
  migrationsDir: z.string().optional(),
}).strict();

/**
 * Zod schema for FirebaseAdapterConfig validation
 */
const FirebaseAdapterConfigSchema = z.object({
  collectionMap: z.record(z.string(), z.string()).optional(),
}).strict();

/**
 * Zod schema for FetchAdapterConfig validation
 */
const FetchAdapterConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  endpointPattern: z.string().optional(),
}).strict();

/**
 * Zod schema for GraphQLAdapterConfig validation
 */
const GraphQLAdapterConfigSchema = z.object({
  operations: z.object({
    findOne: z.string().optional(),
    findMany: z.string().optional(),
    create: z.string().optional(),
    update: z.string().optional(),
    delete: z.string().optional(),
  }).optional(),
}).strict();

/**
 * Zod schema for PGliteAdapterConfig validation
 */
const PGliteAdapterConfigSchema = z.object({
  persistence: z.enum(['memory', 'indexeddb', 'opfs']).optional(),
  dataDir: z.string().optional(),
  fakerSeed: z.number().optional(),
  seed: z.record(z.string(), z.number()).optional(),
}).strict();

/**
 * Zod schema for PluralizeConfig validation
 */
const PluralizeConfigSchema = z.object({
  custom: z.record(z.string(), z.string()).optional(),
}).strict();

/**
 * Zod schema for AuthProviderConfig validation
 */
const AuthProviderConfigSchema = z.object({
  provider: z.enum(['supabase-auth', 'jwt', 'nextauth', 'clerk', 'custom']),
  secretEnvVar: z.string().optional(),
  customHandler: z.string().optional(),
}).strict();

/**
 * Zod schema for TargetMiddlewareConfig validation (legacy)
 */
const TargetMiddlewareConfigSchema = z.object({
  chain: z.array(z.string()).optional(),
  auth: AuthProviderConfigSchema.optional(),
  validation: z.boolean().optional(),
  rateLimit: z.object({
    max: z.number().positive(),
    windowMs: z.number().positive(),
  }).optional(),
}).strict();

/**
 * Zod schema for FrontendConfig validation (v1.0)
 */
const FrontendConfigSchema = z.object({
  framework: z.enum(['react', 'vue', 'svelte', 'none']),
  adapter: z.enum(['mock', 'supabase', 'firebase', 'fetch', 'pglite']),
  output: z.string().optional(),
}).strict();

/**
 * Zod schema for BackendConfig validation (v1.0)
 */
const BackendConfigSchema = z.object({
  framework: z.enum(['node', 'nextjs', 'supabase-edge', 'neon']),
  output: z.string(),
  database: z.object({
    type: z.enum(['postgres', 'supabase', 'neon']),
    connectionEnvVar: z.string().optional(),
  }).optional(),
}).strict();

/**
 * Zod schema for AuthMiddlewareConfig validation (v1.0)
 */
const AuthMiddlewareConfigSchema = z.object({
  provider: z.enum(['supabase-auth', 'jwt', 'nextauth', 'clerk', 'custom']),
  required: z.boolean().optional(),
  secretEnvVar: z.string().optional(),
  customHandler: z.string().optional(),
  skip: z.array(z.string()).optional(),
}).strict();

/**
 * Zod schema for RateLimitMiddlewareConfig validation (v1.0)
 */
const RateLimitMiddlewareConfigSchema = z.object({
  max: z.number().positive(),
  windowMs: z.number().positive(),
  keyGenerator: z.enum(['ip', 'user', 'custom']).optional(),
  customKeyGenerator: z.string().optional(),
}).strict();

/**
 * Zod schema for CacheMiddlewareConfig validation (v1.0)
 */
const CacheMiddlewareConfigSchema = z.object({
  ttl: z.number().positive(),
  operations: z.array(z.string()).optional(),
  storage: z.enum(['memory', 'redis']).optional(),
  redisEnvVar: z.string().optional(),
}).strict();

/**
 * Zod schema for LoggerMiddlewareConfig validation (v1.0)
 */
const LoggerMiddlewareConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  includeBody: z.boolean().optional(),
  includeResponse: z.boolean().optional(),
  redactFields: z.array(z.string()).optional(),
}).strict();

/**
 * Zod schema for unified MiddlewareConfig validation (v1.0)
 */
const MiddlewareConfigSchema = z.object({
  chain: z.array(z.string()).optional(),
  auth: z.union([AuthMiddlewareConfigSchema, z.boolean()]).optional(),
  rateLimit: RateLimitMiddlewareConfigSchema.optional(),
  cache: z.union([CacheMiddlewareConfigSchema, z.boolean()]).optional(),
  logger: z.union([LoggerMiddlewareConfigSchema, z.boolean()]).optional(),
  validation: z.boolean().optional(),
  context: z.boolean().optional(),
  rls: z.boolean().optional(),
  custom: z.array(z.string()).optional(),
}).strict();

/**
 * Zod schema for GenerationTarget validation
 */
const GenerationTargetSchema = z.object({
  name: z.string().min(1, 'target name is required'),
  type: z.enum([
    'mock',
    'supabase',
    'firebase',
    'fetch',
    'graphql',
    'pglite',
    'nextjs-api',
    'nextjs-edge',
    'express',
    'hono',
    'node-handlers',
    'supabase-edge',
    'neon',
  ]),
  output: z.string().min(1, 'target output path is required'),
  entities: z.array(z.string()).optional(),
  excludeEntities: z.array(z.string()).optional(),
  // Tag-based filtering
  tags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  module: z.string().optional(),
  group: z.string().optional(),
  backend: z.enum(['supabase', 'firebase', 'pglite', 'fetch']).optional(),
  framework: z.enum(['react', 'none']).optional(),
  middleware: TargetMiddlewareConfigSchema.optional(),
  hooks: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).strict();

/**
 * Zod schema for complete SchemockConfig validation
 *
 * Uses .strict() on nested objects to catch typos in config keys
 */
const SchemockConfigSchema = z.object({
  schemas: z.string().min(1, 'schemas path is required'),
  output: z.string().min(1, 'output path is required'),
  adapter: z.enum(['mock', 'supabase', 'firebase', 'fetch', 'graphql', 'pglite']),
  apiPrefix: z.string(),
  pluralization: PluralizeConfigSchema.optional(),
  fakerMappings: z.array(FakerMappingSchema).optional(),
  adapters: z.object({
    mock: MockAdapterConfigSchema.optional(),
    supabase: SupabaseAdapterConfigSchema.optional(),
    firebase: FirebaseAdapterConfigSchema.optional(),
    fetch: FetchAdapterConfigSchema.optional(),
    graphql: GraphQLAdapterConfigSchema.optional(),
    pglite: PGliteAdapterConfigSchema.optional(),
  }).optional(),
  targets: z.array(GenerationTargetSchema).optional(),
  // New v1.0 configuration format
  frontend: FrontendConfigSchema.optional(),
  backend: BackendConfigSchema.optional(),
  middleware: MiddlewareConfigSchema.optional(),
}).strict();

/**
 * Validate configuration object and return typed result
 *
 * @param config - Raw config object to validate
 * @param filePath - Path to config file (for error messages)
 * @returns Validated SchemockConfig
 * @throws Error if validation fails with detailed message
 */
function validateConfig(config: unknown, filePath: string): SchemockConfig {
  const result = SchemockConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors.map((err) => {
      const path = err.path.join('.');
      return `  - ${path ? `${path}: ` : ''}${err.message}`;
    }).join('\n');

    throw new Error(
      `Invalid configuration in ${filePath}:\n${errors}\n\n` +
      `Common issues:\n` +
      `  - Typos in config keys (e.g., 'scemas' instead of 'schemas')\n` +
      `  - Unknown adapter types\n` +
      `  - Invalid adapter-specific options`
    );
  }

  return result.data as SchemockConfig;
}

/**
 * Config file names to search for (in order of priority)
 */
const CONFIG_FILES = ['schemock.config.ts', 'schemock.config.js', 'schemock.config.mjs'];

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SchemockConfig = {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',
  apiPrefix: '/api',
};

/**
 * Load Schemock configuration from file or return defaults
 *
 * @param configPath - Optional explicit path to config file
 * @returns Loaded configuration merged with defaults
 *
 * @example
 * ```typescript
 * // Load from default location
 * const config = await loadConfig();
 *
 * // Load from specific path
 * const config = await loadConfig('./my-config.ts');
 * ```
 */
export async function loadConfig(configPath?: string): Promise<SchemockConfig> {
  // If explicit path provided, use it
  if (configPath) {
    const fullPath = resolve(configPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return await loadConfigFile(fullPath);
  }

  // Search for config file in current directory
  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(filename);
    if (existsSync(fullPath)) {
      return await loadConfigFile(fullPath);
    }
  }

  // Return defaults if no config file found
  return { ...DEFAULT_CONFIG };
}

/**
 * Load and parse a config file
 */
async function loadConfigFile(fullPath: string): Promise<SchemockConfig> {
  let rawConfig: unknown;

  try {
    // For TypeScript files, we need to use tsx or ts-node
    // For now, we'll try dynamic import which works for JS/MJS
    // and compiled TS files
    const module = await import(fullPath);
    rawConfig = module.default || module;
  } catch (error) {
    // If import fails, it might be a TS file that needs compilation
    // Try using tsx if available
    try {
      rawConfig = loadConfigViaTsx(fullPath);
    } catch (tsxError) {
      throw new Error(
        `Failed to load config file: ${fullPath}\n` +
        `Original error: ${error}\n` +
        `tsx fallback error: ${tsxError}\n\n` +
        `Suggestions:\n` +
        `  1. Ensure the config file has valid syntax\n` +
        `  2. Install tsx globally: npm install -g tsx\n` +
        `  3. Or compile TypeScript config to JavaScript first`
      );
    }
  }

  // Merge with defaults first
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...rawConfig as Record<string, unknown>,
  };

  // Validate the merged config using Zod schema
  return validateConfig(mergedConfig, fullPath);
}

/**
 * Load config file via tsx (TypeScript executor)
 * Uses spawnSync with array arguments to prevent shell injection
 *
 * @param fullPath - Absolute path to the config file
 * @returns Parsed config object
 */
function loadConfigViaTsx(fullPath: string): SchemockConfig {
  // Build the inline script to execute
  // Note: We pass the path as a separate argument and read it via process.argv
  // This prevents any shell injection as the path is never interpolated into a shell command
  const inlineScript = `
    const path = process.argv[2];
    const c = require(path);
    console.log(JSON.stringify(c.default || c));
  `;

  // Use spawnSync with array arguments - this bypasses the shell entirely
  // and passes arguments directly to the process, preventing injection
  const result = spawnSync('npx', ['tsx', '-e', inlineScript, fullPath], {
    encoding: 'utf-8',
    // Don't use shell - pass args directly to avoid injection
    shell: false,
    // Set reasonable timeout to prevent hanging
    timeout: 30000,
  });

  if (result.error) {
    throw new Error(`Failed to execute tsx: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || 'Unknown error';
    throw new Error(`tsx exited with code ${result.status}: ${stderr}`);
  }

  const output = result.stdout?.trim();
  if (!output) {
    throw new Error('tsx produced no output');
  }

  try {
    return JSON.parse(output) as SchemockConfig;
  } catch (parseError) {
    throw new Error(`Failed to parse config output as JSON: ${output}`);
  }
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): SchemockConfig {
  return { ...DEFAULT_CONFIG };
}
